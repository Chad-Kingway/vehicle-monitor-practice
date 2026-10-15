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
function refreshPassengerHref(link, random) {
  const target = new URL(location.pathname, location.origin);
  target.searchParams.set("passenger", crypto.randomUUID());
  if (random) target.searchParams.set("random", "1");
  link.href = target.pathname + target.search;
}
export function newPassengerLink(link) {
  const refresh = () => refreshPassengerHref(link, false);
  refresh();
  link.addEventListener("click", refresh);
  link.addEventListener("auxclick", refresh);
}
export function newRandomPassengerLink(link) {
  const refresh = () => refreshPassengerHref(link, true);
  refresh();
  link.addEventListener("click", refresh);
  link.addEventListener("auxclick", refresh);
}
export async function api(url, { method = "GET", body, signal } = {}) {
  const response = await fetch(url, {
    method, cache: "no-store", signal: signal || AbortSignal.timeout(15000),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (typeof data.detail === "string") throw new Error(data.detail);
    if (Array.isArray(data.detail)) {
      const labels = { report_interval_seconds: "車輛回報間隔", poll_interval_seconds: "網頁更新間隔" };
      const messages = data.detail.map(item => {
        const field = labels[item.loc?.at(-1)];
        if (field && item.type === "greater_than_equal") return `${field}不得小於 0.1 秒。`;
        if (field && item.type === "less_than_equal") return `${field}不得大於 60 秒。`;
        return String(item.msg || "設定無效").replace(/^Value error, /, "");
      });
      throw new Error(messages.join(" "));
    }
    throw new Error(`HTTP ${response.status}`);
  }
  return data;
}
// 只有成功讀取才替換畫面資料，斷線保留最後狀態。
export function startPolling(load, render, connection, onStatus) {
  let stopped = false;
  let timer;
  let controller;
  let interval = 1000;
  async function poll() {
    if (stopped) return;
    const started = performance.now();
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const data = await load(controller.signal);
      interval = (data.settings?.poll_interval_seconds || interval / 1000) * 1000;
      render(data);
      connection.textContent = "Server 已連線";
      connection.dataset.state = "online";
      onStatus?.(true);
    } catch {
      if (!stopped) {
        connection.textContent = "Server 連線中斷";
        connection.dataset.state = "offline";
        onStatus?.(false);
      }
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(poll, Math.max(0, interval - (performance.now() - started)));
    }
  }
  window.addEventListener("pagehide", () => { stopped = true; clearTimeout(timer); controller?.abort(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) { stopped = false; void poll(); } });
  void poll();
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

