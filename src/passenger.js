import { createVehicleMap } from "./vehicle-map.js";
import { api, element, newPassengerLink, requestCard, startPolling } from "./ui.js";

export function mountPassenger(passengerId) {
  document.title = "乘客叫車";
  const panel = document.querySelector(".panel");
  panel.replaceChildren();
  const header = element("header"); header.append(element("span", "PASSENGER", "eyebrow"), element("h1", "乘客叫車"));
  const connection = element("p", "連線中…", "connection"); connection.setAttribute("role", "status");
  const identity = element("p", `乘客 ${passengerId.slice(0, 8)}`, "identity"); identity.title = passengerId;
  const newLink = element("a", "新增乘客", "button-link"); newLink.target = "_blank"; newLink.rel = "noopener"; newPassengerLink(newLink);
  header.append(connection, identity, newLink);
  const form = element("form", undefined, "passenger-form");
  const pickPrompt = element("h2", "選取上車點");
  const pickupText = element("p", "上車點 —");
  const destinationText = element("p", "下車點 —");
  const reset = element("button", "重新選點"); reset.type = "button";
  const countLabel = element("label", "乘車人數"); countLabel.htmlFor = "passenger-count";
  const count = document.createElement("input"); count.id = "passenger-count"; count.type = "number"; count.min = "1"; count.step = "1"; count.value = "1"; count.required = true;
  const submit = element("button", "送出請求"); submit.type = "submit"; submit.disabled = true;
  const random = element("button", "隨機送出一筆"); random.type = "button";
  const actionStatus = element("p", undefined, "action-status"); actionStatus.setAttribute("role", "status");
  form.append(pickPrompt, pickupText, destinationText, reset, countLabel, count, submit, random, actionStatus);
  const requests = element("section", undefined, "list-section"); requests.append(element("h2", "我的請求"));
  const list = element("div", undefined, "record-list"); requests.append(list);
  const footer = element("footer");
  const mapStatus = element("p", "載入地圖…"); mapStatus.setAttribute("role", "status");
  const mapError = element("p", undefined, "error-text"); mapError.setAttribute("role", "alert"); footer.append(mapStatus, mapError);
  panel.append(header, form, requests, footer);
  document.querySelector(".map-caption").textContent = "依序選取上車、下車點";
  let pickup;
  let destination;
  let view;
  let busy = false;
  let runId;
  function syncPoints() {
    pickupText.textContent = pickup ? `上車點 ${pickup.map(n => n.toFixed(5)).join(", ")}` : "上車點 —";
    destinationText.textContent = destination ? `下車點 ${destination.map(n => n.toFixed(5)).join(", ")}` : "下車點 —";
    pickPrompt.textContent = !pickup ? "選取上車點" : !destination ? "選取下車點" : "確認乘車請求";
    submit.disabled = busy || !pickup || !destination;
    view?.showPoints(pickup, destination);
  }
  reset.addEventListener("click", () => { pickup = destination = undefined; syncPoints(); });
  createVehicleMap([], message => { mapStatus.textContent = message; }, { onPick(point) {
    if (busy) return;
    if (!pickup || destination) { pickup = point; destination = undefined; }
    else destination = point;
    syncPoints();
  } }).then(map => { view = map; syncPoints(); mapStatus.textContent = "地圖已就緒"; }).catch(error => { mapStatus.textContent = "地圖未就緒"; mapError.textContent = error.message; });
  async function cancel(id) {
    try {
      await api(`/api/requests/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { passenger_id: passengerId } });
      actionStatus.textContent = "已取消";
      const data = await api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`); renderRequests(data.requests);
    } catch (error) { actionStatus.textContent = error.message; }
  }
  function renderRequests(data) {
    list.replaceChildren(...data.map(request => requestCard(request, cancel)));
    if (!data.length) list.append(element("p", "尚無請求", "empty"));
  }
  async function send(isRandom) {
    if (busy) return;
    if (!isRandom && (!pickup || !destination || !form.reportValidity())) return;
    busy = true; random.disabled = true; reset.disabled = true; count.disabled = true; syncPoints();
    actionStatus.textContent = "送出中…";
    try {
      const request = await api(isRandom ? "/api/requests/random" : "/api/requests", {
        method: "POST", body: { passenger_id: passengerId, run_id: runId, client_request_id: crypto.randomUUID(), ...(isRandom ? {} : { pickup, destination, passenger_count: Number(count.value) }) },
      });
      pickup = request.pickup; destination = request.destination;
      if (isRandom) count.value = request.passenger_count;
      actionStatus.textContent = "已送出";
      const data = await api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`); renderRequests(data.requests);
    } catch (error) { actionStatus.textContent = error.message; }
    finally { busy = false; random.disabled = false; reset.disabled = false; count.disabled = false; syncPoints(); }
  }
  form.addEventListener("submit", event => { event.preventDefault(); void send(false); });
  random.addEventListener("click", () => void send(true));
  startPolling(async signal => {
    const [snapshot, own] = await Promise.all([api("/api/simulation", { signal }), api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`, { signal })]);
    // 同一輪次的資料才合併，避免重啟交錯顯示上一輪請求。
    if (snapshot.run_id !== own.run_id) throw new Error("輪次已變更");
    return { run_id: snapshot.run_id, settings: snapshot.settings, requests: own.requests };
  }, data => { runId = data.run_id; renderRequests(data.requests); }, connection);
}

