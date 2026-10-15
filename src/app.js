import { mountMonitor } from "./monitor.js";
import { mountPassenger } from "./passenger.js";

const params = new URLSearchParams(location.search);
if (params.get("passenger")) mountPassenger();
else mountMonitor();
