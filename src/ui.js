export const statusLabels = {
  waiting: "等待派車", planning: "規劃路線", pickup: "前往接人", transport: "載客行駛",
  completed: "完成", failed: "失敗", cancelled: "已取消", unconfirmed: "進度待確認",
};
export function statusLabel(status) { return statusLabels[status] || status || "空閒"; }
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export async function api(url, { method = "GET", body, signal, timeout = 15000 } = {}) {
  const response = await fetch(url, {
    method, cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const fail = (message) => { throw Object.assign(new Error(message), { status: response.status }); };
    if (typeof data.detail === "string") fail(data.detail);
    if (Array.isArray(data.detail)) {
      const labels = { report_interval_seconds: "車輛回報間隔", poll_interval_seconds: "網頁更新間隔" };
      const messages = data.detail.map(item => {
        const field = labels[item.loc?.at(-1)];
        if (field && item.type === "greater_than_equal") return `${field}不得小於 0.1 秒。`;
        if (field && item.type === "less_than_equal") return `${field}不得大於 60 秒。`;
        return String(item.msg || "設定無效").replace(/^Value error, /, "");
      });
      fail(messages.join(" "));
    }
    fail(`HTTP ${response.status}`);
  }
  return data;
}
export function mountMapControls(client, region) {
  const controls = element("div", undefined, "map-controls");
  const poi = element("button", "POI：顯示"); poi.type = "button";
  const label = element("label", "模型比例", "map-scale-control");
  const scale = document.createElement("input");
  Object.assign(scale, { type: "range", min: "1", max: "100", step: "1", value: "30" });
  scale.setAttribute("aria-label", "模型比例");
  const output = element("output", "30");
  const status = element("span", undefined, "map-preference-status"); status.setAttribute("role", "status");
  label.append(scale, output); controls.append(poi, label, status); region.append(controls);
  client.subscribe(state => {
    const preferences = state.map.preferences;
    const ready = state.map.status === "ready";
    poi.disabled = !ready || preferences?.poiDisabled;
    scale.disabled = !ready || preferences?.scaleDisabled;
    if (!preferences) return;
    poi.textContent = "POI：" + (preferences.poi ? "顯示" : "隱藏");
    scale.value = preferences.scale; output.value = preferences.scale;
    status.textContent = preferences.error;
  });
  const apply = values => {
    try { client.actions.setMapPreferences(values); }
    catch (error) { status.textContent = error.message; }
  };
  poi.addEventListener("click", () => apply({ poi: !client.getState().map.preferences.poi }));
  scale.addEventListener("input", () => apply({ scale: Number(scale.value) }));
}
export function requestCard(request, cancel) {
  const card = element("article", undefined, "record-card");
  const heading = element("div", undefined, "card-heading");
  heading.append(element("strong", `${request.id} · ${request.passenger_count} 人`), element("span", statusLabel(request.status), "badge"));
  card.append(heading);
  const points = element("p", `上 ${request.pickup.map(n => n.toFixed(5)).join(", ")} → 下 ${request.destination.map(n => n.toFixed(5)).join(", ")}`);
  card.append(points);
  if (request.vehicle_id) card.append(element("p", request.vehicle_id));
  if (request.failure_reason) card.append(element("p", request.failure_reason, "error-text"));
  if (cancel && request.status === "waiting") {
    const button = element("button", "取消請求");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await cancel(request.id); } finally { button.disabled = false; }
    });
    card.append(button);
  }
  return card;
}

