export type Position = [number, number];
export type RideStatus = "waiting" | "planning" | "pickup" | "transport" | "completed" | "failed" | "cancelled" | "unconfirmed";

export interface RoadRoute {
  provider: string;
  origin: Position;
  destination: Position;
  coordinates: Position[];
  distance_meters: number;
  duration_seconds: number;
}
export interface Vehicle {
  id: string;
  position: Position;
  heading: number;
  passenger_capacity: number;
  last_report_at: string | null;
  connection_status: "online" | "offline";
  task_id: string | null;
}
export interface RideRequest {
  id: string;
  sequence: number;
  passenger_id: string;
  client_request_id: string | null;
  run_id: string | null;
  pickup: Position;
  destination: Position;
  passenger_count: number;
  status: RideStatus;
  vehicle_id: string | null;
  task_id: string | null;
  failure_reason: string | null;
  created_at: string;
}
export interface TransportTask {
  id: string;
  request_id: string;
  vehicle_id: string;
  status: RideStatus;
  phase: "pickup" | "transport" | "completed";
  progress: number;
  pickup: Position;
  destination: Position;
  passenger_count: number;
  pickup_route: RoadRoute | null;
  transport_route: RoadRoute | null;
  failure_reason: string | null;
  completed_at: string | null;
}
export interface SimulationSettings {
  speed_multiplier: number;
  report_interval_seconds: number;
  poll_interval_seconds: number;
  offline_threshold_seconds: number;
}
export interface Snapshot {
  run_id: string;
  settings: SimulationSettings;
  vehicles: Vehicle[];
  requests: RideRequest[];
  tasks: TransportTask[];
}
export interface MapPreferences {
  poi: boolean;
  scale: number;
  poiDisabled: boolean;
  scaleDisabled: boolean;
  error: string;
}
export interface UiState {
  mode: "monitor" | "passenger";
  passengerId: string | null;
  routeCheck: boolean;
  connection: "idle" | "connecting" | "online" | "offline" | "stopped";
  snapshot: Snapshot | null;
  selectedVehicleId: string | null;
  selectedVehicle: Vehicle | null;
  selectedTask: TransportTask | null;
  currentRequest: RideRequest | null;
  following: boolean;
  points: { pickup: Position | null; destination: Position | null };
  busy: boolean;
  pending: boolean;
  canEditTrip: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  error: string | null;
  message: string;
  map: {
    status: "idle" | "loading" | "ready" | "error";
    message: string;
    error: string | null;
    preferences: MapPreferences | null;
  };
  route: RoadRoute | null;
}
export interface UiActions {
    selectVehicle(id: string): void;
    follow(enabled: boolean): void;
    locate(): void;
    setPoints(points?: { pickup?: Position | null; destination?: Position | null }): void;
    submitRequest(passengerCount: number): Promise<RideRequest>;
    submitRandomRequest(): Promise<RideRequest>;
    cancelRequest(): Promise<RideRequest>;
    setSpeed(value: number): Promise<void>;
    setIntervals(reportSeconds: number, pollSeconds: number): Promise<void>;
    queryRoute(origin: Position, destination: Position): Promise<RoadRoute>;
    clearRoute(): void;
    setMapPreferences(preferences: { poi?: boolean; scale?: number }): void;
}
