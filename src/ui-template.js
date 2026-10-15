import { createUiClient } from "./ui-client.js";

const $ = (id) => document.getElementById(id);
const client = createUiClient();
const labels = {
  waiting: "等待派車",
  planning: "規劃路線",
  pickup: "前往接人",
  transport: "載客行駛",
  completed: "已送達",
  failed: "接送失敗",
  cancelled: "已取消",
  unconfirmed: "進度待確認",
};
const connectionLabels = {
  idle: "尚未連線",
  connecting: "連線中",
  online: "已連線",
  offline: "連線中斷",
  stopped: "已暫停",
};
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const coords = (point) =>
  point ? point.map((value) => value.toFixed(5)).join(", ") : "";
const status = (value) => labels[value] || value;
const badge = (text, type = "") =>
  `<span class="badge ${type}">${escape(text)}</span>`;
let state = client.getState();
let activeTab = "vehicles";
let localError = "";
let settingsDirty = false;
let lastPoints = "";
let speedTimer;
let queuedSpeed = null;
const htmlCache = new Map();

// 僅更新變動的資訊區，保留地圖、表單焦點與清單捲動位置。
function html(id, content) {
  if (htmlCache.get(id) === content) return;
  htmlCache.set(id, content);
  $(id).innerHTML = content;
}
function inputValue(id, value) {
  if (document.activeElement !== $(id)) $(id).value = value;
}
function showNotice() {
  const message =
    localError ||
    state.error ||
    (state.pending ? "送出結果確認中，請稍候" : state.message);
  $("notice").hidden = !message;
  $("notice").textContent = message || "";
  $("notice").classList.toggle("error", Boolean(localError || state.error));
}
async function perform(operation) {
  localError = "";
  try {
    await operation();
  } catch (error) {
    localError = error.message || "操作失敗";
  }
  showNotice();
}
function parsePoint(value) {
  const parts = value.trim().split(/[,，\s]+/);
  const point = parts.map(Number);
  if (
    parts.length !== 2 ||
    !point.every(Number.isFinite) ||
    Math.abs(point[0]) > 180 ||
    Math.abs(point[1]) > 90
  ) {
    throw new Error("請輸入有效的經度, 緯度。");
  }
  return point;
}
function vehicleStatus(vehicle) {
  if (vehicle.connection_status === "offline") return badge("離線", "offline");
  const task = state.snapshot?.tasks.find(
    (item) => item.id === vehicle.task_id,
  );
  return task ? badge(status(task.status), "active") : badge("可派車");
}
function renderList() {
  const query = $("search").value.trim().toLowerCase();
  if (!state.snapshot) {
    html("fleet-list", '<p class="empty">等待 Server 資料</p>');
    return;
  }
  const items =
    activeTab === "vehicles"
      ? state.snapshot.vehicles
      : [...state.snapshot.requests].sort((a, b) => b.sequence - a.sequence);
  const filtered = items.filter((item) =>
    `${item.id} ${item.vehicle_id || ""} ${item.passenger_id || ""}`
      .toLowerCase()
      .includes(query),
  );
  html(
    "fleet-list",
    filtered
      .map((item) =>
        activeTab === "vehicles"
          ? `<button class="vehicle-card ${item.id === state.selectedVehicleId ? "selected" : ""}" data-vehicle="${escape(item.id)}" aria-pressed="${item.id === state.selectedVehicleId}"><div class="card-top"><span class="card-id">${escape(item.id)}</span>${vehicleStatus(item)}</div><div class="card-bottom"><span>載客上限 ${item.passenger_capacity} 人</span><span>${item.task_id ? "執行任務中" : "尚無任務"}</span></div></button>`
          : `<article class="vehicle-card"><div class="card-top"><span class="card-id">乘車請求 #${item.sequence}</span>${badge(status(item.status), ["failed", "unconfirmed"].includes(item.status) ? "offline" : "active")}</div><div class="card-bottom"><span>${item.passenger_count} 人 · ${escape(item.vehicle_id || "等待指派")}</span><span>${new Date(item.created_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })}</span></div>${item.vehicle_id ? `<button class="text-button" data-vehicle="${escape(item.vehicle_id)}" style="padding:12px 0 0">查看車輛 ↗</button>` : ""}</article>`,
      )
      .join("") || '<p class="empty">沒有符合的資料</p>',
  );
}
function renderDetail() {
  const vehicle = state.selectedVehicle;
  const task = state.selectedTask;
  if (!vehicle) {
    html(
      "vehicle-detail",
      `<p class="detail-kicker">${state.mode === "passenger" ? "YOUR JOURNEY" : "VEHICLE DETAIL"}</p><h2 style="font-size:17px">${state.mode === "passenger" ? "行程從這裡開始" : "尚無車輛"}</h2><p class="empty" style="text-align:left;padding:14px 0 0">${state.mode === "passenger" ? (state.canEditTrip ? "點選地圖，依序選擇上車點與下車點。" : "等待乘車資訊同步") : "連線後選取車輛查看動態"}</p>`,
    );
    return;
  }
  const progress = Math.round(
    Math.min(1, Math.max(0, task?.progress || 0)) * 100,
  );
  html(
    "vehicle-detail",
    `<p class="detail-kicker">${state.mode === "passenger" ? "YOUR VEHICLE" : "SELECTED VEHICLE"}</p><div class="detail-title"><h2>${escape(vehicle.id)}</h2>${vehicleStatus(vehicle)}</div><div class="detail-stats"><div><span>目前階段</span><strong>${task ? escape(status(task.status)) : "待命中"}</strong></div><div><span>載客人數 / 上限</span><strong>${task?.passenger_count || 0} / ${vehicle.passenger_capacity} 人</strong></div><div><span>階段進度</span><strong>${task ? `${progress}%` : "—"}</strong></div></div>${task ? `<div class="progress-track" role="progressbar" aria-label="階段進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><div style="width:${progress}%"></div></div>` : ""}<div class="detail-actions"><button data-action="locate" ${state.map.status !== "ready" ? "disabled" : ""}>◎ 定位車輛</button><button data-action="follow" aria-pressed="${state.following}" ${state.map.status !== "ready" || (state.mode === "passenger" && ["completed", "failed", "cancelled"].includes(state.currentRequest?.status)) ? "disabled" : ""}>${state.following ? "跟隨中" : "跟隨車輛"}</button></div>`,
  );
}
function renderPassenger() {
  const request = state.currentRequest;
  html(
    "trip-state",
    `${state.pending ? "送出結果確認中" : request ? escape(status(request.status)) : "準備出發"}<small>${escape(state.passengerId)}</small>`,
  );
  const pointsKey = JSON.stringify(state.points);
  if (pointsKey !== lastPoints) {
    lastPoints = pointsKey;
    $("pickup").value = coords(state.points.pickup);
    $("destination").value = coords(state.points.destination);
  }
  for (const id of [
    "pickup",
    "destination",
    "passenger-count",
    "apply-points",
    "reset-points",
    "random-trip",
  ])
    $(id).disabled = !state.canEditTrip;
  $("submit-trip").disabled = !state.canSubmit;
  $("cancel-trip").hidden = !state.canCancel;
  $("cancel-trip").disabled = state.busy;
  html(
    "passenger-detail",
    request
      ? `目前請求 #${request.sequence} · ${request.passenger_count} 人<br>${escape(request.vehicle_id || "等待指派車輛")}${request.failure_reason ? `<br>${escape(request.failure_reason)}` : ""}`
      : "",
  );
}
function render(next) {
  state = next;
  const passenger = state.mode === "passenger";
  $("monitor-panel").hidden = passenger;
  $("passenger-panel").hidden = !passenger;
  $("passenger-link").hidden = passenger;
  $("workspace-name").textContent = passenger ? "乘客行程" : "車隊監控台";
  $("section-label").textContent = passenger ? "LET’S GO" : "OPERATIONS";
  $("page-title").textContent = passenger ? "下一站，出發。" : "掌握每一段行程";
  $("connection").textContent = connectionLabels[state.connection];
  $("connection").className = `connection ${state.connection}`;
  $("map-caption").textContent = passenger ? "我的接送行程" : "即時車隊地圖";
  $("map-placeholder").hidden = state.map.status === "ready";
  $("map-placeholder-title").textContent =
    state.map.status === "error" ? "地圖暫時無法使用" : "正在載入地圖";
  $("map-placeholder-message").textContent =
    state.map.status === "error"
      ? `${state.map.error || "初始化失敗"}；請重新整理頁面。`
      : state.map.message || "連接地圖服務中";
  $("map-status").textContent =
    state.map.error || state.map.message || "地圖初始化中";
  const preferences = state.map.preferences;
  $("poi").disabled =
    state.map.status !== "ready" || !preferences || preferences.poiDisabled;
  $("scale").disabled =
    state.map.status !== "ready" || !preferences || preferences.scaleDisabled;
  $("poi").checked = preferences?.poi ?? false;
  if (preferences) inputValue("scale", preferences.scale);
  $("scale-label").textContent = preferences ? `${preferences.scale}%` : "—";
  $("preference-error").textContent = preferences?.error || "";
  const locked = state.busy || state.connection !== "online";
  for (const id of [
    "speed",
    "report-interval",
    "poll-interval",
    "save-settings",
    "query-route",
  ])
    $(id).disabled = locked;
  $("route-panel").hidden = passenger || !state.routeCheck;
  $("route-result").textContent = state.route
    ? `${(state.route.distance_meters / 1000).toFixed(2)} km · ${Math.ceil(state.route.duration_seconds / 60)} 分鐘`
    : "";
  const settings = state.snapshot?.settings;
  if (settings && !settingsDirty) {
    if (queuedSpeed === null) {
      inputValue("speed", settings.speed_multiplier);
      $("speed-label").textContent = `${$("speed").value}×`;
    }
    inputValue("report-interval", settings.report_interval_seconds);
    inputValue("poll-interval", settings.poll_interval_seconds);
  }
  if (settings)
    $("report-interval").max = Math.min(
      60,
      Math.ceil(settings.offline_threshold_seconds * 20 - 1) / 20,
    );
  if (passenger) renderPassenger();
  else {
    const vehicles = state.snapshot?.vehicles || [];
    const requests = state.snapshot?.requests || [];
    const metric = (value, label) =>
      `<div class="metric"><strong>${state.snapshot ? value : "—"}</strong><span>${label}</span></div>`;
    html(
      "metrics",
      metric(
        vehicles.filter((v) => v.connection_status === "online").length,
        "在線車輛",
      ) +
        metric(
          requests.filter((r) => r.status === "waiting").length,
          "等待派車",
        ) +
        metric(
          requests.filter((r) => r.status === "completed").length,
          "已送達",
        ),
    );
    renderList();
  }
  $("settings-panel").hidden =
    passenger || $("settings-toggle").getAttribute("aria-expanded") !== "true";
  $("page-subtitle").textContent = passenger ? "安排接送行程" : "車隊動態";
  const vehicle = state.selectedVehicle;
  const task = state.selectedTask;
  const request = passenger
    ? state.currentRequest
    : state.snapshot?.requests.find((item) => item.id === task?.request_id);
  const row = (label, value) =>
    `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`;
  html(
    "telemetry",
    vehicle
      ? `<dl>${row("目前位置", coords(vehicle.position))}${row("最後回報", vehicle.last_report_at ? new Date(vehicle.last_report_at).toLocaleTimeString("zh-TW", { hour12: false }) : "尚無回報")}${request ? row("上車點", coords(request.pickup)) + row("下車點", coords(request.destination)) : ""}${task?.failure_reason ? row("任務狀態", task.failure_reason) : ""}</dl>`
      : '<p class="empty">尚無行程資訊</p>',
  );
  renderDetail();
  showNotice();
  if (!locked && queuedSpeed !== null) scheduleSpeed();
}
function scheduleSpeed() {
  clearTimeout(speedTimer);
  speedTimer = setTimeout(async () => {
    if (state.busy || state.connection !== "online" || queuedSpeed === null)
      return;
    const value = queuedSpeed;
    queuedSpeed = null;
    await perform(() => client.actions.setSpeed(value));
  }, 400);
}
$("speed").addEventListener("input", () => {
  queuedSpeed = Number($("speed").value);
  $("speed-label").textContent = `${queuedSpeed}×`;
  scheduleSpeed();
});
for (const id of ["report-interval", "poll-interval"])
  $(id).addEventListener("input", () => {
    settingsDirty = true;
  });
