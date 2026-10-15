import { createUiClient } from "./ui-client.js";
import { element, mountMapControls, requestCard, statusLabel } from "./ui.js";

export function mountPassenger() {
  const client = createUiClient();
  const passengerId = client.getState().passengerId;
  document.title = "乘客叫車";
  const panel = document.querySelector(".panel"); panel.replaceChildren();
  const header = element("header"); header.append(element("span", "PASSENGER", "eyebrow"), element("h1", "乘客叫車"));
  const connection = element("p", "連線中…", "connection"); connection.setAttribute("role", "status");
  const identity = element("p", "乘客 " + passengerId.slice(0, 8), "identity"); identity.title = passengerId;
  header.append(connection, identity);
  const form = element("form", undefined, "passenger-form");
  const prompt = element("h2", "選取上車點");
  const pickup = element("p", "上車點 —"); const destination = element("p", "下車點 —");
  const reset = element("button", "重新選點"); reset.type = "button";
  const countLabel = element("label", "乘車人數"); countLabel.htmlFor = "passenger-count";
  const count = document.createElement("input");
  Object.assign(count, { id: "passenger-count", type: "number", min: "1", step: "1", value: "1", required: true });
  const submit = element("button", "送出請求"); submit.type = "submit";
  const random = element("button", "隨機送出一筆"); random.type = "button";
  const actionStatus = element("p", undefined, "action-status"); actionStatus.setAttribute("role", "status");
  form.append(prompt, pickup, destination, reset, countLabel, count, submit, random, actionStatus);
  const trip = element("section", undefined, "trip-progress");
  const tripStatus = element("p", "尚無目前請求", "trip-status");
  const follow = document.createElement("input"); follow.type = "checkbox";
  const followLabel = element("label", undefined, "check-label");
  followLabel.append(follow, document.createTextNode("跟隨承接車")); trip.append(tripStatus, followLabel);
  const requests = element("section", undefined, "list-section");
  const list = element("div", undefined, "record-list"); requests.append(element("h2", "我的請求"), list);
  const footer = element("footer");
  const mapStatus = element("p", "載入地圖…"); mapStatus.setAttribute("role", "status");
  const mapError = element("p", undefined, "error-text"); mapError.setAttribute("role", "alert");
  footer.append(mapStatus, mapError); panel.append(header, form, trip, requests, footer);
  document.querySelector(".map-caption").textContent = "依序選取上車、下車點";
  mountMapControls(client, document.getElementById("map").parentElement);
  const run = operation => { void operation().catch(() => {}); };
  reset.addEventListener("click", () => client.actions.setPoints());
  form.addEventListener("submit", event => { event.preventDefault(); if (form.reportValidity()) run(() => client.actions.submitRequest(Number(count.value))); });
  random.addEventListener("click", () => run(() => client.actions.submitRandomRequest()));
  follow.addEventListener("change", () => client.actions.follow(follow.checked));
  let displayedRequestId;
  client.subscribe(state => {
    const online = state.connection === "online";
    connection.textContent = online ? "Server 已連線" : state.connection === "offline" ? "Server 連線中斷" : "連線中…";
    connection.dataset.state = online ? "online" : "offline";
    pickup.textContent = "上車點 " + (state.points.pickup?.map(n => n.toFixed(5)).join(", ") || "—");
    destination.textContent = "下車點 " + (state.points.destination?.map(n => n.toFixed(5)).join(", ") || "—");
    prompt.textContent = !state.points.pickup ? "選取上車點" : !state.points.destination ? "選取下車點" : "確認乘車請求";
    submit.disabled = !state.canSubmit;
    random.disabled = reset.disabled = count.disabled = !state.canEditTrip;
    actionStatus.textContent = state.busy ? "處理中…" : state.pending ? "送出結果確認中…" : state.error || state.message;
    mapStatus.textContent = state.map.message || "載入地圖…"; mapError.textContent = state.map.error || "";
    const request = state.currentRequest;
    if (request?.id !== displayedRequestId) {
      displayedRequestId = request?.id;
      if (request) count.value = request.passenger_count;
    }
    const task = state.selectedTask;
    const active = request && !["completed", "failed", "cancelled"].includes(request.status);
    followLabel.hidden = !active || !state.selectedVehicle;
    follow.checked = state.following && Boolean(active);
    if (!request) tripStatus.textContent = "尚無目前請求";
    else if (request.status === "unconfirmed") {
      const reported = state.selectedVehicle?.last_report_at;
      tripStatus.textContent = "進度待確認 · " + statusLabel(task?.phase) + " " + Math.round((task?.progress || 0) * 100) + "% · 最後回報 " + (reported ? new Date(reported).toLocaleTimeString("zh-TW", { hour12: false }) : "—");
    } else if (["pickup", "transport"].includes(request.status)) {
      tripStatus.textContent = statusLabel(request.status) + " · " + Math.round((task?.progress || 0) * 100) + "%";
    } else tripStatus.textContent = request.status === "completed" ? "已送達" : statusLabel(request.status) + (request.failure_reason ? " · " + request.failure_reason : "");
    list.replaceChildren(...(state.snapshot?.requests || []).map(item => requestCard(item, state.canCancel ? () => client.actions.cancelRequest().catch(() => {}) : null)));
    if (!state.snapshot?.requests.length) list.append(element("p", "尚無請求", "empty"));
  });
  client.start();
  void client.mountMap(document.getElementById("map")).catch(() => {});
}

