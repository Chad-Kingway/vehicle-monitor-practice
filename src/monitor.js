import { createUiClient } from "./ui-client.js";
import { mountRouteCheck } from "./route-check.js";
import { element, mountMapControls, requestCard, statusLabel } from "./ui.js";

export function mountMonitor() {
  const client = createUiClient();
  mountRouteCheck(client);
  mountMapControls(client, document.getElementById("map").parentElement);
  const byId = id => document.getElementById(id);
  const header = document.querySelector("header");
  for (const [label, random] of [["新增乘客", false], ["隨機送出一筆", true]]) {
    const link = element("a", label, "button-link");
    link.target = "_blank"; link.rel = "noopener";
    const refresh = () => { link.href = client.passengerUrl({ random }); };
    refresh(); link.addEventListener("click", refresh); link.addEventListener("auxclick", refresh);
    header.append(link);
  }
  const lists = {};
  for (const [name, title] of [["fleet", "車隊"], ["request", "乘車請求"], ["task", "接送任務"]]) {
    const section = element("section", undefined, "list-section " + name + "-section");
    const list = element("div", undefined, "record-list");
    section.append(element("h2", title), list);
    document.querySelector(name === "fleet" ? ".vehicle-card" : ".settings").before(section);
    lists[name] = list;
  }
  const controls = element("div", undefined, "actions");
  const locate = element("button", "定位"); locate.type = "button";
  const follow = document.createElement("input"); follow.type = "checkbox";
  const followLabel = element("label", undefined, "check-label");
  followLabel.append(follow, document.createTextNode("跟隨")); controls.append(locate, followLabel);
  document.querySelector(".vehicle-card").append(controls);
  locate.addEventListener("click", () => client.actions.locate());
  follow.addEventListener("change", () => client.actions.follow(follow.checked));

  const speedForm = element("form", undefined, "speed-form");
  const speedLabel = element("label", "全車速度");
  const speedInput = document.createElement("input");
  Object.assign(speedInput, { type: "range", min: "1", max: "300", step: "1", value: "60" });
  speedInput.setAttribute("aria-label", "全車速度倍率");
  const speedValue = element("output", "60×");
  const speedStatus = element("p"); speedStatus.setAttribute("role", "status");
  speedLabel.append(speedInput, speedValue); speedForm.append(speedLabel, speedStatus);
  document.querySelector(".settings").before(speedForm);
  speedForm.addEventListener("submit", event => event.preventDefault());
  let desiredSpeed = null;
  let speedSending = false;
  let speedTimer;
  let lastSpeedSentAt = 0;
  const sendSpeed = async () => {
    if (speedSending || desiredSpeed === null) return;
    if (client.getState().busy) { speedTimer = setTimeout(sendSpeed, 250); return; }
    const value = desiredSpeed; desiredSpeed = null; speedSending = true; lastSpeedSentAt = Date.now();
    try { await client.actions.setSpeed(value); speedStatus.textContent = "已套用 " + value + "×"; }
    catch (error) { speedStatus.textContent = error.message; }
    finally {
      speedSending = false;
      if (desiredSpeed !== null) speedTimer = setTimeout(sendSpeed, Math.max(0, 250 - (Date.now() - lastSpeedSentAt)));
    }
  };
  const scheduleSpeed = () => {
    speedValue.value = speedInput.value + "×"; desiredSpeed = Number(speedInput.value);
    clearTimeout(speedTimer);
    speedTimer = setTimeout(sendSpeed, Math.max(0, 250 - (Date.now() - lastSpeedSentAt)));
  };
  speedInput.addEventListener("input", scheduleSpeed);
  speedInput.addEventListener("change", scheduleSpeed);
  window.addEventListener("pagehide", () => { clearTimeout(speedTimer); desiredSpeed = null; });

  const intervalForm = element("form", undefined, "interval-form");
  const intervalInputs = ["車輛回報間隔（秒）", "網頁更新間隔（秒）"].map(title => {
    const label = element("label", title);
    const input = document.createElement("input");
    Object.assign(input, { type: "number", min: "0.1", max: "60", step: "0.05", required: true });
    label.append(input); intervalForm.append(label); return input;
  });
  const [reportInput, pollInput] = intervalInputs;
  const intervalButton = element("button", "儲存設定"); intervalButton.type = "submit";
  const intervalStatus = element("p"); intervalStatus.setAttribute("role", "status");
  intervalForm.append(intervalButton, intervalStatus); document.querySelector(".settings").before(intervalForm);
  intervalForm.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await client.actions.setIntervals(Number(reportInput.value), Number(pollInput.value));
      intervalStatus.textContent = "已儲存設定";
    } catch (error) { intervalStatus.textContent = error.message; }
  });
  client.subscribe(state => {
    const online = state.connection === "online";
    byId("connection").textContent = online ? "Server 已連線" : state.connection === "offline" ? "Server 連線中斷" : "連線中…";
    byId("connection").dataset.state = online ? "online" : "offline";
    byId("map-status").textContent = state.map.message || "等待 Server 資料";
    byId("map-error").textContent = state.map.error || "";
    byId("map-error").hidden = !state.map.error;
    intervalButton.disabled = !online || state.busy;
    speedInput.disabled = !online;
    follow.checked = state.following;
    const data = state.snapshot;
    if (!data) return;
    lists.fleet.replaceChildren(...data.vehicles.map(vehicle => {
      const button = element("button", undefined, "fleet-item"); button.type = "button";
      button.classList.toggle("selected", vehicle.id === state.selectedVehicleId);
      const task = data.tasks.find(item => item.id === vehicle.task_id);
      button.append(element("strong", vehicle.id), element("span", vehicle.passenger_capacity + " 人 · " + (vehicle.connection_status === "offline" ? "離線" : statusLabel(task?.status))));
      button.addEventListener("click", () => client.actions.selectVehicle(vehicle.id));
      return button;
    }));
    lists.request.replaceChildren(...data.requests.map(request => requestCard(request)));
    if (!data.requests.length) lists.request.append(element("p", "尚無請求", "empty"));
    lists.task.replaceChildren(...data.tasks.map(task => {
      const card = element("article", undefined, "record-card");
      card.append(element("strong", task.id + " · " + task.vehicle_id), element("p", statusLabel(task.status) + " · " + Math.round(task.progress * 100) + "%"));
      if (task.status === "unconfirmed") card.append(element("p", statusLabel(task.phase)));
      return card;
    }));
    if (!data.tasks.length) lists.task.append(element("p", "尚無任務", "empty"));
    byId("speed").textContent = data.settings.speed_multiplier + "×";
    if (document.activeElement !== speedInput && !speedSending && desiredSpeed === null) {
      speedInput.value = data.settings.speed_multiplier; speedValue.value = data.settings.speed_multiplier + "×";
    }
    byId("report-interval").textContent = data.settings.report_interval_seconds + " 秒";
    byId("poll-interval").textContent = data.settings.poll_interval_seconds + " 秒";
    if (!intervalInputs.includes(document.activeElement) && !state.busy) {
      reportInput.value = data.settings.report_interval_seconds; pollInput.value = data.settings.poll_interval_seconds;
    }
    byId("run-id").textContent = data.run_id.slice(0, 8); byId("run-id").title = data.run_id;
    const vehicle = state.selectedVehicle;
    if (vehicle) {
      byId("vehicle-id").textContent = vehicle.id;
      byId("vehicle-status").textContent = vehicle.connection_status === "offline" ? "離線" : statusLabel(state.selectedTask?.status);
      byId("vehicle-status").dataset.state = vehicle.connection_status;
      byId("longitude").textContent = vehicle.position[0].toFixed(6);
      byId("latitude").textContent = vehicle.position[1].toFixed(6);
      byId("heading").textContent = vehicle.heading.toFixed(0) + "°";
      byId("capacity").textContent = vehicle.passenger_capacity + " 人";
      byId("last-report").textContent = vehicle.last_report_at ? new Date(vehicle.last_report_at).toLocaleTimeString("zh-TW", { hour12: false }) : "—";
    }
    if (state.map.status === "idle") void client.mountMap(byId("map")).catch(() => {});
  });
  client.start();
}

