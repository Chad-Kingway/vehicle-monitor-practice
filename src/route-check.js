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

export function mountRouteCheck(client) {
  const panel = document.getElementById("route-check");
  if (!new URLSearchParams(window.location.search).has("route-check")) return null;
  panel.hidden = false;
  const form = document.getElementById("route-form");
  const button = document.getElementById("route-submit");
  const status = document.getElementById("route-status");
  const result = document.getElementById("route-result");
  let busy = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    result.hidden = true;
    client.actions.clearRoute();
    busy = true;
    button.disabled = true;
    status.textContent = "向 Server 查詢…";
    try {
      const query = {
        origin: parsePosition(form.elements.origin.value, "起點"),
        destination: parsePosition(form.elements.destination.value, "終點"),
      };
      const data = await client.actions.queryRoute(query.origin, query.destination);
      document.getElementById("route-distance").textContent = `${data.distance_meters.toLocaleString("zh-TW")} 公尺`;
      document.getElementById("route-duration").textContent = `${data.duration_seconds.toLocaleString("zh-TW")} 秒`;
      document.getElementById("route-points").textContent = `${data.coordinates.length} 點`;
      document.getElementById("route-road-start").textContent = data.coordinates[0].join(", ");
      document.getElementById("route-road-end").textContent = data.coordinates.at(-1).join(", ");
      result.hidden = false;
      const map = client.getState().map;
      status.textContent = map.error ? "已取得路線；地圖繪製失敗：" + map.error
        : map.status === "ready" ? "官方路線已顯示" : "已取得官方路線；等待地圖";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
  client.subscribe(state => {
    if (!busy && !result.hidden && state.route) {
      if (state.map.error) status.textContent = "已取得路線；地圖繪製失敗：" + state.map.error;
      else if (state.map.status === "ready") status.textContent = "官方路線已顯示";
    }
  });
}
