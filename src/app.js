import { mountMonitor } from "./monitor.js";
import { mountPassenger } from "./passenger.js";

const params = new URLSearchParams(location.search);
const passengerId = params.get("passenger");
const autoRandom = params.get("random") === "1";

if (passengerId) mountPassenger(passengerId, { autoRandom });
else mountMonitor();
