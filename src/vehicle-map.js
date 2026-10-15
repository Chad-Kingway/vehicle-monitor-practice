import { loadMapThree, withTimeout } from "./sdk.js";
import { mapConfig } from "./generated/map-config";

const MODEL_URL = "/models/car/scene.gltf";
const INITIAL_ROTATION = { x: 90, y: 180, z: 0 };
const MODEL_INITIAL_SCALE = 10;
const PREFERENCE_BASE_SCALE = 30;
const DEFAULT_PREFERENCES = { poi: true, scale: 30 };

function readPreferences(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    return { poi: typeof saved?.poi === "boolean" ? saved.poi : true, scale: Number.isInteger(saved?.scale) && saved.scale >= 1 && saved.scale <= 100 ? saved.scale : 30 };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}

async function checkModelAssets(signal) {
  const response = await fetch(MODEL_URL, { signal: AbortSignal.any([AbortSignal.timeout(10000), signal]) });
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("缺少模型，請將素材放入 public/models/car。");
  }
  let gltf;
  try { gltf = await response.json(); }
  catch { throw new Error("scene.gltf 格式無效。"); }
  if (gltf.asset?.version !== "2.0") throw new Error("模型須為 glTF 2.0。");
  const uris = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .map(({ uri }) => uri).filter((uri) => uri && !uri.startsWith("data:"));
  await Promise.all([...new Set(uris)].map(async (uri) => {
    const url = new URL(uri, new URL(MODEL_URL, window.location.origin));
    const asset = await fetch(url, { method: "HEAD", signal: AbortSignal.any([AbortSignal.timeout(10000), signal]) });
    if (!asset.ok || asset.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`缺少模型相依素材：${url.pathname}`);
    }
  }));
}


