import { loadMapThree, withTimeout } from "./sdk.js";

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

async function checkModelAssets() {
  const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(10000) });
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
    const asset = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (!asset.ok || asset.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`缺少模型相依素材：${url.pathname}`);
    }
  }));
}


export async function createVehicleMap(vehicles, status, { center, onPick, preferenceScope = onPick ? "passenger" : "monitor" } = {}) {
  const fleet = Array.isArray(vehicles) ? vehicles : [vehicles];
  const accessKey = import.meta.env.ACCESS_KEY;
  const accessToken = import.meta.env.ACCESS_TOKEN;
  if (!accessKey || !accessToken) throw new Error("請在 .env 填入 ACCESS_KEY 與 ACCESS_TOKEN，再啟動 Vite。");
  if (fleet.length) await checkModelAssets();
  status("載入勤崴 SDK…");
  const MapThree = await loadMapThree();
  status("載入地圖…");
  const map = await withTimeout(new MapThree(document.getElementById("map"), {
    accessKey, accessToken, style: "https://kw3dmap.localking.com.tw/openapi/map/kwmap.etxt",
    center: center || fleet[0]?.position || [121.54, 25.045], pitch: onPick ? 0 : 55,
    bearing: 0, zoom: onPick ? 14 : 16, trackResize: true,
  }), 45000, "地圖初始化逾時，請檢查勤崴憑證、來源授權與網路。");
  await withTimeout(new Promise(resolve => {
    const loaded = () => { map.off("style.load", loaded); resolve(); };
    map.on("style.load", loaded); if (map.isStyleLoaded()) loaded();
  }), 45000, "地圖樣式載入逾時，請檢查勤崴憑證與網路。");
  const preferenceKey = `vehicle-monitor.map-preferences.${preferenceScope}`;
  let preferences = readPreferences(preferenceKey);
  let poiControlDisabled = false;
  let scaleControlDisabled = false;
  let appliedPoi = true;
  let appliedScale = 30;
  const mapRegion = document.getElementById("map").parentElement;
  const controls = document.createElement("div"); controls.className = "map-controls";
  const poiButton = document.createElement("button"); poiButton.type = "button";
  const scaleLabel = document.createElement("label"); scaleLabel.className = "map-scale-control";
  scaleLabel.append(document.createTextNode("模型比例"));
  const scaleInput = document.createElement("input"); scaleInput.type = "range"; scaleInput.min = "1"; scaleInput.max = "100"; scaleInput.step = "1"; scaleInput.setAttribute("aria-label", "模型比例");
  const scaleValue = document.createElement("output");
  scaleLabel.append(scaleInput, scaleValue);
  const preferenceStatus = document.createElement("span"); preferenceStatus.className = "map-preference-status"; preferenceStatus.setAttribute("role", "status");
  controls.append(poiButton, scaleLabel, preferenceStatus); mapRegion.append(controls);
  const updateControls = () => {
    poiButton.textContent = `POI：${preferences.poi ? "顯示" : "隱藏"}`;
    poiButton.disabled = poiControlDisabled;
    scaleInput.value = String(preferences.scale); scaleInput.disabled = scaleControlDisabled;
    scaleValue.value = `${preferences.scale}`;
  };
  const models = new Map();
  const latest = new Map();
  const pending = new Set();
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
    catch { preferenceStatus.textContent = "偏好未保存"; return; }
    preferenceStatus.textContent = "";
  }
  function applyLoadedPreferences() {
    poiControlDisabled = false; scaleControlDisabled = false; updateControls();
    try { applyPoi(preferences.poi); appliedPoi = preferences.poi; }
    catch {
      try { applyPoi(appliedPoi); preferences.poi = appliedPoi; }
      catch { poiControlDisabled = true; }
      preferenceStatus.textContent = "POI 套用失敗";
    }
    try { applyScale(preferences.scale); appliedScale = preferences.scale; }
    catch {
      try { applyScale(appliedScale); preferences.scale = appliedScale; }
      catch { scaleControlDisabled = true; }
      preferenceStatus.textContent = "模型比例套用失敗";
    }
    updateControls();
  }
  poiButton.addEventListener("click", () => {
    const previous = preferences.poi;
    try { applyPoi(!previous); appliedPoi = !previous; preferences.poi = !previous; updateControls(); savePreferences(); }
    catch (error) {
      try { applyPoi(previous); appliedPoi = previous; preferences.poi = previous; }
      catch { poiControlDisabled = true; }
      preferenceStatus.textContent = "POI 套用失敗"; updateControls(); status(error.message);
    }
  });
  scaleInput.addEventListener("input", () => {
    const previous = preferences.scale; const next = Number(scaleInput.value);
    try { applyScale(next); appliedScale = next; preferences.scale = next; updateControls(); savePreferences(); }
    catch (error) {
      try { applyScale(previous); appliedScale = previous; preferences.scale = previous; }
      catch { scaleControlDisabled = true; }
      preferenceStatus.textContent = "模型比例套用失敗"; updateControls(); status(error.message);
    }
  });
  window.addEventListener("storage", event => {
    if (event.key !== preferenceKey) return;
    preferences = readPreferences(preferenceKey); updateControls(); applyLoadedPreferences();
  });
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
      const loading = map.three.add3dModel({
        id: vehicle.id, obj: MODEL_URL, type: "gltf", coordinates: [...vehicle.position, 0],
        rotation: { ...INITIAL_ROTATION }, scale: MODEL_INITIAL_SCALE, anchor: "bottom",
      }).then(model => { if (expired) map.three.remove3dObject(model); return model; });
      const model = await withTimeout(loading, 45000, `模型載入逾時：${vehicle.id}`);
      if (!latest.has(vehicle.id)) { map.three.remove3dObject(model); return; }
      place(model, latest.get(vehicle.id)); model.setScale(modelScale(preferences.scale));
      models.set(vehicle.id, model); map.redraw();
    } catch (error) {
      expired = true;
      const partial = models.get(vehicle.id);
      if (partial) { models.delete(vehicle.id); map.three.remove3dObject(partial); }
      throw error;
    }
    finally { pending.delete(vehicle.id); }
  }
  for (const vehicle of fleet) latest.set(vehicle.id, vehicle);
  status("載入車輛模型…");
  // 同一素材各自建立模型，避免不同車輛共用位置與朝向物件。
  for (const vehicle of fleet) await addVehicle(vehicle);
  const lines = [];
  const markers = [];
  function clearRoute() {
    for (const line of lines) map.three.remove3dObject(line);
    lines.length = 0;
    for (const marker of markers) marker.remove();
    markers.length = 0; map.redraw();
  }
  function addMarker(point, label, kind) {
    if (!point) return;
    const icon = document.createElement("span"); icon.className = `route-marker route-marker-${kind}`; icon.textContent = label;
    markers.push(new MapThree.Marker({ position: [...point], icon, altitude: 0, clickable: false, title: `${label}車點：${point.join(", ")}` }));
  }
  function addLine(coordinates, color, id) {
    lines.push(map.three.add3dLine({ id, coordinates: coordinates.map(point => [...point, 0]), color, width: 6 }));
  }
  function locate(position) { map.setCenter({ lng: position[0], lat: position[1] }); }
  if (onPick) map.on("click", event => {
    // click 的 lngLat 已由舊專案在 mapThree 1.4.3 實測；保留有效性檢查。
    const { lng, lat } = event.lngLat || {};
    if (Number.isFinite(lng) && Number.isFinite(lat)) onPick([lng, lat]);
  });
  return {
    clearRoute, locate,
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
        else void addVehicle(vehicle).catch(error => status(error.message));
        if (vehicle.id === followId) locate(vehicle.position);
      }
      map.redraw();
    },
  };
}