$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void perform(async () => {
    await client.actions.setIntervals(
      Number($("report-interval").value),
      Number($("poll-interval").value),
    );
    settingsDirty = false;
    render(client.getState());
  });
});
for (const tab of ["vehicles", "requests"])
  $(tab + "-tab").addEventListener("click", () => {
    activeTab = tab;
    for (const name of ["vehicles", "requests"])
      $(name + "-tab").setAttribute("aria-selected", String(name === tab));
    $("fleet-list").setAttribute("aria-labelledby", tab + "-tab");
    $("search").placeholder =
      tab === "vehicles" ? "搜尋車輛識別碼" : "搜尋請求、乘客或車輛";
    renderList();
  });
$("search").addEventListener("input", renderList);
$("fleet-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-vehicle]");
  if (button)
    void perform(() => client.actions.selectVehicle(button.dataset.vehicle));
});
$("vehicle-detail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  void perform(() =>
    button.dataset.action === "locate"
      ? client.actions.locate()
      : client.actions.follow(!state.following),
  );
});
function togglePanel(panel, toggle, open = $(panel).hidden) {
  $(panel).hidden = !open;
  $(toggle).setAttribute("aria-expanded", String(open));
}
$("settings-toggle").addEventListener("click", () => {
  togglePanel("map-settings", "map-settings-toggle", false);
  togglePanel("settings-panel", "settings-toggle");
});
$("settings-close").addEventListener("click", () =>
  togglePanel("settings-panel", "settings-toggle", false),
);
$("map-settings-toggle").addEventListener("click", () => {
  togglePanel("map-settings", "map-settings-toggle");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const [panel, toggle] of [
    ["settings-panel", "settings-toggle"],
    ["map-settings", "map-settings-toggle"],
  ]) {
    if (!$(panel).hidden) {
      togglePanel(panel, toggle, false);
      $(toggle).focus();
    }
  }
});
$("poi").addEventListener(
  "change",
  () =>
    void perform(() =>
      client.actions.setMapPreferences({ poi: $("poi").checked }),
    ),
);
$("scale").addEventListener("input", () => {
  $("scale-label").textContent = `${$("scale").value}%`;
});
$("scale").addEventListener(
  "change",
  () =>
    void perform(() =>
      client.actions.setMapPreferences({ scale: Number($("scale").value) }),
    ),
);
function applyPoints() {
  client.actions.setPoints({
    pickup: parsePoint($("pickup").value),
    destination: parsePoint($("destination").value),
  });
}
$("apply-points").addEventListener("click", () => void perform(applyPoints));
$("trip-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void perform(async () => {
    applyPoints();
    await client.actions.submitRequest(Number($("passenger-count").value));
  });
});
$("reset-points").addEventListener(
  "click",
  () => void perform(() => client.actions.setPoints()),
);
$("random-trip").addEventListener(
  "click",
  () => void perform(() => client.actions.submitRandomRequest()),
);
$("cancel-trip").addEventListener(
  "click",
  () => void perform(() => client.actions.cancelRequest()),
);
$("route-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void perform(() =>
    client.actions.queryRoute(
      parsePoint($("route-origin").value),
      parsePoint($("route-destination").value),
    ),
  );
});
$("clear-route").addEventListener(
  "click",
  () => void perform(() => client.actions.clearRoute()),
);
$("passenger-link").href = client.passengerUrl();
$("random-link").href = client.passengerUrl({ random: true });
client.subscribe(render);
client.start();
void client.mountMap($("map")).catch(() => {});
