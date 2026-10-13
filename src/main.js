import "./style.css";
import { mountMonitor } from "./monitor.js";
import { mountPassenger } from "./passenger.js";
const passengerId = new URLSearchParams(location.search).get("passenger");
if (passengerId) mountPassenger(passengerId);
else mountMonitor();
