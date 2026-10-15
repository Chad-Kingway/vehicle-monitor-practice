import { DestroyRef, Injectable, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import { timer as rxTimer, type Subscription } from 'rxjs';
import { ApiService, type ApiError } from './api.service';
import { createVehicleMap, type VehicleMap } from '../vehicle-map.js';
import type { UiState, UiActions, Snapshot, RideRequest, TransportTask, Vehicle, RoadRoute, SimulationSettings, Position } from './models';
type BaseState = Omit<UiState, 'selectedVehicle' | 'selectedTask' | 'currentRequest' | 'pending' | 'canEditTrip' | 'canSubmit' | 'canCancel'>;
interface PendingRequest {
    run_id: string;
    endpoint: string;
    payload: {
        passenger_id: string | null;
        run_id: string;
        client_request_id: string;
        pickup?: Position | null;
        destination?: Position | null;
        passenger_count?: number;
    };
}
interface Trip {
    request: RideRequest | null;
    task: TransportTask | null;
    vehicle: Vehicle | null;
}
const terminal = (request: RideRequest | null) => !request || ['completed', 'failed', 'cancelled'].includes(request.status);
const uncertain = (error: ApiError) => !error.status || error.status >= 500 || [408, 429].includes(error.status);
function position(point: Position): Position {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)
        throw new Error('座標須為有效的 [經度, 緯度]。');
    return [...point];
}
/** 工作區持有的狀態服務；Angular 元件只讀取 signal 並呼叫操作。 */
@Injectable()
export class SimulationService {
    private readonly http = inject(ApiService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly current: WritableSignal<UiState>;
    readonly state: Signal<UiState>;
    readonly mountMap: (container: HTMLElement) => Promise<void>;
    readonly passengerUrl: (options?: {
        random?: boolean;
    }) => string;
    private api = this.http.request.bind(this.http);
    private mapController = new AbortController();
    private destroyed = false;
    private params = new URLSearchParams(location.search);
    private passengerId = this.params.get("passenger") || null;
    private mode: 'passenger' | 'monitor' = this.passengerId ? "passenger" : "monitor";
    private pendingKey = "vehicle-monitor.pending-request." + this.passengerId;
    private autoRandom = this.passengerId && this.params.get("random") === "1";
    private rawState: BaseState = {
        mode: this.mode,
        passengerId: this.passengerId,
        routeCheck: this.params.has("route-check"),
        connection: "idle", snapshot: null, selectedVehicleId: null, following: false,
        points: { pickup: null, destination: null }, busy: false, error: null, message: "",
        map: { status: "idle", message: "", error: null, preferences: null }, route: null,
    };
    private pending = this.readPending();
    private running = false;
    private generation = 0;
    private revision = 0;
    private timer: Subscription | undefined;
    private pollController: AbortController | null = null;
    private actionController: AbortController | null = null;
    private mapPromise: Promise<void> | undefined;
    private mapElement: HTMLElement | undefined;
    private view: VehicleMap | undefined;
    private mapKey: unknown;
    private pointsEdited = false;
    private frozenTrip: Trip | null = null;
    private framedRequestId: string | undefined;
    private resumeOnShow = false;
    private readPending(): PendingRequest | null {
        if (!this.passengerId)
            return null;
        try {
            const value = JSON.parse(localStorage.getItem(this.pendingKey) || "null");
            if (!value || value.payload?.passenger_id !== this.passengerId || !value.payload.client_request_id
                || !["/api/requests", "/api/requests/random"].includes(value.endpoint))
                return null;
            return value;
        }
        catch {
            return null;
        }
    }
    private storePending(value: PendingRequest) {
        // 先保存再送出，重新整理後仍以相同識別碼確認原次請求。
        try {
            localStorage.setItem(this.pendingKey, JSON.stringify(value));
        }
        catch {
            throw new Error("無法保存送出資料，請確認瀏覽器允許本機儲存。");
        }
        this.pending = value;
    }
    private clearPending() {
        try {
            localStorage.removeItem(this.pendingKey);
        }
        catch {
            this.rawState = { ...this.rawState, message: "送出確認紀錄未能移除" };
        }
        this.pending = null;
    }
    private currentRequest() { return this.passengerId ? this.rawState.snapshot?.requests[0] || null : null; }
    private trip(): Trip {
        const request = this.currentRequest();
        if (this.frozenTrip?.request && this.frozenTrip.request.id === request?.id)
            return this.frozenTrip;
        return {
            request,
            task: this.rawState.snapshot?.tasks.find(item => item.id === request?.task_id) || null,
            vehicle: this.rawState.snapshot?.vehicles.find(item => item.id === request?.vehicle_id) || null,
        };
    }
    private selectedVehicle() {
        return this.passengerId ? this.trip().vehicle
            : this.rawState.snapshot?.vehicles.find(item => item.id === this.rawState.selectedVehicleId) || null;
    }
    private getState(): UiState {
        const request = this.currentRequest();
        const vehicle = this.selectedVehicle();
        const canEditTrip = Boolean(this.passengerId && this.rawState.connection === "online" && !this.rawState.busy && !this.pending && terminal(request));
        return {
            ...this.rawState, selectedVehicleId: vehicle?.id || null, pending: Boolean(this.pending), currentRequest: request, selectedVehicle: vehicle,
            selectedTask: this.passengerId ? this.trip().task
                : this.rawState.snapshot?.tasks.find(item => item.id === vehicle?.task_id) || null,
            canEditTrip,
            canSubmit: Boolean(canEditTrip && this.rawState.points.pickup && this.rawState.points.destination),
            canCancel: Boolean(this.passengerId && this.rawState.connection === "online" && !this.rawState.busy && !this.pending && request?.status === "waiting"),
        };
    }
    private emit() {
        if (!this.destroyed)
            this.current.set(this.getState());
    }
    private mapError(error: Error) {
        if (this.destroyed) return;
        this.rawState = { ...this.rawState, map: { ...this.rawState.map, status: this.view ? "ready" : "error", error: error.message } };
        this.emit();
    }
    private syncMap() {
        if (!this.view)
            return;
        try {
            const data = this.rawState.snapshot;
            const vehicle = this.selectedVehicle();
            const { request, task } = this.trip();
            this.view!.updateFleet(this.passengerId ? vehicle ? [vehicle] : [] : data?.vehicles || []);
            const selectedTask = this.getState().selectedTask;
            let key;
            let draw: () => void;
            if (this.rawState.route) {
                const route = this.rawState.route;
                key = route;
                draw = () => this.view!.showRoute(route);
            }
            else if (this.passengerId && (this.pointsEdited || !request)) {
                key = JSON.stringify(this.rawState.points);
                draw = () => this.view!.showPoints(this.rawState.points.pickup, this.rawState.points.destination);
            }
            else if (this.passengerId && request) {
                key = [data!.run_id, request.id, task?.phase, Boolean(task?.pickup_route), Boolean(task?.transport_route)].join(":");
                draw = () => {
                    if (task) {
                        const hasRoute = Boolean(task.pickup_route || task.transport_route);
                        this.view!.showPassengerTrip(task, request, hasRoute && this.framedRequestId !== request.id);
                        if (hasRoute)
                            this.framedRequestId = request.id;
                    }
                    else
                        this.view!.showPoints(request.pickup, request.destination);
                };
            }
            else {
                key = [data?.run_id, vehicle?.id, selectedTask?.id, Boolean(selectedTask?.pickup_route), Boolean(selectedTask?.transport_route)].join(":");
                draw = () => selectedTask?.pickup_route && selectedTask?.transport_route
                    ? this.view!.showTask(selectedTask) : this.view!.clearRoute();
            }
            if (this.mapKey !== key) {
                draw();
                this.mapKey = key;
            }
            this.view!.follow(this.rawState.following && vehicle && (!this.passengerId || !terminal(request)) ? vehicle.id : null);
        }
        catch (caught) {
            const error = caught as ApiError;
            this.mapError(error);
        }
    }
    private acceptSnapshot(data: Snapshot) {
        const previous = this.currentRequest();
        const changedRun = this.rawState.snapshot && this.rawState.snapshot!.run_id !== data.run_id;
        if (changedRun) {
            this.frozenTrip = null;
            this.pointsEdited = false;
            this.mapKey = undefined;
            this.rawState = { ...this.rawState, selectedVehicleId: null, following: false, route: null, points: { pickup: null, destination: null }, error: null, message: "模擬已重新開始" };
        }
        this.rawState = { ...this.rawState, snapshot: data };
        if (!data.vehicles.some(item => item.id === this.rawState.selectedVehicleId)) {
            this.rawState = { ...this.rawState, selectedVehicleId: data.vehicles[0]?.id || null };
        }
        const request = this.currentRequest();
        if (request?.id !== previous?.id || changedRun) {
            this.frozenTrip = null;
            this.framedRequestId = undefined;
            this.pointsEdited = false;
            this.rawState = { ...this.rawState, following: false };
        }
        if (this.passengerId && !this.pointsEdited) {
            this.rawState = { ...this.rawState, points: { pickup: request?.pickup || null, destination: request?.destination || null } };
        }
        if (request && terminal(request))
            this.rawState = { ...this.rawState, following: false };
        // 已結束的乘客行程保留當時車位，避免跟著同一車的下一筆任務移動。
        if (request && terminal(request) && !this.frozenTrip)
            this.frozenTrip = structuredClone(this.trip());
        this.syncMap();
    }
    private async load(signal: AbortSignal) {
        const [data, own] = await Promise.all([
            this.api<Snapshot>("/api/simulation", { signal }),
            this.passengerId ? this.api<{
                run_id: string;
                requests: RideRequest[];
            }>("/api/requests?passenger_id=" + encodeURIComponent(this.passengerId), { signal }) : null,
        ]);
        if (own && data.run_id !== own.run_id)
            throw new Error("輪次已變更，等待重新同步。");
        if (!own)
            return data;
        if (this.pending && this.pending.run_id !== data.run_id) {
            this.clearPending();
            this.rawState = { ...this.rawState, error: null, message: "模擬已重新開始" };
        }
        if (this.pending && !this.rawState.busy) {
            const pendingId = this.pending.payload.client_request_id;
            const confirmed = own.requests.some(item => item.client_request_id === pendingId || !terminal(item));
            if (confirmed) {
                this.clearPending();
                this.rawState = { ...this.rawState, error: null, message: "已確認目前請求" };
            }
            else {
                try {
                    const request = await this.api<RideRequest>(this.pending.endpoint, { method: "POST", body: this.pending.payload, signal });
                    own.requests = [request];
                    this.clearPending();
                    this.rawState = { ...this.rawState, error: null, message: "已確認原次請求" };
                }
                catch (caught) {
                    const error = caught as ApiError;
                    if (signal?.aborted)
                        throw error;
                    if (!uncertain(error) && error.status !== 409)
                        this.clearPending();
                    this.rawState = { ...this.rawState, error: error.message, message: this.pending ? "送出結果確認中" : "" };
                }
            }
        }
        return { ...data, requests: own.requests };
    }
    private async poll(epoch: number) {
        if (!this.running || epoch !== this.generation)
            return;
        const started = performance.now();
        const observedRevision = this.revision;
        const controller = new AbortController();
        this.pollController = controller;
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const data = await this.load(controller.signal);
            if (!this.running || epoch !== this.generation || observedRevision !== this.revision)
                return;
            this.rawState = { ...this.rawState, connection: "online", error: this.rawState.connection === "offline" ? null : this.rawState.error };
            this.acceptSnapshot(data);
            this.emit();
            if (this.autoRandom) {
                this.autoRandom = false;
                const url = new URL(location.href);
                url.searchParams.delete("random");
                history.replaceState(history.state, "", url);
                if (this.getState().canEditTrip)
                    void this.actions.submitRandomRequest().catch(() => { });
            }
        }
        catch (caught) {
            const error = caught as ApiError;
            if (this.running && epoch === this.generation && observedRevision === this.revision) {
                this.rawState = { ...this.rawState, connection: "offline", error: error.message };
                this.emit();
            }
        }
        finally {
            clearTimeout(timeout);
            if (this.pollController === controller)
                this.pollController = null;
            if (this.running && epoch === this.generation) {
                const interval = (this.rawState.snapshot?.settings.poll_interval_seconds || 1) * 1000;
                this.timer = rxTimer(Math.max(0, interval - (performance.now() - started))).subscribe(() => void this.poll(epoch));
            }
        }
    }
    private async mutate<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
        if (this.rawState.connection !== "online")
            throw new Error("請先連線 Server。");
        if (this.rawState.busy)
            throw new Error("操作進行中，請等待完成。");
        this.revision++;
        const controller = new AbortController();
        this.actionController = controller;
        this.rawState = { ...this.rawState, busy: true, error: null, message: "" };
        this.emit();
        try {
            return await operation(controller.signal);
        }
        catch (caught) {
            const error = caught as ApiError;
            this.rawState = { ...this.rawState, error: error.message };
            throw error;
        }
        finally {
            this.revision++;
            if (this.actionController === controller)
                this.actionController = null;
            this.rawState = { ...this.rawState, busy: false };
            this.emit();
        }
    }
    private async submit(random: boolean, passengerCount?: number) {
        if (!this.getState().canEditTrip || (!random && !this.getState().canSubmit))
            throw new Error("目前無法提出乘車請求。");
        if (!random && (passengerCount === undefined || !Number.isInteger(passengerCount) || passengerCount < 1))
            throw new Error("乘車人數須為正整數。");
        return this.mutate(async (signal) => {
            const value: PendingRequest = {
                run_id: this.rawState.snapshot!.run_id,
                endpoint: random ? "/api/requests/random" : "/api/requests",
                payload: {
                    passenger_id: this.passengerId, run_id: this.rawState.snapshot!.run_id, client_request_id: crypto.randomUUID(),
                    ...(random ? {} : { ...this.rawState.points, passenger_count: passengerCount }),
                },
            };
            this.storePending(value);
            try {
                const request = await this.api<RideRequest>(value.endpoint, { method: "POST", body: value.payload, signal });
                this.clearPending();
                if (value.run_id !== this.rawState.snapshot!.run_id)
                    throw Object.assign(new Error("模擬已重新開始，請重新確認起訖。"), { status: 409 });
                this.revision++;
                this.pointsEdited = false;
                if (!this.currentRequest() || request.sequence >= this.currentRequest()!.sequence)
                    this.acceptSnapshot({ ...this.rawState.snapshot!, requests: [request] });
                this.rawState = { ...this.rawState, message: "已送出" };
                return request;
            }
            catch (caught) {
                const error = caught as ApiError;
                if (!uncertain(error) && error.status !== 409)
                    this.clearPending();
                this.rawState = { ...this.rawState, message: this.pending ? "送出結果確認中" : "" };
                throw error;
            }
        });
    }
    private monitorOnly() { if (this.passengerId)
        throw new Error("此操作僅限監控模式。"); }
    readonly actions: UiActions = {
        selectVehicle: (id) => {
            this.monitorOnly();
            if (!this.rawState.snapshot?.vehicles.some(item => item.id === id))
                throw new Error("車輛不存在。");
            this.rawState = { ...this.rawState, selectedVehicleId: id, route: null };
            this.syncMap();
            this.emit();
        },
        follow: (enabled) => {
            if (typeof enabled !== "boolean")
                throw new Error("跟隨狀態須為布林值。");
            this.rawState = { ...this.rawState, following: enabled };
            this.syncMap();
            this.emit();
        },
        locate: () => { const vehicle = this.selectedVehicle(); if (vehicle)
            this.view?.locate(vehicle.position); },
        setPoints: ({ pickup = null, destination = null } = {}) => {
            if (!this.getState().canEditTrip)
                throw new Error("目前無法修改乘車起訖。");
            const points = { pickup: pickup === null ? null : position(pickup), destination: destination === null ? null : position(destination) };
            if (!points.pickup && points.destination)
                throw new Error("請先提供上車點。");
            this.pointsEdited = true;
            this.rawState = { ...this.rawState, points, error: null, message: "" };
            this.syncMap();
            this.emit();
        },
        submitRequest: (passengerCount) => { return this.submit(false, passengerCount); },
        submitRandomRequest: () => { return this.submit(true); },
        cancelRequest: () => {
            if (!this.getState().canCancel)
                return Promise.reject(new Error("目前請求不可取消。"));
            const id = this.currentRequest()!.id;
            const runId = this.rawState.snapshot!.run_id;
            return this.mutate(async (signal) => {
                const request = await this.api<RideRequest>("/api/requests/" + encodeURIComponent(id) + "/cancel", { method: "POST", body: { passenger_id: this.passengerId }, signal });
                this.revision++;
                if (runId === this.rawState.snapshot!.run_id && (!this.currentRequest() || request.sequence >= this.currentRequest()!.sequence)) {
                    this.acceptSnapshot({ ...this.rawState.snapshot!, requests: [request] });
                }
                this.rawState = { ...this.rawState, message: "已取消" };
                return request;
            });
        },
        setSpeed: (value) => {
            this.monitorOnly();
            if (!Number.isInteger(value) || value < 1 || value > 300)
                return Promise.reject(new Error("速度須為 1～300 的整數。"));
            return this.mutate(async (signal) => {
                const result = await this.api<{
                    run_id: string;
                    settings: SimulationSettings;
                }>("/api/simulation/speed", { method: "PUT", body: { speed_multiplier: value }, signal });
                this.revision++;
                if (result.run_id === this.rawState.snapshot!.run_id)
                    this.acceptSnapshot({ ...this.rawState.snapshot!, settings: result.settings });
            });
        },
        setIntervals: (report, poll) => {
            this.monitorOnly();
            return this.mutate(async (signal) => {
                const result = await this.api<{
                    run_id: string;
                    settings: SimulationSettings;
                }>("/api/simulation/intervals", { method: "PUT", body: { report_interval_seconds: report, poll_interval_seconds: poll }, signal });
                this.revision++;
                if (result.run_id === this.rawState.snapshot!.run_id)
                    this.acceptSnapshot({ ...this.rawState.snapshot!, settings: result.settings });
            });
        },
        queryRoute: (origin, destination) => {
            this.monitorOnly();
            const body = { origin: position(origin), destination: position(destination) };
            return this.mutate(async (signal) => {
                this.rawState = { ...this.rawState, route: null };
                this.syncMap();
                const result = await this.api<RoadRoute>("/api/routes", { method: "POST", body, signal, timeout: 65000 });
                this.rawState = { ...this.rawState, route: result };
                this.syncMap();
                return result;
            });
        },
        clearRoute: () => {
            this.rawState = { ...this.rawState, route: null };
            this.syncMap();
            this.emit();
        },
        setMapPreferences: (preferences) => {
            if (!this.view)
                throw new Error("地圖尚未就緒。");
            this.view!.setPreferences(preferences);
        },
    };
    start() {
        if (this.running || this.destroyed)
            return;
        this.running = true;
        this.rawState = { ...this.rawState, connection: "connecting" };
        this.emit();
        void this.poll(++this.generation);
    }
    stop() {
        this.running = false;
        this.generation++;
        this.timer?.unsubscribe();
        this.pollController?.abort();
        this.actionController?.abort();
        this.rawState = { ...this.rawState, connection: "stopped" };
        this.emit();
    }
    private pagehide = () => { this.resumeOnShow = this.running; this.stop(); };
    private pageshow = (event: PageTransitionEvent) => { if (event.persisted && this.resumeOnShow)
        this.start(); };
    private storage = (event: StorageEvent) => {
        if (!this.passengerId || event.key !== this.pendingKey)
            return;
        this.pending = this.readPending();
        this.emit();
    };
    constructor() {
        window.addEventListener('pagehide', this.pagehide);
        window.addEventListener('pageshow', this.pageshow);
        window.addEventListener('storage', this.storage);
        this.current = signal(this.getState());
        this.state = this.current.asReadonly();
        this.destroyRef.onDestroy(() => {
            this.destroyed = true;
            this.stop();
            window.removeEventListener('pagehide', this.pagehide);
            window.removeEventListener('pageshow', this.pageshow);
            window.removeEventListener('storage', this.storage);
            this.mapController.abort();
            this.view?.destroy();
            this.view = undefined;
        });
        this.passengerUrl = ({ random = false } = {}) => {
            const url = new URL(location.pathname, location.origin);
            url.searchParams.set("passenger", crypto.randomUUID());
            if (random)
                url.searchParams.set("random", "1");
            return url.pathname + url.search;
        };
        this.mountMap = (container: HTMLElement) => {
            if (this.destroyed)
                return Promise.reject(new Error("地圖工作區已關閉。"));
            if (this.mapPromise) {
                if (container !== this.mapElement)
                    return Promise.reject(new Error("每個頁面只支援一個地圖容器。"));
                return this.mapPromise;
            }
            if (!container?.isConnected || !container.clientWidth || !container.clientHeight) {
                return Promise.reject(new Error("地圖容器須掛在文件上，且寬高皆大於零。"));
            }
            this.mapElement = container;
            this.rawState = { ...this.rawState, map: { ...this.rawState.map, status: "loading", error: null } };
            const setMessage = (message: string) => {
                this.rawState = { ...this.rawState, map: { ...this.rawState.map, message } };
                this.emit();
            };
            const fleet = this.passengerId ? [] : this.rawState.snapshot?.vehicles || [];
            this.mapPromise = Promise.resolve().then(() => createVehicleMap(fleet, setMessage, {
                container, signal: this.mapController.signal, preferenceScope: this.mode,
                onError: error => this.mapError(error),
                onPreferences: (preferences) => {
                    this.rawState = { ...this.rawState, map: { ...this.rawState.map, preferences } };
                    this.emit();
                },
                ...(this.passengerId ? { onPick: (point) => {
                        if (!this.getState().canEditTrip)
                            return;
                        const { pickup, destination } = this.rawState.points;
                        this.actions.setPoints(!pickup || destination ? { pickup: point } : { pickup, destination: point });
                    } } : {}),
            })).then(map => {
                if (this.destroyed) {
                    map.destroy();
                    return;
                }
                this.view = map;
                this.rawState = { ...this.rawState, map: { ...this.rawState.map, status: "ready", message: "地圖已就緒" } };
                this.syncMap();
                this.emit();
            }).catch(error => { this.mapError(error); throw error; });
            this.emit();
            return this.mapPromise;
        };
    }
}
