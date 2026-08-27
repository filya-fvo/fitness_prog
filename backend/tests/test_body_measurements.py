from __future__ import annotations

import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.schemas.body_measurements import BodyMeasurementUpdate
from app.services.body_measurements import _sync_latest_profile_snapshot, save_for_day


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
        BodyMeasurementUpdate(weight_kg=19)
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
        BodyMeasurementUpdate(weight_kg=79.4, chest_cm=101.5, waist_cm=82, note="morning"),
    )

    assert float(row.chest_cm) == 101.5
    assert float(row.waist_cm) == 82
    assert float(row.weight_kg) == 79.4
    assert row.sources == {"weight_kg": "manual", "chest_cm": "manual", "waist_cm": "manual"}
    assert user.anthropometry["height_cm"] == 180
    assert user.anthropometry["weight_kg"] == 79.4
    assert user.anthropometry["measurements"] == {
        "weight_kg": 79.4,
        "chest_cm": 101.5,
        "waist_cm": 82.0,
    }


@pytest.mark.asyncio
async def test_profile_uses_latest_weight_even_when_latest_measurement_has_only_circumferences() -> None:
    latest = BodyMeasurement(
        user_id=uuid.uuid4(),
        date=date(2026, 8, 27),
        waist_cm=81,
        sources={"waist_cm": "manual"},
    )
    latest_weight = BodyMeasurement(
        user_id=latest.user_id,
        date=date(2026, 8, 20),
        weight_kg=78.5,
        sources={"weight_kg": "manual"},
    )
    session = FakeSession()
    responses = iter((latest, latest_weight))

    async def scalar(_query):
        return next(responses)

    session.scalar = scalar  # type: ignore[method-assign]
    user = User(id=latest.user_id, anthropometry={"height_cm": 180}, goals={})

    await _sync_latest_profile_snapshot(session, user)  # type: ignore[arg-type]

    assert user.anthropometry["weight_kg"] == 78.5
    assert user.anthropometry["measurements"] == {"waist_cm": 81.0}
