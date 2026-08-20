from __future__ import annotations

import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.schemas.body_measurements import BodyMeasurementUpdate
from app.services.body_measurements import save_for_day


class FakeSession:
    def __init__(self) -> None:
        self.row: BodyMeasurement | None = None

    async def scalar(self, _query):
        return self.row

    def add(self, row: BodyMeasurement) -> None:
        self.row = row

    async def flush(self) -> None:
        if self.row is not None and self.row.id is None:
            self.row.id = uuid.uuid4()

    async def commit(self) -> None:
        return None

    async def refresh(self, _row: BodyMeasurement) -> None:
        return None


def test_body_measurement_schema_bounds() -> None:
    with pytest.raises(ValidationError):
        BodyMeasurementUpdate(waist_cm=0)
    with pytest.raises(ValidationError):
        BodyMeasurementUpdate(chest_cm=501)
    with pytest.raises(ValidationError):
        BodyMeasurementUpdate()


@pytest.mark.asyncio
async def test_save_body_measurement_updates_profile_snapshot() -> None:
    user = User(id=uuid.uuid4(), anthropometry={"height_cm": 180}, goals={})
    session = FakeSession()

    row = await save_for_day(
        session,  # type: ignore[arg-type]
        user,
        date(2026, 8, 15),
        BodyMeasurementUpdate(chest_cm=101.5, waist_cm=82, note="morning"),
    )

    assert float(row.chest_cm) == 101.5
    assert float(row.waist_cm) == 82
    assert row.sources == {"chest_cm": "manual", "waist_cm": "manual"}
    assert user.anthropometry["height_cm"] == 180
    assert user.anthropometry["measurements"] == {"chest_cm": 101.5, "waist_cm": 82.0}
