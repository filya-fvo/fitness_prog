from __future__ import annotations

import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.models.body_measurement import BodyMeasurement
from app.models.user import User
from app.main import app
from app.schemas.body_measurements import BodyMeasurementUpdate
from app.services import body_measurements
from app.services.body_measurements import _sync_latest_profile_snapshot, save_for_day


class FakeSession:
    def __init__(self) -> None:
        self.row: BodyMeasurement | None = None
        self.commits = 0

    async def scalar(self, _query):
        return self.row

    def add(self, row: BodyMeasurement) -> None:
        self.row = row

    async def flush(self) -> None:
        if self.row is not None and self.row.id is None:
            self.row.id = uuid.uuid4()

    async def commit(self) -> None:
        self.commits += 1

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


def test_body_measurement_daily_route_supports_confirmed_ui_delete() -> None:
    assert set(app.openapi()["paths"]["/measurements/daily"]) == {"get", "put", "delete"}


def test_measurement_analytics_route_is_available() -> None:
    assert "get" in app.openapi()["paths"]["/measurements/analytics"]


def test_measurement_analytics_uses_field_baselines_and_explicit_weight_goal() -> None:
    user = User(
        id=uuid.uuid4(),
        anthropometry={},
        goals={"primary_goal": "lose_fat", "target_weight_kg": 75},
    )
    rows = [
        BodyMeasurement(user_id=user.id, date=date(2026, 5, 28), weight_kg=82, chest_cm=101),
        BodyMeasurement(user_id=user.id, date=date(2026, 6, 28), waist_cm=88),
        BodyMeasurement(user_id=user.id, date=date(2026, 8, 28), weight_kg=79, chest_cm=100),
    ]

    result = body_measurements.build_analytics(
        rows,
        user,
        months=3,
        start=date(2026, 5, 28),
        end=date(2026, 8, 28),
    )

    by_field = {item.field: item for item in result.items}
    assert result.primary_goal == "lose_fat"
    assert by_field["weight_kg"].baseline_value == 82
    assert by_field["weight_kg"].latest_value == 79
    assert by_field["weight_kg"].delta == -3
    assert by_field["weight_kg"].percent_change == -3.7
    assert by_field["weight_kg"].target_value == 75
    assert by_field["weight_kg"].target_gap == 4
    assert by_field["weight_kg"].interpretation == "Значение стало ближе к заданной цели"
    assert by_field["chest_cm"].baseline_date == date(2026, 5, 28)
    assert by_field["chest_cm"].latest_date == date(2026, 8, 28)
    assert by_field["chest_cm"].interpretation == "Изменение показано без оценки результата"
    assert by_field["waist_cm"].points == 1
    assert by_field["hips_cm"].points == 0


def test_measurement_analytics_does_not_call_weight_loss_a_success_without_target() -> None:
    user = User(id=uuid.uuid4(), anthropometry={}, goals={"primary_goal": "lose_fat"})
    rows = [
        BodyMeasurement(user_id=user.id, date=date(2026, 7, 28), weight_kg=82),
        BodyMeasurement(user_id=user.id, date=date(2026, 8, 28), weight_kg=80),
    ]

    result = body_measurements.build_analytics(
        rows,
        user,
        months=1,
        start=date(2026, 7, 28),
        end=date(2026, 8, 28),
    )

    weight = next(item for item in result.items if item.field == "weight_kg")
    assert weight.target_value is None
    assert weight.interpretation == "Изменение показано без оценки результата"


def test_measurement_period_start_uses_calendar_months() -> None:
    assert body_measurements._period_start(date(2026, 3, 31), 1) == date(2026, 2, 28)
    assert body_measurements._period_start(date(2026, 8, 28), 12) == date(2025, 8, 28)


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


@pytest.mark.asyncio
async def test_delete_measurement_soft_deletes_and_removes_stale_weight(monkeypatch) -> None:
    user = User(id=uuid.uuid4(), anthropometry={"weight_kg": 91.2}, goals={})
    row = BodyMeasurement(
        id=uuid.uuid4(),
        user_id=user.id,
        date=date(2026, 8, 27),
        weight_kg=91.2,
        waist_cm=90,
        sources={"weight_kg": "manual", "waist_cm": "manual"},
    )
    session = FakeSession()
    responses = iter((row, None))

    async def scalar(_query):
        return next(responses)

    async def fake_sync(_session, target_user):
        target_user.anthropometry = dict(target_user.anthropometry or {})

    session.scalar = scalar  # type: ignore[method-assign]
    monkeypatch.setattr(body_measurements, "_sync_latest_profile_snapshot", fake_sync)

    deleted = await body_measurements.delete_for_day(  # type: ignore[arg-type]
        session, user, row.date
    )

    assert deleted is True
    assert row.is_deleted is True
    assert "weight_kg" not in user.anthropometry
    assert session.commits == 1


@pytest.mark.asyncio
async def test_save_reuses_deleted_date_without_restoring_hidden_fields() -> None:
    user = User(id=uuid.uuid4(), anthropometry={}, goals={})
    row = BodyMeasurement(
        id=uuid.uuid4(),
        user_id=user.id,
        date=date(2026, 8, 27),
        chest_cm=105,
        note="ошибочная запись",
        sources={"chest_cm": "manual"},
        is_deleted=True,
    )
    session = FakeSession()
    responses = iter((row, row, None))

    async def scalar(_query):
        return next(responses)

    session.scalar = scalar  # type: ignore[method-assign]

    saved = await save_for_day(
        session,  # type: ignore[arg-type]
        user,
        row.date,
        BodyMeasurementUpdate(waist_cm=82),
    )

    assert saved.id == row.id
    assert saved.is_deleted is False
    assert saved.chest_cm is None
    assert saved.note is None
    assert float(saved.waist_cm) == 82
