import type { Position, Vehicle, TransportTask, RideRequest, RoadRoute, MapPreferences } from './app/models';
export interface VehicleMap {
  destroy(): void;
  clearRoute(): void;
  locate(position: Position): void;
  setPreferences(preferences: { poi?: boolean; scale?: number }): void;
  follow(id: string | null): void;
  showPoints(pickup: Position | null, destination: Position | null): void;
  showTask(task: TransportTask): void;
  showPassengerTrip(task: TransportTask, request: RideRequest, frame?: boolean): void;
  showRoute(route: RoadRoute): void;
  updateFleet(vehicles: Vehicle[]): void;
}
export function createVehicleMap(vehicles: Vehicle[], status: (message: string) => void, options: {
  container: HTMLElement;
  signal?: AbortSignal;
  preferenceScope: string;
  onError: (error: Error) => void;
  onPreferences: (preferences: MapPreferences) => void;
  onPick?: (point: Position) => void;
}): Promise<VehicleMap>;
