import argparse
import asyncio
from pathlib import Path
import time

import httpx

from .motion import DemoMotion, RouteMotion


class VehicleClient:
    """保存同輪位置與任務；HTTP 回應不覆寫已推進的進度。"""

    def __init__(self, vehicle, demo=False):
        self.vehicle_id = vehicle["id"]
        self.demo = demo
        self.run_id = None
        self.connected = False
        self.task = None
        self.motion = None
        self.phase = None
        self.progress = 0.0
        self.position = list(vehicle["initial_position"])
        self.heading = vehicle["initial_heading"]
        self.interval = 1.0
        self.multiplier = 60.0

    def reset(self, run_id, vehicle):
        self.run_id = run_id
        self.position = list(vehicle["initial_position"])
        self.heading = vehicle["initial_heading"]
        self.task = None
        self.phase = None
        self.progress = 0.0
        self.motion = DemoMotion(self.position) if self.demo else None
        print(f"{self.vehicle_id} 輪次 {run_id}，回到初始位置。", flush=True)

    def settings(self, settings):
        self.interval = settings["report_interval_seconds"]
        self.multiplier = settings["speed_multiplier"]

    def accept_task(self, task):
        if self.demo or self.task is not None or task is None:
            return
        if task["status"] in ("completed", "failed") or not task.get("pickup_route"):
            return
        self.task = task
        self.phase = "pickup"
        self.progress = 0.0
        self.motion = RouteMotion(task["pickup_route"])
        print(f"{self.vehicle_id} 任務 {task['id']}，前往接人。", flush=True)

    def advance(self, elapsed):
        if self.motion is None or self.phase == "completed":
            return
        if not self.connected and (self.demo or self.phase != "transport"):
            return
        self.position, self.heading = self.motion.advance(elapsed, self.multiplier)
        if self.demo:
            return
        self.progress = self.motion.progress
        if self.progress < 1:
            return
        if self.phase == "pickup":
            self.position = list(self.task["pickup"])
            self.phase = "transport"
            self.progress = 0.0
            self.motion = RouteMotion(self.task["transport_route"])
            print(f"{self.vehicle_id} 已接人，載客行駛。", flush=True)
        else:
            self.position = list(self.task["destination"])
            self.phase = "completed"
            print(f"{self.vehicle_id} 已送達，等待 Server 確認。", flush=True)

    def report(self):
        report = {"run_id": self.run_id, "position": list(self.position), "heading": self.heading}
        if self.demo:
            report["diagnostic"] = True
        elif self.task:
            report.update(task_id=self.task["id"], phase=self.phase, progress=self.progress)
        return report

    def acknowledge(self, result):
        if self.task and result.get("completed_task_id") == self.task["id"]:
            print(f"{self.vehicle_id} 任務 {self.task['id']} 已確認完成。", flush=True)
            self.task = None
            self.motion = None
            self.phase = None
            self.progress = 0.0


def blocked(path, vehicle_id):
    # 診斷檔每行填車輛 id；刪除該行即可恢復同輪 HTTP。
    return path is not None and path.exists() and vehicle_id in path.read_text(encoding="utf-8-sig").split()


async def drive(state, block_file):
    previous = time.monotonic()
    while True:
        now = time.monotonic()
        if blocked(block_file, state.vehicle_id):
            state.connected = False
        state.advance(now - previous)
        previous = now
        await asyncio.sleep(0.05)


async def communicate(client, state, block_file):
    while True:
        tick = time.monotonic()
        try:
            if blocked(block_file, state.vehicle_id):
                raise httpx.ConnectError("診斷檔阻斷 HTTP")
            response = await client.get(f"/api/vehicles/{state.vehicle_id}/task")
            response.raise_for_status()
            command = response.json()
            if state.run_id != command["run_id"]:
                response = await client.get("/api/simulation")
                response.raise_for_status()
                snapshot = response.json()
                if snapshot["run_id"] != command["run_id"]:
                    continue
                vehicle = next((item for item in snapshot["vehicles"] if item["id"] == state.vehicle_id), None)
                if vehicle is None:
                    raise ValueError(f"Server 未設定車輛 {state.vehicle_id}。")
                state.reset(snapshot["run_id"], vehicle)
            state.settings(command["settings"])
            # 先核對原任務才恢復接人；載客或已送達保留 Client 目前進度。
            task = command["task"]
            if state.task and state.phase == "pickup" and (task is None or task["id"] != state.task["id"]):
                raise httpx.HTTPError("原接人任務尚未核對，保持暫停")
            state.accept_task(task)
            report = state.report()
            response = await client.post(f"/api/vehicles/{state.vehicle_id}/reports", json=report)
            response.raise_for_status()
            result = response.json()
            state.settings(result["settings"])
            state.acknowledge(result)
            state.connected = True
            print(f"{state.vehicle_id} {state.phase or 'idle'} {state.progress:.3f}  {state.position[0]:.6f}, {state.position[1]:.6f}", flush=True)
        except httpx.HTTPError as error:
            if state.connected:
                print(f"{state.vehicle_id} HTTP 中斷：{error}。", flush=True)
            state.connected = False
        await asyncio.sleep(max(0, state.interval - (time.monotonic() - tick)))


async def run(server_url, vehicle_id=None, demo=False, block_file=None):
    async with httpx.AsyncClient(base_url=server_url.rstrip("/"), timeout=5.0, trust_env=False) as client:
        while True:
            try:
                response = await client.get("/api/simulation")
                response.raise_for_status()
                snapshot = response.json()
                break
            except httpx.HTTPError as error:
                print(f"HTTP 連線失敗：{error}；稍後重試。", flush=True)
                await asyncio.sleep(1)
        vehicles = [item for item in snapshot["vehicles"] if vehicle_id is None or item["id"] == vehicle_id]
        if not vehicles:
            raise ValueError(f"Server 未設定車輛 {vehicle_id}。")
        coroutines = []
        for vehicle in vehicles:
            state = VehicleClient(vehicle, demo)
            coroutines.extend((drive(state, block_file), communicate(client, state, block_file)))
        await asyncio.gather(*coroutines)


def main():
    parser = argparse.ArgumentParser(description="透過 HTTP 模擬 Server 設定的車隊接送。")
    parser.add_argument("--server", default="http://127.0.0.1:8000", help="Server HTTP URL")
    parser.add_argument("--vehicle-id", help="只啟動指定車輛；省略時啟動設定中的全部車輛")
    parser.add_argument("--demo", action="store_true", help="診斷方形移動；不受理接送任務")
    parser.add_argument("--block-http-file", type=Path, help="人工斷線診斷檔，每行填需阻斷 HTTP 的車輛 id")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.server, args.vehicle_id, args.demo, args.block_http_file))
    except KeyboardInterrupt:
        print("\n車輛 Client 已停止。")
    except ValueError as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
