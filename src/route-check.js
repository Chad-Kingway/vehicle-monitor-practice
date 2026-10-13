function parsePosition(text, label) {
  const parts = text.split(",").map((part) => part.trim());
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const point = parts.map(Number);
  if (parts.length !== 2 || !parts.every((part) => numeric.test(part))
    || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
    throw new Error(`${label}請輸入有效的經度, 緯度。`);
  }
  return point;
}

export function mountRouteCheck() {
  const panel = document.getElementById("route-check");
  if (!new URLSearchParams(window.location.search).has("route-check")) return null;
  panel.hidden = false;
  const form = document.getElementById("route-form");
  const button = document.getElementById("route-submit");
  const status = document.getElementById("route-status");
  const result = document.getElementById("route-result");
  let view;
  let route;
  let request;

  function draw() {
    if (!route || !view) return;
    try {
      view.showRoute(route);
      status.textContent = "官方路線已顯示";
    } catch (error) {
      status.textContent = `已取得路線；地圖繪製失敗：${error.message}`;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (request) return;
    route = null;
    result.hidden = true;
    view?.clearRoute();
    button.disabled = true;
    status.textContent = "向 Server 查詢…";
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const query = {
        origin: parsePosition(form.elements.origin.value, "起點"),
        destination: parsePosition(form.elements.destination.value, "終點"),
      };
      const response = await fetch("/api/routes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `路線查詢失敗（HTTP ${response.status}）。`);
      route = data;
      document.getElementById("route-distance").textContent = `${data.distance_meters.toLocaleString("zh-TW")} 公尺`;
      document.getElementById("route-duration").textContent = `${data.duration_seconds.toLocaleString("zh-TW")} 秒`;
      document.getElementById("route-points").textContent = `${data.coordinates.length} 點`;
      document.getElementById("route-road-start").textContent = data.coordinates[0].join(", ");
      document.getElementById("route-road-end").textContent = data.coordinates.at(-1).join(", ");
      result.hidden = false;
      status.textContent = "已取得官方路線；等待地圖";
      draw();
    } catch (error) {
      status.textContent = controller.signal.aborted ? "路線查詢逾時或已中止。" : error.message;
    } finally {
      clearTimeout(timeout);
      request = null;
      button.disabled = false;
    }
  });
  window.addEventListener("pagehide", () => request?.abort());
  return { attachMap(mapView) { view = mapView; draw(); } };
}
