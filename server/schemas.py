from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Position = tuple[Longitude, Latitude]
Heading = Annotated[float, Field(ge=0, lt=360, allow_inf_nan=False)]
PositiveSeconds = Annotated[float, Field(ge=0.1, le=60, allow_inf_nan=False)]


class VehicleConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")
    passenger_capacity: int = Field(ge=1, strict=True)
    initial_position: Position
    initial_heading: Heading = 0


class SimulationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    speed_multiplier: float = Field(gt=0, le=300, allow_inf_nan=False)
    report_interval_seconds: PositiveSeconds
    poll_interval_seconds: PositiveSeconds
    offline_threshold_seconds: PositiveSeconds
    vehicles: tuple[VehicleConfig, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_fleet(self):
        ids = [vehicle.id for vehicle in self.vehicles]
        if len(ids) != len(set(ids)):
            raise ValueError("車輛識別碼不得重複。")
        if self.offline_threshold_seconds <= self.report_interval_seconds:
            raise ValueError("離線門檻必須大於車輛回報間隔。")
        return self


class VehicleReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    position: Position
    heading: Heading
