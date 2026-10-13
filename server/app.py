from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from dotenv import dotenv_values
import httpx

from .routes import RouteError, RoutePlanner
from .schemas import PassengerInput, RandomRequestInput, RideRequestInput, RoadRoute, RouteQuery, SimulationSettings, SpeedInput, VehicleReport
from .simulation import Simulation


DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / 'config' / 'simulation.json'


def create_app(config_path: Path = DEFAULT_CONFIG, *, route_transport=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings = SimulationSettings.model_validate_json(config_path.read_text(encoding='utf-8'))
        env = {**dotenv_values(DEFAULT_CONFIG.parents[1] / '.env'), **os.environ}
        async with httpx.AsyncClient(timeout=settings.route_timeout_seconds, transport=route_transport) as client:
            planner = RoutePlanner(client, (env.get('ROUTES_API_KEY') or '').strip(), settings.route_timeout_seconds, settings.route_concurrency_limit, settings.route_max_attempts, settings.route_retry_delay_seconds)
            simulation = Simulation(settings, planner)
            app.state.simulation = simulation
            app.state.route_planner = planner
            try:
                yield
            finally:
                await simulation.close()

    app = FastAPI(title='車輛監控系統', lifespan=lifespan)

    @app.post('/api/routes', response_model=RoadRoute)
    async def query_route(query: RouteQuery):
        try:
            return await app.state.route_planner.plan(query)
        except RouteError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from None

    @app.get('/api/simulation')
    async def get_simulation():
        return app.state.simulation.snapshot()

    @app.post('/api/requests')
    async def submit_request(data: RideRequestInput):
        return await app.state.simulation.submit(data)

    @app.post('/api/requests/random')
    async def random_request(data: RandomRequestInput):
        return await app.state.simulation.submit_random(data)

    @app.put('/api/simulation/speed')
    async def set_speed(data: SpeedInput):
        return await app.state.simulation.set_speed(data.speed_multiplier)

    @app.get('/api/requests')
    async def get_requests(passenger_id: str):
        return app.state.simulation.passenger_requests(passenger_id)

    @app.post('/api/requests/{request_id}/cancel')
    async def cancel_request(request_id: str, data: PassengerInput):
        return await app.state.simulation.cancel(request_id, data.passenger_id)

    @app.get('/api/vehicles/{vehicle_id}/task')
    async def get_task(vehicle_id: str):
        return app.state.simulation.vehicle_command(vehicle_id)

    @app.post('/api/vehicles/{vehicle_id}/reports')
    async def report_vehicle(vehicle_id: str, report: VehicleReport):
        return await app.state.simulation.report(vehicle_id, report)

    return app
