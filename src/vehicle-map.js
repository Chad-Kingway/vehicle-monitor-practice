import { loadMapThree, withTimeout } from "./sdk.js";

const MODEL_URL = "/models/car/scene.gltf";
const INITIAL_ROTATION = { x: 90, y: 180, z: 0 };

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

export async function createVehicleMap(vehicle, status) {
  const accessKey = import.meta.env.ACCESS_KEY;
  const accessToken = import.meta.env.ACCESS_TOKEN;
  if (!accessKey || !accessToken) throw new Error("請在 .env 填入 ACCESS_KEY 與 ACCESS_TOKEN，再啟動 Vite。");
  await checkModelAssets();
  status("載入勤崴 SDK…");
  const MapThree = await loadMapThree();
  status("載入地圖…");
  const map = await withTimeout(new MapThree(document.getElementById("map"), {
    accessKey, accessToken,
    style: "https://kw3dmap.localking.com.tw/openapi/map/kwmap.etxt",
    center: vehicle.position, pitch: 55, bearing: 0, zoom: 17,
    trackResize: true,
  }), 45000, "地圖初始化逾時，請檢查勤崴憑證、來源授權與網路。");
  await withTimeout(new Promise((resolve) => {
    const loaded = () => { map.off("style.load", loaded); resolve(); };
    map.on("style.load", loaded);
    if (map.isStyleLoaded()) loaded();
  }), 45000, "地圖樣式載入逾時，請檢查勤崴憑證與網路。");
  status("載入車輛模型…");
  // 保留舊素材的校正角；setRotation 的角度以此建立基準套用。
  let expired = false;
  const loading = map.three.add3dModel({
    id: vehicle.id, obj: MODEL_URL, type: "gltf", coordinates: [...vehicle.position, 0],
    rotation: { ...INITIAL_ROTATION }, scale: 10, anchor: "bottom",
  }).then((model) => {
    if (expired) map.three.remove3dObject(model);
    return model;
  });
  let model;
  try {
    model = await withTimeout(loading, 45000, "模型載入逾時，請檢查 glTF 與相依素材。");
  } catch (error) { expired = true; throw error; }
  let routeLine;
  const routeMarkers = [];
  function clearRoute() {
    if (routeLine) map.three.remove3dObject(routeLine);
    routeLine = null;
    for (const marker of routeMarkers) marker.remove();
    routeMarkers.length = 0;
    map.redraw();
  }
  return {
    clearRoute,
    showRoute(route) {
      clearRoute();
      try {
        routeLine = map.three.add3dLine({
          id: "integration-route", coordinates: route.coordinates.map((point) => [...point, 0]),
          color: "#2675eb", width: 6,
        });
        for (const [point, label, kind] of [[route.origin, "起", "origin"], [route.destination, "迄", "destination"]]) {
          const icon = document.createElement("span");
          icon.className = `route-marker route-marker-${kind}`;
          icon.textContent = label;
          routeMarkers.push(new MapThree.Marker({ position: [...point], icon, altitude: 0, title: `${label}點：${point.join(", ")}` }));
        }
        const points = [...route.coordinates, route.origin, route.destination];
        const longitudes = points.map((point) => point[0]);
        const latitudes = points.map((point) => point[1]);
        map.setPitch(0);
        map.fitBounds([
          [Math.min(...longitudes), Math.min(...latitudes)],
          [Math.max(...longitudes), Math.max(...latitudes)],
        ], { padding: 60 });
        map.redraw();
      } catch (error) { clearRoute(); throw error; }
    },
    update(current) {
      model.setCoordinates([...current.position, 0]);
      // 1.4.3 的世界座標 -X 為東、-Y 為北，校正後以 +Y 作車頭。
      // SDK 將 0 視為沿用角度，以等價的 360 表示目標零度。
      const z = (180 - current.heading + 360) % 360 || 360;
      model.setRotation({ x: 0, y: 0, z });
      map.redraw();
    },
  };
}
