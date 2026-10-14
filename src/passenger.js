import { createVehicleMap } from "./vehicle-map.js";
import { api, element, requestCard, startPolling } from "./ui.js";

export function mountPassenger(passengerId, { autoRandom = false } = {}) {
  document.title = "乘客叫車";
  const panel = document.querySelector(".panel");
  panel.replaceChildren();
  const header = element("header"); header.append(element("span", "PASSENGER", "eyebrow"), element("h1", "乘客叫車"));
  const connection = element("p", "連線中…", "connection"); connection.setAttribute("role", "status");
  const identity = element("p", `乘客 ${passengerId.slice(0, 8)}`, "identity"); identity.title = passengerId;
  header.append(connection, identity);
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
  const trip = element("section", undefined, "trip-progress");
  const tripStatus = element("p", "尚無目前請求", "trip-status");
  const followLabel = element("label", undefined, "check-label"); followLabel.hidden = true;
  const follow = document.createElement("input"); follow.type = "checkbox";
  followLabel.append(follow, document.createTextNode("跟隨承接車"));
  trip.append(tripStatus, followLabel);
  const list = element("div", undefined, "record-list"); requests.append(list);
  const footer = element("footer");
  const mapStatus = element("p", "載入地圖…"); mapStatus.setAttribute("role", "status");
  const mapError = element("p", undefined, "error-text"); mapError.setAttribute("role", "alert"); footer.append(mapStatus, mapError);
  panel.append(header, form, trip, requests, footer);
  document.querySelector(".map-caption").textContent = "依序選取上車、下車點";
  let pickup;
  let destination;
  let view;
  let busy = false;
  let connected = false;
  let currentRequest;
  let lastRequests = [];
  let latestData;
  let displayedRequestId;
  let framedRequestId;
  let displayedVehicle;
  let tripTerminal = false;
  let terminalRenderedRequestId;
  let pointsEdited = false;
  const pendingKey = `vehicle-monitor.pending-request.${passengerId}`;
  let pendingRequest;
  try { pendingRequest = JSON.parse(localStorage.getItem(pendingKey) || "null"); } catch { pendingRequest = null; }
  function clearPending() {
    pendingRequest = null;
    try { localStorage.removeItem(pendingKey); } catch { actionStatus.textContent = "偏好未保存"; }
  }
  function storePending(pending) {
    localStorage.setItem(pendingKey, JSON.stringify(pending));
    pendingRequest = pending;
  }
  window.addEventListener("storage", event => {
    if (event.key !== pendingKey) return;
    try { pendingRequest = JSON.parse(event.newValue || "null"); } catch { pendingRequest = null; }
    syncPoints();
  });
  let runId;
  function syncPoints() {
    pickupText.textContent = pickup ? `上車點 ${pickup.map(n => n.toFixed(5)).join(", ")}` : "上車點 —";
    destinationText.textContent = destination ? `下車點 ${destination.map(n => n.toFixed(5)).join(", ")}` : "下車點 —";
    pickPrompt.textContent = !pickup ? "選取上車點" : !destination ? "選取下車點" : "確認乘車請求";
    const active = currentRequest && !["completed", "failed", "cancelled"].includes(currentRequest.status);
    submit.disabled = !connected || busy || active || Boolean(pendingRequest) || !pickup || !destination;
    random.disabled = !connected || busy || active || Boolean(pendingRequest);
    reset.disabled = !connected || busy || active || Boolean(pendingRequest);
    count.disabled = !connected || busy || active || Boolean(pendingRequest);
    form.querySelectorAll("input, button").forEach(control => {
      if (control !== submit && control !== random && control !== reset && control !== count) control.disabled = !connected || busy || active;
    });
    view?.showPoints(pickup, destination);
  }
  reset.addEventListener("click", () => { if (!connected || pendingRequest || currentRequest && !["completed", "failed", "cancelled"].includes(currentRequest.status)) return; pickup = destination = undefined; pointsEdited = true; syncPoints(); });
  createVehicleMap([], message => { mapStatus.textContent = message; }, { onPick(point) {
    if (!connected || busy || pendingRequest || currentRequest && !["completed", "failed", "cancelled"].includes(currentRequest.status)) return;
    if (!pickup || destination) { pickup = point; destination = undefined; }
    else destination = point;
    pointsEdited = true;
    syncPoints();
  } }).then(map => { view = map; syncPoints(); updateTripMap(); mapStatus.textContent = "地圖已就緒"; }).catch(error => { mapStatus.textContent = "地圖未就緒"; mapError.textContent = error.message; });
  follow.addEventListener("change", () => { view?.follow(follow.checked && displayedVehicle ? displayedVehicle.id : null); });
  function updateTripMap() {
    const request = latestData?.requests?.[0];
    if (!request) {
      tripStatus.textContent = "尚無目前請求"; followLabel.hidden = true; follow.checked = false; view?.follow(null);
      if (displayedRequestId !== undefined) {
        view?.clearRoute(); view?.updateFleet([]);
        displayedRequestId = undefined; framedRequestId = undefined; terminalRenderedRequestId = undefined; displayedVehicle = undefined; tripTerminal = false;
      }
      return;
    }
    const active = !["completed", "failed", "cancelled"].includes(request.status);
    if (request.id !== displayedRequestId) {
      displayedRequestId = request.id; framedRequestId = undefined; tripTerminal = false; terminalRenderedRequestId = undefined; displayedVehicle = undefined;
      follow.checked = false; view?.follow(null);
    }
    if (tripTerminal && active === false && view && terminalRenderedRequestId === request.id) return;
    const task = latestData.tasks.find(item => item.id === request.task_id);
    const vehicle = request.vehicle_id ? latestData.vehicles.find(item => item.id === request.vehicle_id) : undefined;
    displayedVehicle = vehicle;
    if (active) tripTerminal = false;
    else tripTerminal = true;
    if (!active) { follow.checked = false; view?.follow(null); }
    if (displayedVehicle) {
      view?.updateFleet([displayedVehicle]);
      followLabel.hidden = !active;
      view?.follow(follow.checked && active ? displayedVehicle.id : null);
    } else {
      view?.updateFleet([]); followLabel.hidden = true; view?.follow(null);
    }
    if (task) {
      view?.showPassengerTrip(task, request, framedRequestId !== request.id && Boolean(task.pickup_route || task.transport_route));
      if (task.pickup_route || task.transport_route) framedRequestId = request.id;
    } else view?.showPoints(request.pickup, request.destination);
    const status = request.status;
    if (status === "unconfirmed") {
      const reported = displayedVehicle?.last_report_at ? new Date(displayedVehicle.last_report_at).toLocaleTimeString("zh-TW", { hour12: false }) : "—";
      tripStatus.textContent = `進度待確認 · ${task?.phase === "transport" ? "載客行駛" : "前往接人"} ${Math.round((task?.progress || 0) * 100)}% · 最後回報 ${reported}`;
    } else if (status === "pickup" || status === "transport") {
      tripStatus.textContent = `${status === "pickup" ? "前往接人" : "載客行駛"} · ${Math.round((task?.progress || 0) * 100)}%`;
    } else if (status === "completed") tripStatus.textContent = "已送達";
    else tripStatus.textContent = status === "waiting" ? "等待派車" : status === "planning" ? "規劃路線" : status === "cancelled" ? "已取消" : status === "failed" ? `失敗${request.failure_reason ? ` · ${request.failure_reason}` : ""}` : "等待派車";
    if (!active && view) terminalRenderedRequestId = request.id;
  }
  async function cancel(id) {
    if (!connected || currentRequest?.id !== id || currentRequest.status !== "waiting") return;
    busy = true; syncPoints();
    try {
      await api(`/api/requests/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { passenger_id: passengerId } });
      actionStatus.textContent = "已取消";
      const data = await api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`); renderRequests(data.requests);
    } catch (error) { actionStatus.textContent = error.message; }
    finally { busy = false; syncPoints(); }
  }
  function renderRequests(data) {
    lastRequests = data;
    const nextRequest = data[0];
    if (nextRequest?.id !== currentRequest?.id) {
      pickup = nextRequest?.pickup;
      destination = nextRequest?.destination;
      pointsEdited = false;
    } else if (nextRequest && !pointsEdited) {
      pickup = nextRequest.pickup;
      destination = nextRequest.destination;
    }
    currentRequest = nextRequest;
    if (currentRequest) count.value = String(currentRequest.passenger_count);
    list.replaceChildren(...data.map(request => requestCard(request, connected ? cancel : null)));
    if (!data.length) list.append(element("p", "尚無請求", "empty"));
    syncPoints();
    updateTripMap();
  }
  async function send(isRandom) {
    if (!connected || busy || pendingRequest || currentRequest && !["completed", "failed", "cancelled"].includes(currentRequest.status)) return;
    if (!isRandom && (!pickup || !destination || !form.reportValidity())) return;
    const payload = { passenger_id: passengerId, run_id: runId, client_request_id: crypto.randomUUID(), ...(isRandom ? {} : { pickup, destination, passenger_count: Number(count.value) }) };
    const pending = { run_id: runId, endpoint: isRandom ? "/api/requests/random" : "/api/requests", payload };
    try { storePending(pending); }
    catch { actionStatus.textContent = "無法保存送出資料"; return; }
    busy = true; random.disabled = true; reset.disabled = true; count.disabled = true; syncPoints();
    actionStatus.textContent = "送出中…";
    try {
      const request = await api(pending.endpoint, { method: "POST", body: pending.payload });
      clearPending();
      pickup = request.pickup; destination = request.destination;
      if (isRandom) count.value = request.passenger_count;
      actionStatus.textContent = "已送出";
      const data = await api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`); renderRequests(data.requests);
    } catch (error) {
      try {
        const data = await api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`);
        if (data.requests[0] && !["completed", "failed", "cancelled"].includes(data.requests[0].status)) { clearPending(); actionStatus.textContent = "已同步目前請求"; renderRequests(data.requests); }
        else actionStatus.textContent = "送出結果確認中…";
      } catch { actionStatus.textContent = "送出結果確認中…"; }
      if (!pendingRequest) actionStatus.textContent = error.message;
    }
    finally { busy = false; syncPoints(); }
  }
  form.addEventListener("submit", event => { event.preventDefault(); void send(false); });
  random.addEventListener("click", () => void send(true));
  function consumeAutoRandom() {
    if (!autoRandom) return;
    autoRandom = false;
    const url = new URL(location.href);
    url.searchParams.delete("random");
    history.replaceState(history.state, "", url);
    void send(true);
  }
  startPolling(async signal => {
    const [snapshot, own] = await Promise.all([api("/api/simulation", { signal }), api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`, { signal })]);
    // 同一輪次的資料才合併，避免重啟交錯顯示上一輪請求。
    if (snapshot.run_id !== own.run_id) throw new Error("輪次已變更");
    if (pendingRequest && pendingRequest.run_id !== snapshot.run_id) {
      clearPending(); actionStatus.textContent = "模擬已重新開始";
    } else if (pendingRequest) {
      let confirmed = own.requests.some(request => request.client_request_id === pendingRequest.payload.client_request_id);
      const serverActive = own.requests.find(request => !["completed", "failed", "cancelled"].includes(request.status));
      let synchronized = false;
      if (!confirmed && serverActive) {
        synchronized = true; confirmed = true;
      }
      if (!confirmed) {
        try {
          await api(pendingRequest.endpoint, { method: "POST", body: pendingRequest.payload, signal });
          const refreshed = await api(`/api/requests?passenger_id=${encodeURIComponent(passengerId)}`, { signal });
          confirmed = Boolean(refreshed.requests[0] && (refreshed.requests[0].client_request_id === pendingRequest.payload.client_request_id || !["completed", "failed", "cancelled"].includes(refreshed.requests[0].status)));
          if (confirmed) own.requests = refreshed.requests;
        } catch { actionStatus.textContent = "送出結果確認中…"; }
      }
      if (confirmed) { clearPending(); actionStatus.textContent = synchronized ? "已同步目前請求" : "已恢復原次請求"; }
    }
    return { ...snapshot, requests: own.requests };
  }, data => { runId = data.run_id; latestData = data; renderRequests(data.requests); }, connection, (ok) => {
    connected = ok;
    if (ok) { renderRequests(lastRequests); consumeAutoRandom(); }
    else list.replaceChildren(...lastRequests.map(request => requestCard(request)));
    syncPoints();
  });
}

