import "./style.css";
import { mountMonitor } from "./monitor.js";
import { mountPassenger } from "./passenger.js";
const passengerId = new URLSearchParams(location.search).get("passenger");
const autoRandom = new URLSearchParams(location.search).get("random") === "1";
if (passengerId) mountPassenger(passengerId, { autoRandom });
else mountMonitor();
