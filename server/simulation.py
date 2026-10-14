import asyncio
import json
import os
import random
import tempfile
from datetime import datetime, timezone
from time import monotonic
from uuid import uuid4

from fastapi import HTTPException

from .dispatch import choose_vehicle, distance_meters
from .routes import RouteError
from .schemas import RideRequestInput, RouteQuery


class Simulation:
    def __init__(self, settings, planner):
        self.settings = settings
        self.planner = planner
        self.run_id = uuid4()
        self.lock = asyncio.Lock()
        self.requests = {}
        self.tasks = {}
        self.idempotency = {}
        self.random_request_intents = {}
        self.jobs = set()
        self.clocks = {}
        self.vehicles = {item.id: {**item.model_dump(), 'position': item.initial_position, 'heading': item.initial_heading, 'last_report_at': None, 'task_id': None, 'diagnostic': False} for item in settings.vehicles}

    def online(self, vehicle_id):
        clock = self.clocks.get(vehicle_id)
        return clock is not None and monotonic() - clock < self.settings.offline_threshold_seconds

    def task_view(self, task):
        if task is None:
            return None
        uncertain = task['status'] in ('planning', 'pickup', 'transport') and not self.online(task['vehicle_id'])
        return {**task, 'status': 'unconfirmed' if uncertain else task['status']}

    def request_view(self, request):
        task = self.tasks.get(request['task_id'])
        view = self.task_view(task)
        return {**request, 'status': view['status'] if view and view['status'] == 'unconfirmed' else request['status']}

    def vehicle_view(self, vehicle):
        return {**vehicle, 'connection_status': 'online' if self.online(vehicle['id']) else 'offline'}

    def snapshot(self):
        return {'run_id': self.run_id, 'settings': self.settings, 'vehicles': [self.vehicle_view(item) for item in self.vehicles.values()], 'requests': [self.request_view(item) for item in self.requests.values()], 'tasks': [self.task_view(item) for item in self.tasks.values()]}

    def passenger_requests(self, passenger_id):
        requests = [item for item in self.requests.values() if item['passenger_id'] == passenger_id]
        active = [item for item in requests if item['status'] not in ('completed', 'failed', 'cancelled')]
        current = max(active or requests, key=lambda item: item['sequence'], default=None)
        return {'run_id': self.run_id, 'requests': [self.request_view(current)] if current else []}

    def vehicle_command(self, vehicle_id):
        vehicle = self.vehicles.get(vehicle_id)
        if vehicle is None:
            raise HTTPException(404, '車輛不存在。')
        task = self.tasks.get(vehicle['task_id'])
        return {'run_id': self.run_id, 'settings': self.settings, 'task': self.task_view(task) if task and task['status'] != 'planning' else None}

    async def set_speed(self, multiplier):
        async with self.lock:
            self.settings = self.settings.model_copy(update={'speed_multiplier': multiplier})
            return {'run_id': self.run_id, 'settings': self.settings}

    async def set_intervals(self, report_interval, poll_interval, config_path):
        async with self.lock:
            if report_interval >= self.settings.offline_threshold_seconds:
                raise HTTPException(422, '車輛回報間隔必須小於離線門檻。')
            updated = self.settings.model_copy(update={
                'report_interval_seconds': report_interval,
                'poll_interval_seconds': poll_interval,
            })
            try:
                content = json.loads(config_path.read_text(encoding='utf-8'))
                content['report_interval_seconds'] = report_interval
                content['poll_interval_seconds'] = poll_interval
                temporary = None
                with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=config_path.parent, delete=False) as file:
                    temporary = file.name
                    json.dump(content, file, ensure_ascii=False, indent=2)
                    file.write('\n')
                os.replace(temporary, config_path)
            except (OSError, ValueError, TypeError) as error:
                if 'temporary' in locals() and temporary and os.path.exists(temporary):
                    try:
                        os.unlink(temporary)
                    except OSError:
                        pass
                raise HTTPException(500, '設定保存失敗，原設定未變更。') from error
            self.settings = updated
            return {'run_id': self.run_id, 'settings': self.settings}

    def dispatch(self):
        # 呼叫者持有同一把鎖，取消與保留車輛只有一種成功結果。
        for request in self.requests.values():
            if request['status'] != 'waiting':
                continue
            vehicle = choose_vehicle(request, self.vehicles, self.online)
            if vehicle is None:
                continue
            task_id = str(uuid4())
            request.update(status='planning', task_id=task_id, vehicle_id=vehicle['id'])
            vehicle['task_id'] = task_id
            task = {'id': task_id, 'request_id': request['id'], 'vehicle_id': vehicle['id'], 'status': 'planning', 'phase': 'pickup', 'progress': 0.0, 'pickup': request['pickup'], 'destination': request['destination'], 'passenger_count': request['passenger_count'], 'pickup_route': None, 'transport_route': None, 'failure_reason': None, 'completed_at': None}
            self.tasks[task_id] = task
            job = asyncio.create_task(self.plan_task(task, vehicle['position']))
            self.jobs.add(job)
            job.add_done_callback(self.jobs.discard)

    async def plan_task(self, task, origin):
        try:
            pickup = await self.planner.plan(RouteQuery(origin=origin, destination=task['pickup']))
            transport = await self.planner.plan(RouteQuery(origin=task['pickup'], destination=task['destination']))
            async with self.lock:
                task.update(status='pickup', pickup_route=pickup, transport_route=transport)
                self.requests[task['request_id']]['status'] = 'pickup'
        except RouteError as error:
            async with self.lock:
                task.update(status='failed', failure_reason=str(error))
                self.requests[task['request_id']].update(status='failed', failure_reason=str(error))
                vehicle = self.vehicles[task['vehicle_id']]
                if vehicle['task_id'] == task['id']:
                    vehicle['task_id'] = None
                self.dispatch()

    def submission_identity(self, data):
        if data.run_id is not None and data.run_id != self.run_id:
            raise HTTPException(409, '模擬輪次已變更，請重新取得 Server 資料。')
        key = (data.passenger_id, data.client_request_id) if data.client_request_id else None
        existing_id = self.idempotency.get(key) if key else None
        existing = self.request_view(self.requests[existing_id]) if existing_id else None
        return key, existing

    def has_active_request(self, passenger_id):
        return any(item['passenger_id'] == passenger_id and item['status'] not in ('completed', 'failed', 'cancelled') for item in self.requests.values())

    async def submit(self, data):
        async with self.lock:
            key, existing = self.submission_identity(data)
            return existing if existing is not None else self.create_request_locked(data, key)

    def create_request_locked(self, data, key):
        if self.has_active_request(data.passenger_id):
            raise HTTPException(409, '已有尚未結束的乘車請求。')
        if data.passenger_count > max(item['passenger_capacity'] for item in self.vehicles.values()):
            raise HTTPException(422, '乘車人數超過車隊最大載客上限。')
        request = {**data.model_dump(), 'id': str(uuid4()), 'sequence': len(self.requests) + 1, 'status': 'waiting', 'task_id': None, 'vehicle_id': None, 'failure_reason': None, 'created_at': datetime.now(timezone.utc)}
        self.requests[request['id']] = request
        if key:
            self.idempotency[key] = request['id']
        self.dispatch()
        return self.request_view(request)


    async def submit_random(self, data):
        async with self.lock:
            key, existing = self.submission_identity(data)
            if existing is not None:
                return existing
            bounds = self.settings.random_requests
            if self.has_active_request(data.passenger_id):
                raise HTTPException(409, '已有尚未結束的乘車請求。')
            intent = self.random_request_intents.get(key) if key else None
            if intent is None:
                for _ in range(bounds.max_attempts):
                    pickup = (random.uniform(bounds.longitude_min, bounds.longitude_max), random.uniform(bounds.latitude_min, bounds.latitude_max))
                    destination = (random.uniform(bounds.longitude_min, bounds.longitude_max), random.uniform(bounds.latitude_min, bounds.latitude_max))
                    if distance_meters(pickup, destination) >= bounds.minimum_distance_meters:
                        intent = (pickup, destination, random.randint(1, max(item['passenger_capacity'] for item in self.vehicles.values())))
                        if key:
                            self.random_request_intents[key] = intent
                        break
                if intent is None:
                    raise HTTPException(422, '隨機起訖抽樣已達上限，未提出乘車請求。')
            pickup, destination, passenger_count = intent
            return self.create_request_locked(RideRequestInput(**data.model_dump(), pickup=pickup, destination=destination, passenger_count=passenger_count), key)

    async def cancel(self, request_id, passenger_id):
        async with self.lock:
            request = self.requests.get(request_id)
            if request is None or request['passenger_id'] != passenger_id:
                raise HTTPException(404, '乘車請求不存在。')
            if request['status'] != 'waiting':
                raise HTTPException(409, '只有等待派車的請求可以取消。')
            request['status'] = 'cancelled'
            return self.request_view(request)

    async def report(self, vehicle_id, report):
        async with self.lock:
            if report.run_id != self.run_id:
                raise HTTPException(409, '模擬輪次已變更，請重新取得 Server 資料。')
            vehicle = self.vehicles.get(vehicle_id)
            if vehicle is None:
                raise HTTPException(404, '車輛不存在。')
            if report.diagnostic and vehicle['task_id'] is not None:
                raise HTTPException(409, '執行接送中的車輛不能切換道路診斷。')
            task = self.tasks.get(report.task_id)
            completed_id = None
            if report.task_id:
                if task is None or task['vehicle_id'] != vehicle_id:
                    raise HTTPException(409, '接送任務與車輛不相符。')
                if task['status'] == 'completed' and report.phase == 'completed':
                    # 舊完成重送僅回覆確認，不改新任務、位置或連線時間。
                    return self.report_response(vehicle, task['id'])
                if vehicle['task_id'] != report.task_id or task['status'] not in ('pickup', 'transport'):
                    raise HTTPException(409, '接送任務目前不可回報。')
                order = {'pickup': 0, 'transport': 1, 'completed': 2}
                if order[report.phase] < order[task['phase']] or (report.phase == task['phase'] and report.progress < task['progress']):
                    raise HTTPException(409, '接送進度不得回退。')
                if report.phase == 'completed':
                    terminal = task['transport_route'].coordinates[-1]
                    if report.progress != 1 or min(distance_meters(report.position, terminal), distance_meters(report.position, task['destination'])) > 50:
                        raise HTTPException(409, '送達回報尚未到達送人路線終點。')
                    task.update(status='completed', phase='completed', progress=1.0, completed_at=datetime.now(timezone.utc))
                    self.requests[task['request_id']]['status'] = 'completed'
                    vehicle['task_id'] = None
                    completed_id = task['id']
                else:
                    task.update(status=report.phase, phase=report.phase, progress=report.progress)
                    self.requests[task['request_id']]['status'] = report.phase
            elif vehicle['task_id'] and self.tasks[vehicle['task_id']]['status'] != 'planning':
                raise HTTPException(409, '請先取得並核對目前接送任務。')
            vehicle.update(position=report.position, heading=report.heading, diagnostic=report.diagnostic, last_report_at=datetime.now(timezone.utc))
            self.clocks[vehicle_id] = monotonic()
            self.dispatch()
            return self.report_response(vehicle, completed_id)

    def report_response(self, vehicle, completed_id=None):
        task = self.tasks.get(vehicle['task_id'])
        return {'run_id': self.run_id, 'settings': self.settings, 'vehicle': self.vehicle_view(vehicle), 'task': self.task_view(task) if task and task['status'] != 'planning' else None, 'completed_task_id': completed_id}

    async def close(self):
        for job in tuple(self.jobs):
            job.cancel()
        await asyncio.gather(*self.jobs, return_exceptions=True)
