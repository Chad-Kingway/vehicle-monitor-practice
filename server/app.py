from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from uuid import uuid4

from fastapi import FastAPI, HTTPException

from .schemas import SimulationSettings, VehicleReport


DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "config" / "simulation.json"


def create_app(config_path: Path = DEFAULT_CONFIG) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings = SimulationSettings.model_validate_json(config_path.read_text(encoding="utf-8"))
        app.state.settings = settings
        app.state.run_id = uuid4()
        app.state.vehicles = {
            vehicle.id: {
                "id": vehicle.id,
                "passenger_capacity": vehicle.passenger_capacity,
                "initial_position": vehicle.initial_position,
                "initial_heading": vehicle.initial_heading,
                "position": vehicle.initial_position,
                "heading": vehicle.initial_heading,
                "last_report_at": None,
            }
            for vehicle in settings.vehicles
        }
        app.state.last_report_clock = {}
        yield

    app = FastAPI(title="車輛監控系統", lifespan=lifespan)

    @app.get("/api/simulation")
    async def get_simulation():
        now = monotonic()
        vehicles = []
        for vehicle_id, vehicle in app.state.vehicles.items():
            clock = app.state.last_report_clock.get(vehicle_id)
            online = clock is not None and now - clock < app.state.settings.offline_threshold_seconds
            vehicles.append({**vehicle, "connection_status": "online" if online else "offline"})
        return {
            "run_id": app.state.run_id,
            "settings": app.state.settings,
            "vehicles": vehicles,
        }

    @app.post("/api/vehicles/{vehicle_id}/reports")
    async def report_vehicle(vehicle_id: str, report: VehicleReport):
        if report.run_id != app.state.run_id:
            raise HTTPException(status_code=409, detail="模擬輪次已變更，請重新取得 Server 資料。")
        vehicle = app.state.vehicles.get(vehicle_id)
        if vehicle is None:
            raise HTTPException(status_code=404, detail="車輛不存在。")
        vehicle.update(
            position=report.position,
            heading=report.heading,
            last_report_at=datetime.now(timezone.utc),
        )
        app.state.last_report_clock[vehicle_id] = monotonic()
        return {"run_id": app.state.run_id, "vehicle": vehicle}

    return app
