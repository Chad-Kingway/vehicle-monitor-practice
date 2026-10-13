import { createVehicleMap } from "./vehicle-map.js";
import { mountRouteCheck } from "./route-check.js";
import { api, element, newPassengerLink, requestCard, startPolling, statusLabel } from "./ui.js";

export function mountMonitor() {
  const routeCheck = mountRouteCheck();
  const byId = (id) => document.getElementById(id);
  const header = document.querySelector("header");
  const newLink = element("a", "新增乘客", "button-link");
  newLink.target = "_blank"; newLink.rel = "noopener";
  newPassengerLink(newLink); header.append(newLink);
  const fleet = element("section", undefined, "list-section");
  fleet.append(element("h2", "車隊"));
  const fleetList = element("div", undefined, "record-list"); fleet.append(fleetList);
  document.querySelector(".vehicle-card").before(fleet);
  const controls = element("div", undefined, "actions");
  const locate = element("button", "定位"); locate.type = "button";
  const followLabel = element("label", undefined, "check-label");
  const follow = document.createElement("input"); follow.type = "checkbox";
  followLabel.append(follow, document.createTextNode("跟隨")); controls.append(locate, followLabel);
  document.querySelector(".vehicle-card").append(controls);
  const requests = element("section", undefined, "list-section"); requests.append(element("h2", "乘車請求"));
  const requestList = element("div", undefined, "record-list"); requests.append(requestList);
  const tasks = element("section", undefined, "list-section"); tasks.append(element("h2", "接送任務"));
  const taskList = element("div", undefined, "record-list"); tasks.append(taskList);
  document.querySelector(".settings").before(requests, tasks);
  const speedForm = element("form", undefined, "speed-form");
  const speedInput = document.createElement("input"); speedInput.type = "number"; speedInput.min = ".1"; speedInput.step = ".1"; speedInput.required = true; speedInput.setAttribute("aria-label", "全車速度倍率");
  const speedButton = element("button", "套用速度"); speedButton.type = "submit";
  const speedStatus = element("p"); speedStatus.setAttribute("role", "status");
  speedForm.append(speedInput, speedButton, speedStatus); document.querySelector(".settings").before(speedForm);
  let snapshot;
  let selected;
  let mapView;
  let started = false;
  let routeKey;
  const mapStatus = (message) => { byId("map-status").textContent = message; };
  function mapError(error) { byId("map-error").textContent = error.message; byId("map-error").hidden = false; }
  function selectedVehicle() { return snapshot?.vehicles.find(v => v.id === selected); }
  function renderSelection() {
    const vehicle = selectedVehicle();
    if (!vehicle) return;
    byId("vehicle-id").textContent = vehicle.id;
    const task = snapshot.tasks.find(t => t.id === vehicle.task_id);
    byId("vehicle-status").textContent = vehicle.connection_status === "offline" ? "離線" : statusLabel(task?.status);
    byId("vehicle-status").dataset.state = vehicle.connection_status;
    byId("longitude").textContent = vehicle.position[0].toFixed(6);
    byId("latitude").textContent = vehicle.position[1].toFixed(6);
    byId("heading").textContent = `${vehicle.heading.toFixed(0)}°`;
    byId("capacity").textContent = `${vehicle.passenger_capacity} 人`;
    byId("last-report").textContent = vehicle.last_report_at ? new Date(vehicle.last_report_at).toLocaleTimeString("zh-TW", { hour12: false }) : "—";
    if (mapView) {
      const key = task ? `${task.id}:${Boolean(task.pickup_route)}:${Boolean(task.transport_route)}` : selected;
      if (routeKey !== key) {
        routeKey = key;
        if (task?.pickup_route && task?.transport_route) {
          try { mapView.showTask(task); } catch (error) { mapError(error); }
        }
        else mapView.clearRoute();
      }
      mapView.follow(follow.checked ? selected : null);
    }
  }
  locate.addEventListener("click", () => { const vehicle = selectedVehicle(); if (vehicle) mapView?.locate(vehicle.position); });
  follow.addEventListener("change", renderSelection);
  speedForm.addEventListener("submit", async (event) => {
    event.preventDefault(); speedButton.disabled = true;
    try {
      const data = await api("/api/simulation/speed", { method: "PUT", body: { speed_multiplier: Number(speedInput.value) } });
      speedStatus.textContent = `已套用 ${data.settings.speed_multiplier}×`;
    } catch (error) { speedStatus.textContent = error.message; }
    finally { speedButton.disabled = false; }
  });
  function render(data) {
    if (snapshot?.run_id !== data.run_id) routeKey = undefined;
    snapshot = data;
    if (!selectedVehicle()) selected = data.vehicles[0]?.id;
    fleetList.replaceChildren(...data.vehicles.map(vehicle => {
      const button = element("button", undefined, "fleet-item"); button.type = "button";
      button.classList.toggle("selected", vehicle.id === selected);
      const task = data.tasks.find(t => t.id === vehicle.task_id);
      button.append(element("strong", vehicle.id), element("span", `${vehicle.passenger_capacity} 人 · ${vehicle.connection_status === "offline" ? "離線" : statusLabel(task?.status)}`));
      button.addEventListener("click", () => { selected = vehicle.id; routeKey = undefined; render(data); });
      return button;
    }));
    requestList.replaceChildren(...data.requests.map(r => requestCard(r)));
    if (!data.requests.length) requestList.append(element("p", "尚無請求", "empty"));
    taskList.replaceChildren(...data.tasks.map(task => {
      const card = element("article", undefined, "record-card");
      card.append(element("strong", `${task.id} · ${task.vehicle_id}`), element("p", `${statusLabel(task.status)} · ${Math.round(task.progress * 100)}%`));
      if (task.status === "unconfirmed") card.append(element("p", statusLabel(task.phase)));
      return card;
    }));
    if (!data.tasks.length) taskList.append(element("p", "尚無任務", "empty"));
    byId("speed").textContent = `${data.settings.speed_multiplier}×`;
    if (document.activeElement !== speedInput && !speedButton.disabled) speedInput.value = data.settings.speed_multiplier;
    byId("report-interval").textContent = `${data.settings.report_interval_seconds} 秒`;
    byId("poll-interval").textContent = `${data.settings.poll_interval_seconds} 秒`;
    byId("run-id").textContent = data.run_id.slice(0, 8); byId("run-id").title = data.run_id;
    if (mapView) {
      try { mapView.updateFleet(data.vehicles); renderSelection(); } catch (error) { mapError(error); }
    } else if (!started && data.vehicles.length) {
      started = true;
      createVehicleMap(data.vehicles, mapStatus).then(view => {
        mapView = view; view.updateFleet(snapshot.vehicles); renderSelection();
        mapStatus("地圖與模型已就緒"); routeCheck?.attachMap(view);
      }).catch(mapError);
    }
    renderSelection();
  }
  startPolling(signal => api("/api/simulation", { signal }), render, byId("connection"));
}

