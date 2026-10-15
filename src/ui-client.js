import { api } from "./ui.js";
import { createVehicleMap } from "./vehicle-map.js";

const terminal = (request) => !request || ["completed", "failed", "cancelled"].includes(request.status);
const uncertain = (error) => !error.status || error.status >= 500 || [408, 429].includes(error.status);

function position(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
    || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error("座標須為有效的 [經度, 緯度]。");
  return [...point];
}

/** 不產生頁面 HTML；對外介面見 ui-client.d.ts。 */
export function createUiClient() {
  const params = new URLSearchParams(location.search);
  const passengerId = params.get("passenger") || null;
  const mode = passengerId ? "passenger" : "monitor";
  const pendingKey = "vehicle-monitor.pending-request." + passengerId;
  const listeners = new Set();
  let autoRandom = passengerId && params.get("random") === "1";
  let state = {
    mode, passengerId, routeCheck: params.has("route-check"),
    connection: "idle", snapshot: null, selectedVehicleId: null, following: false,
    points: { pickup: null, destination: null }, busy: false, error: null, message: "",
    map: { status: "idle", message: "", error: null, preferences: null }, route: null,
  };
  let pending = readPending();
  let running = false;
  let generation = 0;
  let revision = 0;
  let timer;
  let pollController;
  let actionController;
  let mapPromise;
  let mapElement;
  let view;
  let mapKey;
  let pointsEdited = false;
  let frozenTrip;
  let framedRequestId;
  let resumeOnShow = false;

  function readPending() {
    if (!passengerId) return null;
    try {
      const value = JSON.parse(localStorage.getItem(pendingKey) || "null");
      if (!value || value.payload?.passenger_id !== passengerId || !value.payload.client_request_id
        || !["/api/requests", "/api/requests/random"].includes(value.endpoint)) return null;
      return value;
    } catch { return null; }
  }
  function storePending(value) {
    // 先保存再送出，重新整理後仍以相同識別碼確認原次請求。
    try { localStorage.setItem(pendingKey, JSON.stringify(value)); }
    catch { throw new Error("無法保存送出資料，請確認瀏覽器允許本機儲存。"); }
    pending = value;
  }
  function clearPending() {
    try { localStorage.removeItem(pendingKey); }
    catch { state = { ...state, message: "送出確認紀錄未能移除" }; }
    pending = null;
  }
  function currentRequest() { return passengerId ? state.snapshot?.requests[0] || null : null; }
  function trip() {
    const request = currentRequest();
    if (frozenTrip && frozenTrip.request.id === request?.id) return frozenTrip;
    return {
      request,
      task: state.snapshot?.tasks.find(item => item.id === request?.task_id) || null,
      vehicle: state.snapshot?.vehicles.find(item => item.id === request?.vehicle_id) || null,
    };
  }
  function selectedVehicle() {
    return passengerId ? trip().vehicle
      : state.snapshot?.vehicles.find(item => item.id === state.selectedVehicleId) || null;
  }
  function getState() {
    const request = currentRequest();
    const vehicle = selectedVehicle();
    const canEditTrip = Boolean(passengerId && state.connection === "online" && !state.busy && !pending && terminal(request));
    return {
      ...state, selectedVehicleId: vehicle?.id || null, pending: Boolean(pending), currentRequest: request, selectedVehicle: vehicle,
      selectedTask: passengerId ? trip().task
        : state.snapshot?.tasks.find(item => item.id === vehicle?.task_id) || null,
      canEditTrip,
      canSubmit: Boolean(canEditTrip && state.points.pickup && state.points.destination),
      canCancel: Boolean(passengerId && state.connection === "online" && !state.busy && !pending && request?.status === "waiting"),
    };
  }
  function emit() {
    const snapshot = getState();
    for (const listener of listeners) {
      try { listener(snapshot); }
      catch (error) { console.error("UI 狀態呈現失敗", error); }
    }
  }
  function mapError(error) {
    state = { ...state, map: { ...state.map, status: view ? "ready" : "error", error: error.message } };
    emit();
  }
  function syncMap() {
    if (!view) return;
    try {
      const data = state.snapshot;
      const vehicle = selectedVehicle();
      const { request, task } = trip();
      view.updateFleet(passengerId ? vehicle ? [vehicle] : [] : data?.vehicles || []);
      const selectedTask = getState().selectedTask;
      let key;
      let draw;
      if (state.route) {
        key = state.route;
        draw = () => view.showRoute(state.route);
      } else if (passengerId && (pointsEdited || !request)) {
        key = JSON.stringify(state.points);
        draw = () => view.showPoints(state.points.pickup, state.points.destination);
      } else if (passengerId) {
        key = [data.run_id, request.id, task?.phase, Boolean(task?.pickup_route), Boolean(task?.transport_route)].join(":");
        draw = () => {
          if (task) {
            const hasRoute = Boolean(task.pickup_route || task.transport_route);
            view.showPassengerTrip(task, request, hasRoute && framedRequestId !== request.id);
            if (hasRoute) framedRequestId = request.id;
          } else view.showPoints(request.pickup, request.destination);
        };
      } else {
        key = [data?.run_id, vehicle?.id, selectedTask?.id, Boolean(selectedTask?.pickup_route), Boolean(selectedTask?.transport_route)].join(":");
        draw = () => selectedTask?.pickup_route && selectedTask?.transport_route
          ? view.showTask(selectedTask) : view.clearRoute();
      }
      if (mapKey !== key) { draw(); mapKey = key; }
      view.follow(state.following && vehicle && (!passengerId || !terminal(request)) ? vehicle.id : null);
    } catch (error) { mapError(error); }
  }
  function acceptSnapshot(data) {
    const previous = currentRequest();
    const changedRun = state.snapshot && state.snapshot.run_id !== data.run_id;
    if (changedRun) {
      frozenTrip = null; pointsEdited = false; mapKey = undefined;
      state = { ...state, selectedVehicleId: null, following: false, route: null, points: { pickup: null, destination: null } };
    }
    state = { ...state, snapshot: data };
    if (!data.vehicles.some(item => item.id === state.selectedVehicleId)) {
      state = { ...state, selectedVehicleId: data.vehicles[0]?.id || null };
    }
    const request = currentRequest();
    if (request?.id !== previous?.id || changedRun) {
      frozenTrip = null; framedRequestId = undefined; pointsEdited = false;
      state = { ...state, following: false };
    }
    if (passengerId && !pointsEdited) {
      state = { ...state, points: { pickup: request?.pickup || null, destination: request?.destination || null } };
    }
    if (request && terminal(request)) state = { ...state, following: false };
    // 已結束的乘客行程保留當時車位，避免跟著同一車的下一筆任務移動。
    if (request && terminal(request) && !frozenTrip) frozenTrip = structuredClone(trip());
    syncMap();
  }
  async function load(signal) {
    const [data, own] = await Promise.all([
      api("/api/simulation", { signal }),
      passengerId ? api("/api/requests?passenger_id=" + encodeURIComponent(passengerId), { signal }) : null,
    ]);
    if (own && data.run_id !== own.run_id) throw new Error("輪次已變更，等待重新同步。");
    if (!own) return data;
    if (pending && pending.run_id !== data.run_id) {
      clearPending();
      state = { ...state, error: null, message: "模擬已重新開始" };
    }
    if (pending && !state.busy) {
      const confirmed = own.requests.some(item => item.client_request_id === pending.payload.client_request_id || !terminal(item));
      if (confirmed) {
        clearPending();
        state = { ...state, error: null, message: "已確認目前請求" };
      } else {
        try {
          const request = await api(pending.endpoint, { method: "POST", body: pending.payload, signal });
          own.requests = [request];
          clearPending();
          state = { ...state, error: null, message: "已確認原次請求" };
        } catch (error) {
          if (signal?.aborted) throw error;
          if (!uncertain(error) && error.status !== 409) clearPending();
          state = { ...state, error: error.message, message: pending ? "送出結果確認中" : "" };
        }
      }
    }
    return { ...data, requests: own.requests };
  }
  async function poll(epoch) {
    if (!running || epoch !== generation) return;
    const started = performance.now();
    const observedRevision = revision;
    const controller = new AbortController();
    pollController = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const data = await load(controller.signal);
      if (!running || epoch !== generation || observedRevision !== revision) return;
      state = { ...state, connection: "online", error: state.connection === "offline" ? null : state.error };
      acceptSnapshot(data);
      emit();
      if (autoRandom) {
        autoRandom = false;
        const url = new URL(location.href);
        url.searchParams.delete("random");
        history.replaceState(history.state, "", url);
        if (getState().canEditTrip) void actions.submitRandomRequest().catch(() => {});
      }
    } catch (error) {
      if (running && epoch === generation && observedRevision === revision) {
        state = { ...state, connection: "offline", error: error.message };
        emit();
      }
    } finally {
      clearTimeout(timeout);
      if (pollController === controller) pollController = null;
      if (running && epoch === generation) {
        const interval = (state.snapshot?.settings.poll_interval_seconds || 1) * 1000;
        timer = setTimeout(() => void poll(epoch), Math.max(0, interval - (performance.now() - started)));
      }
    }
  }
  async function mutate(operation) {
    if (state.connection !== "online") throw new Error("請先連線 Server。");
    if (state.busy) throw new Error("操作進行中，請等待完成。");
    revision++;
    const controller = new AbortController();
    actionController = controller;
    state = { ...state, busy: true, error: null, message: "" };
    emit();
    try { return await operation(controller.signal); }
    catch (error) {
      state = { ...state, error: error.message };
      throw error;
    } finally {
      revision++;
      if (actionController === controller) actionController = null;
      state = { ...state, busy: false };
      emit();
    }
  }
  async function submit(random, passengerCount) {
    if (!getState().canEditTrip || (!random && !getState().canSubmit)) throw new Error("目前無法提出乘車請求。");
    if (!random && (!Number.isInteger(passengerCount) || passengerCount < 1)) throw new Error("乘車人數須為正整數。");
    return mutate(async signal => {
      const value = {
        run_id: state.snapshot.run_id,
        endpoint: random ? "/api/requests/random" : "/api/requests",
        payload: {
          passenger_id: passengerId, run_id: state.snapshot.run_id, client_request_id: crypto.randomUUID(),
          ...(random ? {} : { ...state.points, passenger_count: passengerCount }),
        },
      };
      storePending(value);
      try {
        const request = await api(value.endpoint, { method: "POST", body: value.payload, signal });
        clearPending();
        if (value.run_id !== state.snapshot.run_id) throw Object.assign(new Error("模擬已重新開始，請重新確認起訖。"), { status: 409 });
        revision++;
        pointsEdited = false;
        if (!currentRequest() || request.sequence >= currentRequest().sequence) acceptSnapshot({ ...state.snapshot, requests: [request] });
        state = { ...state, message: "已送出" };
        return request;
      } catch (error) {
        if (!uncertain(error) && error.status !== 409) clearPending();
        state = { ...state, message: pending ? "送出結果確認中" : "" };
        throw error;
      }
    });
  }
  function monitorOnly() { if (passengerId) throw new Error("此操作僅限監控模式。"); }
  const actions = {
    selectVehicle(id) {
      monitorOnly();
      if (!state.snapshot?.vehicles.some(item => item.id === id)) throw new Error("車輛不存在。");
      state = { ...state, selectedVehicleId: id, route: null };
      syncMap(); emit();
    },
    follow(enabled) {
      if (typeof enabled !== "boolean") throw new Error("跟隨狀態須為布林值。");
      state = { ...state, following: enabled };
      syncMap(); emit();
    },
    locate() { const vehicle = selectedVehicle(); if (vehicle) view?.locate(vehicle.position); },
    setPoints({ pickup = null, destination = null } = {}) {
      if (!getState().canEditTrip) throw new Error("目前無法修改乘車起訖。");
      const points = { pickup: pickup === null ? null : position(pickup), destination: destination === null ? null : position(destination) };
      if (!points.pickup && points.destination) throw new Error("請先提供上車點。");
      pointsEdited = true;
      state = { ...state, points, error: null, message: "" };
      syncMap(); emit();
    },
    submitRequest(passengerCount) { return submit(false, passengerCount); },
    submitRandomRequest() { return submit(true); },
    cancelRequest() {
      if (!getState().canCancel) return Promise.reject(new Error("目前請求不可取消。"));
      const id = currentRequest().id;
      const runId = state.snapshot.run_id;
      return mutate(async signal => {
        const request = await api("/api/requests/" + encodeURIComponent(id) + "/cancel", { method: "POST", body: { passenger_id: passengerId }, signal });
        revision++;
        if (runId === state.snapshot.run_id && (!currentRequest() || request.sequence >= currentRequest().sequence)) {
          acceptSnapshot({ ...state.snapshot, requests: [request] });
        }
        state = { ...state, message: "已取消" };
        return request;
      });
    },
    setSpeed(value) {
      monitorOnly();
      if (!Number.isInteger(value) || value < 1 || value > 300) return Promise.reject(new Error("速度須為 1～300 的整數。"));
      return mutate(async signal => {
        const result = await api("/api/simulation/speed", { method: "PUT", body: { speed_multiplier: value }, signal });
        revision++;
        if (result.run_id === state.snapshot.run_id) acceptSnapshot({ ...state.snapshot, settings: result.settings });
      });
    },
    setIntervals(report, poll) {
      monitorOnly();
      return mutate(async signal => {
        const result = await api("/api/simulation/intervals", { method: "PUT", body: { report_interval_seconds: report, poll_interval_seconds: poll }, signal });
        revision++;
        if (result.run_id === state.snapshot.run_id) acceptSnapshot({ ...state.snapshot, settings: result.settings });
      });
    },
    queryRoute(origin, destination) {
      monitorOnly();
      const body = { origin: position(origin), destination: position(destination) };
      return mutate(async signal => {
        state = { ...state, route: null };
        syncMap();
        const result = await api("/api/routes", { method: "POST", body, signal, timeout: 65000 });
        state = { ...state, route: result };
        syncMap();
        return result;
      });
    },
    clearRoute() {
      state = { ...state, route: null };
      syncMap(); emit();
    },
    setMapPreferences(preferences) {
      if (!view) throw new Error("地圖尚未就緒。");
      view.setPreferences(preferences);
    },
  };
  function start() {
    if (running) return;
    running = true;
    state = { ...state, connection: "connecting" };
    emit();
    void poll(++generation);
  }
  function stop() {
    running = false; generation++;
    clearTimeout(timer); pollController?.abort(); actionController?.abort();
    state = { ...state, connection: "stopped" };
    emit();
  }
  window.addEventListener("pagehide", () => { resumeOnShow = running; stop(); });
  window.addEventListener("pageshow", event => { if (event.persisted && resumeOnShow) start(); });
  window.addEventListener("storage", event => {
    if (!passengerId || event.key !== pendingKey) return;
    pending = readPending(); emit();
  });
  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
    start, stop, actions,
    passengerUrl({ random = false } = {}) {
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set("passenger", crypto.randomUUID());
      if (random) url.searchParams.set("random", "1");
      return url.pathname + url.search;
    },
    mountMap(container) {
      if (mapPromise) {
        if (container !== mapElement) return Promise.reject(new Error("每個頁面只支援一個地圖容器。"));
        return mapPromise;
      }
      if (!container?.isConnected || !container.clientWidth || !container.clientHeight) {
        return Promise.reject(new Error("地圖容器須掛在文件上，且寬高皆大於零。"));
      }
      mapElement = container;
      state = { ...state, map: { ...state.map, status: "loading", error: null } };
      const setMessage = message => {
        state = { ...state, map: { ...state.map, message } }; emit();
      };
      const fleet = passengerId ? [] : state.snapshot?.vehicles || [];
      mapPromise = Promise.resolve().then(() => createVehicleMap(fleet, setMessage, {
        container, preferenceScope: mode,
        onError: mapError,
        onPreferences(preferences) {
          state = { ...state, map: { ...state.map, preferences } }; emit();
        },
        ...(passengerId ? { onPick(point) {
          if (!getState().canEditTrip) return;
          const { pickup, destination } = state.points;
          actions.setPoints(!pickup || destination ? { pickup: point } : { pickup, destination: point });
        } } : {}),
      })).then(map => {
        view = map;
        state = { ...state, map: { ...state.map, status: "ready", message: "地圖已就緒" } };
        syncMap(); emit();
      }).catch(error => { mapError(error); throw error; });
      emit();
      return mapPromise;
    },
  };
}
