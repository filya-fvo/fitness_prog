"""Explicit exercise intent, independent of historical suggested loads."""
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RepsOnlyTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["reps_only"]
    reps_min: int = Field(strict=True, ge=1, le=100_000)
    reps_max: int = Field(strict=True, ge=1, le=100_000)

    @model_validator(mode="after")
    def validate_range(self):
        if self.reps_min > self.reps_max:
            raise ValueError("Minimum repetitions must not exceed maximum")
        return self


class WeightRepsTarget(RepsOnlyTarget):
    kind: Literal["weight_reps"]
    target_weight: Decimal | None = Field(gt=0, le=10_000, decimal_places=2)


class TimedTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["timed"]
    duration_sec: int = Field(strict=True, ge=1, le=86400)


ExplicitWorkoutTarget = Annotated[
    RepsOnlyTarget | WeightRepsTarget | TimedTarget, Field(discriminator="kind")
]
