from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Position = tuple[Longitude, Latitude]
Heading = Annotated[float, Field(ge=0, lt=360, allow_inf_nan=False)]
PositiveSeconds = Annotated[float, Field(ge=0.1, le=60, allow_inf_nan=False)]
Identity = Annotated[str, Field(min_length=1, max_length=128)]


class VehicleConfig(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    id: str = Field(pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')
    passenger_capacity: int = Field(ge=1, strict=True)
    initial_position: Position
    initial_heading: Heading = 0


class RandomSettings(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    longitude_min: Longitude = 121.5102
    longitude_max: Longitude = 121.5693
    latitude_min: Latitude = 25.03068
    latitude_max: Latitude = 25.06026
    minimum_distance_meters: float = Field(default=200, ge=0, allow_inf_nan=False)
    max_attempts: int = Field(default=20, ge=1, le=10000, strict=True)

    @model_validator(mode='after')
    def validate_bounds(self):
        if self.longitude_min > self.longitude_max or self.latitude_min > self.latitude_max:
            raise ValueError('隨機起訖範圍的下限不得大於上限。')
        return self


class GeneratorSettings(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    interval_min_seconds: float = Field(default=5, gt=0, allow_inf_nan=False)
    interval_max_seconds: float = Field(default=15, gt=0, allow_inf_nan=False)
    total_requests: int = Field(default=20, ge=1, le=10000, strict=True)

    @model_validator(mode='after')
    def validate_interval(self):
        if self.interval_min_seconds > self.interval_max_seconds:
            raise ValueError('自動生成間隔下限不得大於上限。')
        return self


class SimulationSettings(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    speed_multiplier: float = Field(gt=0, le=300, allow_inf_nan=False)
    report_interval_seconds: PositiveSeconds
    poll_interval_seconds: PositiveSeconds
    offline_threshold_seconds: PositiveSeconds
    route_timeout_seconds: PositiveSeconds = 10
    route_concurrency_limit: int = Field(default=1, ge=1, le=20, strict=True)
    route_max_attempts: int = Field(default=3, ge=1, le=10, strict=True)
    route_retry_delay_seconds: float = Field(default=0.5, ge=0, le=60, allow_inf_nan=False)
    random_requests: RandomSettings = Field(default_factory=RandomSettings)
    generator: GeneratorSettings = Field(default_factory=GeneratorSettings)
    vehicles: tuple[VehicleConfig, ...] = Field(min_length=1)

    @model_validator(mode='after')
    def validate_fleet(self):
        ids = [vehicle.id for vehicle in self.vehicles]
        if len(ids) != len(set(ids)):
            raise ValueError('車輛識別碼不得重複。')
        if self.offline_threshold_seconds <= self.report_interval_seconds:
            raise ValueError('離線門檻必須大於車輛回報間隔。')
        return self


class VehicleReport(BaseModel):
    model_config = ConfigDict(extra='forbid')
    run_id: UUID
    position: Position
    heading: Heading
    task_id: str | None = None
    phase: Literal['pickup', 'transport', 'completed'] | None = None
    progress: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)
    diagnostic: bool = False

    @model_validator(mode='after')
    def validate_task(self):
        if bool(self.task_id) != bool(self.phase):
            raise ValueError('接送任務與執行階段必須一起提供。')
        if self.task_id is None and self.progress != 0:
            raise ValueError('空閒車輛不能回報接送進度。')
        return self


class RideRequestInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    passenger_id: Identity
    pickup: Position
    destination: Position
    passenger_count: int = Field(ge=1, strict=True)
    client_request_id: Identity | None = None
    run_id: UUID | None = None


class PassengerInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    passenger_id: Identity


class RandomRequestInput(PassengerInput):
    client_request_id: Identity | None = None
    run_id: UUID | None = None


class SpeedInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    speed_multiplier: int = Field(ge=1, le=300, strict=True)


class RouteQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')
    origin: Position
    destination: Position


class RoadRoute(BaseModel):
    provider: str = 'kingway-directions'
    origin: Position
    destination: Position
    coordinates: list[Position] = Field(min_length=2)
    distance_meters: float = Field(ge=0, allow_inf_nan=False)
    duration_seconds: float = Field(ge=0, allow_inf_nan=False)
