import "./style.css";
import { createVehicleMap } from "./vehicle-map.js";

const ui = Object.fromEntries([
  "connection", "vehicle-id", "vehicle-status", "longitude", "latitude", "heading", "capacity",
  "last-report", "speed", "report-interval", "poll-interval", "run-id", "map-status", "map-error",
].map((id) => [id, document.getElementById(id)]));
let interval = 1000;
let latestVehicle;
let mapView;
let mapStarted = false;
let stopped = false;
let timer;
let request;

function mapStatus(message) { ui["map-status"].textContent = message; }
function mapError(error) {
  mapStatus("地圖未就緒");
  ui["map-error"].textContent = error.message || "地圖更新失敗，請重新整理。";
  ui["map-error"].hidden = false;
}

function render(snapshot) {
  const vehicle = snapshot.vehicles[0];
  latestVehicle = vehicle;
  const settings = snapshot.settings;
  interval = settings.poll_interval_seconds * 1000;
  ui.connection.textContent = "Server 已連線";
  ui.connection.dataset.state = "online";
  ui["vehicle-id"].textContent = vehicle.id;
  ui["vehicle-status"].textContent = vehicle.last_report_at
    ? (vehicle.connection_status === "online" ? "已連線" : "離線") : "尚未回報";
  ui["vehicle-status"].dataset.state = vehicle.connection_status;
  ui.longitude.textContent = vehicle.position[0].toFixed(6);
  ui.latitude.textContent = vehicle.position[1].toFixed(6);
  ui.heading.textContent = `${vehicle.heading.toFixed(0)}°`;
  ui.capacity.textContent = `${vehicle.passenger_capacity} 人`;
  ui["last-report"].textContent = vehicle.last_report_at
    ? new Date(vehicle.last_report_at).toLocaleTimeString("zh-TW", { hour12: false }) : "—";
  ui.speed.textContent = `${settings.speed_multiplier}×`;
  ui["report-interval"].textContent = `${settings.report_interval_seconds} 秒`;
  ui["poll-interval"].textContent = `${settings.poll_interval_seconds} 秒`;
  ui["run-id"].textContent = snapshot.run_id.slice(0, 8);
  ui["run-id"].title = snapshot.run_id;
  if (mapView) {
    try { mapView.update(vehicle); }
    catch (error) { mapError(error); }
  } else if (!mapStarted) {
    mapStarted = true;
    // 地圖初始化不阻擋 HTTP 輪詢；模型載入後套用最新的 Server 資料。
    createVehicleMap(vehicle, mapStatus).then((view) => {
      mapView = view;
      view.update(latestVehicle);
      mapStatus("地圖與模型已就緒");
    }).catch(mapError);
  }
}

async function poll() {
  if (stopped) return;
  const started = performance.now();
  request = new AbortController();
  const timeout = setTimeout(() => request.abort(), 5000);
  try {
    const response = await fetch("/api/simulation", { signal: request.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch {
    if (!stopped) {
      ui.connection.textContent = "Server 連線中斷";
      ui.connection.dataset.state = "offline";
    }
  } finally {
    clearTimeout(timeout);
    if (!stopped) timer = setTimeout(poll, Math.max(0, interval - (performance.now() - started)));
  }
}

window.addEventListener("pagehide", () => {
  stopped = true;
  clearTimeout(timer);
  request?.abort();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) { stopped = false; void poll(); }
});
void poll();