export async function createVehicleMap(vehicles, status, {
  center, onPick, preferenceScope = onPick ? "passenger" : "monitor",
  container, onPreferences, onError, signal,
} = {}) {
  const lifetime = new AbortController();
  const workSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
  let destroyed = false;
  let map;
  let preferenceStorage;
  let stylePreferences;
  let click;
  let styleLoaded;
  const models = new Map();
  const latest = new Map();
  const pending = new Set();
  const lines = [];
  const markers = [];
  // SDK 官方 map.remove() 釋放整張地圖；先解除外部監聽並阻擋晚到工作。
  function destroy() {
    if (destroyed) return;
    destroyed = true; lifetime.abort();
    workSignal.removeEventListener("abort", destroy);
    if (preferenceStorage) window.removeEventListener("storage", preferenceStorage);
    if (map) {
      if (stylePreferences) map.off("style.load", stylePreferences);
      if (styleLoaded) map.off("style.load", styleLoaded);
      if (click) map.off("click", click);
      // 個別資源失敗仍繼續清理其餘資源與整張地圖。
      const cleanup = [...markers.map(marker => () => marker.remove()),
        ...[...lines, ...models.values()].map(object => () => map.three.remove3dObject(object)), () => map.remove()];
      for (const release of cleanup) { try { release(); } catch { /* 繼續清理其他資源。 */ } }
    }
    models.clear(); latest.clear(); pending.clear(); lines.length = 0; markers.length = 0;
  }
  workSignal.addEventListener("abort", destroy, { once: true });
  const ensureActive = () => { if (workSignal.aborted) throw new DOMException("地圖工作區已關閉", "AbortError"); };
  try {
  ensureActive();
  const fleet = Array.isArray(vehicles) ? vehicles : [vehicles];
  const { accessKey, accessToken } = mapConfig;
  if (!accessKey || !accessToken) throw new Error("請在 .env 填入 ACCESS_KEY 與 ACCESS_TOKEN，再啟動前端。");
  if (fleet.length) await checkModelAssets(workSignal);
  status("載入勤崴 SDK…");
  const MapThree = await withTimeout(loadMapThree(), 30000, "勤崴 SDK 載入逾時。", workSignal);
  ensureActive();
  status("載入地圖…");
  const loadingMap = Promise.resolve(new MapThree(container, {
    accessKey, accessToken, style: "https://kw3dmap.localking.com.tw/openapi/map/kwmap.etxt",
    center: center || fleet[0]?.position || [121.54, 25.045], pitch: onPick ? 0 : 55,
    bearing: 0, zoom: onPick ? 14 : 16, trackResize: true,
  })).then(value => {
    if (destroyed) { value.remove(); throw new DOMException("地圖工作區已關閉", "AbortError"); }
    map = value;
    return value;
  });
  await withTimeout(loadingMap, 45000, "地圖初始化逾時，請檢查勤崴憑證、來源授權與網路。", workSignal);
  ensureActive();
  await withTimeout(new Promise(resolve => {
    styleLoaded = () => { map.off("style.load", styleLoaded); resolve(); };
    map.on("style.load", styleLoaded); if (map.isStyleLoaded()) styleLoaded();
  }), 45000, "地圖樣式載入逾時，請檢查勤崴憑證與網路。", workSignal);
  ensureActive();
  const preferenceKey = `vehicle-monitor.map-preferences.${preferenceScope}`;
  let preferences = readPreferences(preferenceKey);
  let poiControlDisabled = false;
  let scaleControlDisabled = false;
  let appliedPoi = true;
  let appliedScale = 30;
  let preferenceError = "";
  const publishPreferences = () => onPreferences?.({
    ...preferences, poiDisabled: poiControlDisabled, scaleDisabled: scaleControlDisabled, error: preferenceError,
  });
  let assetsReady = fleet.length ? Promise.resolve() : null;
  let followId;
  function applyPoi(value) {
    if (value) map.onLayer("poi_"); else map.offLayer("poi_");
    map.redraw();
  }
  function modelScale(value) { return value / PREFERENCE_BASE_SCALE; }
  function applyScale(value) {
    for (const model of models.values()) model.setScale(modelScale(value));
    map.redraw();
  }
  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); }
    catch { preferenceError = "偏好未保存"; }
  }
  function applyLoadedPreferences() {
    poiControlDisabled = false; scaleControlDisabled = false; preferenceError = "";
    try { applyPoi(preferences.poi); appliedPoi = preferences.poi; }
    catch {
      try { applyPoi(appliedPoi); preferences.poi = appliedPoi; }
      catch { poiControlDisabled = true; }
      preferenceError = "POI 套用失敗";
    }
    try { applyScale(preferences.scale); appliedScale = preferences.scale; }
    catch {
      try { applyScale(appliedScale); preferences.scale = appliedScale; }
      catch { scaleControlDisabled = true; }
      preferenceError = "模型比例套用失敗";
    }
    publishPreferences();
  }
  function setPreferences(next) {
    if (next.poi !== undefined && typeof next.poi !== "boolean") throw new Error("POI 必須為布林值。");
    if (next.scale !== undefined && (!Number.isInteger(next.scale) || next.scale < 1 || next.scale > 100)) throw new Error("模型比例須為 1～100 的整數。");
    preferences = { ...preferences, ...next };
    applyLoadedPreferences();
    const error = preferenceError;
    if (!error) savePreferences();
    publishPreferences();
    if (error) throw new Error(error);
  }
  preferenceStorage = event => {
    if (event.key !== preferenceKey) return;
    preferences = readPreferences(preferenceKey); applyLoadedPreferences();
  };
  window.addEventListener("storage", preferenceStorage);
  stylePreferences = applyLoadedPreferences;
  map.on("style.load", applyLoadedPreferences);
  applyLoadedPreferences();
  function place(model, vehicle) {
    model.setCoordinates([...vehicle.position, 0]);
    // 沿用已查驗的模型基準與 SDK 零度處理。
    model.setRotation({ x: 0, y: 0, z: (180 - vehicle.heading + 360) % 360 || 360 });
  }
  async function addVehicle(vehicle) {
    if (pending.has(vehicle.id) || models.has(vehicle.id)) return;
    pending.add(vehicle.id);
    let expired = false;
    try {
      await (assetsReady ||= checkModelAssets(workSignal).catch(error => { assetsReady = null; throw error; }));
      ensureActive();
      const loading = map.three.add3dModel({
        id: vehicle.id, obj: MODEL_URL, type: "gltf", coordinates: [...vehicle.position, 0],
        rotation: { ...INITIAL_ROTATION }, scale: MODEL_INITIAL_SCALE, anchor: "bottom",
      }).then(model => {
        if (expired || destroyed) {
          try { map.three.remove3dObject(model); } catch { /* 地圖可能已釋放，仍阻止晚到模型寫回狀態。 */ }
          throw new DOMException("模型載入已結束", "AbortError");
        }
        return model;
      });
      const model = await withTimeout(loading, 45000, `模型載入逾時：${vehicle.id}`, workSignal);
      ensureActive();
      if (!latest.has(vehicle.id)) { map.three.remove3dObject(model); return; }
      place(model, latest.get(vehicle.id)); model.setScale(modelScale(preferences.scale));
      models.set(vehicle.id, model); map.redraw();
    } catch (error) {
      expired = true;
      const partial = models.get(vehicle.id);
      if (partial) { models.delete(vehicle.id); if (!destroyed) map.three.remove3dObject(partial); }
      throw error;
    }
    finally { pending.delete(vehicle.id); }
  }
  for (const vehicle of fleet) latest.set(vehicle.id, vehicle);
  status("載入車輛模型…");
  // 同一素材各自建立模型，避免不同車輛共用位置與朝向物件。
  for (const vehicle of fleet) await addVehicle(vehicle);
  function clearRoute() {
    for (const line of lines) map.three.remove3dObject(line);
    lines.length = 0;
    for (const marker of markers) marker.remove();
    markers.length = 0; map.redraw();
  }
  function addMarker(point, label, kind) {
    if (!point) return;
    const icon = document.createElement("span"); icon.className = `route-marker route-marker-${kind}`; icon.textContent = label;
    Object.assign(icon.style, {
      display: "grid", placeItems: "center", width: "32px", height: "32px", border: "2px solid white",
      borderRadius: kind === "origin" ? "50%" : "6px", color: "white",
      background: kind === "origin" ? "var(--route-origin-color, #147a58)" : "var(--route-destination-color, #b04436)",
      font: "bold 14px sans-serif", boxShadow: "0 2px 8px #0005",
    });
    markers.push(new MapThree.Marker({ position: [...point], icon, altitude: 0, clickable: false, title: `${label}車點：${point.join(", ")}` }));
  }
  function addLine(coordinates, color, id) {
    lines.push(map.three.add3dLine({ id, coordinates: coordinates.map(point => [...point, 0]), color, width: 6 }));
  }
  function locate(position) { map.setCenter({ lng: position[0], lat: position[1] }); }
  if (onPick) { click = event => {
    // click 的 lngLat 已由舊專案在 mapThree 1.4.3 實測；保留有效性檢查。
    const { lng, lat } = event.lngLat || {};
    if (Number.isFinite(lng) && Number.isFinite(lat)) onPick([lng, lat]);
  }; map.on("click", click); }
  return {
    destroy, clearRoute, locate, setPreferences,
    follow(id) { followId = id; const vehicle = latest.get(id); if (vehicle) locate(vehicle.position); },
    showPoints(pickup, destination) { clearRoute(); addMarker(pickup, "上", "origin"); addMarker(destination, "下", "destination"); map.redraw(); },
    showTask(task) {
      clearRoute();
      try {
        addLine(task.pickup_route.coordinates, "#2696eb", "pickup-route");
        addLine(task.transport_route.coordinates, "#e39428", "transport-route");
        addMarker(task.pickup, "上", "origin"); addMarker(task.destination, "下", "destination"); map.redraw();
      } catch (error) { clearRoute(); throw error; }
    },
    showPassengerTrip(task, request, frame = false) {
      clearRoute();
      try {
        const isTransport = task.phase === "transport" || task.phase === "completed";
        const route = isTransport ? task.transport_route : task.pickup_route;
        if (route?.coordinates) addLine(route.coordinates, isTransport ? "#e39428" : "#2696eb", "passenger-route");
        addMarker(request.pickup, "上", "origin"); addMarker(request.destination, "下", "destination");
        if (frame && route?.coordinates?.length) {
          const points = [...route.coordinates, request.pickup, request.destination];
          map.setPitch(0);
          map.fitBounds([[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))], [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]], { padding: 60 });
        }
        map.redraw();
      } catch (error) { clearRoute(); throw error; }
    },
    showRoute(route) {
      clearRoute();
      try {
        addLine(route.coordinates, "#2675eb", "integration-route");
        addMarker(route.origin, "起", "origin"); addMarker(route.destination, "迄", "destination");
        const points = [...route.coordinates, route.origin, route.destination];
        map.setPitch(0);
        map.fitBounds([[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))], [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]], { padding: 60 });
        map.redraw();
      } catch (error) { clearRoute(); throw error; }
    },
    updateFleet(current) {
      const ids = new Set(current.map(v => v.id));
      for (const [id, model] of models) if (!ids.has(id)) { map.three.remove3dObject(model); models.delete(id); }
      for (const id of latest.keys()) if (!ids.has(id)) latest.delete(id);
      for (const vehicle of current) {
        latest.set(vehicle.id, vehicle);
        const model = models.get(vehicle.id);
        if (model) place(model, vehicle);
        else void addVehicle(vehicle).catch(error => { if (!destroyed) { if (onError) onError(error); else status(error.message); } });
        if (vehicle.id === followId) locate(vehicle.position);
      }
      map.redraw();
    },
  };
  } catch (error) { destroy(); throw error; }
}
