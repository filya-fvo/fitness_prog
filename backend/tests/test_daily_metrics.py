from __future__ import annotations

import uuid
from datetime import date

import pytest
from pydantic import ValidationError

from app.models.daily_metric import DailyMetric
from app.models.user import User
from app.schemas.daily_metrics import DailyMetricUpdate
from app.services.daily_metrics import save_for_day


class FakeSession:
    def __init__(self, row: DailyMetric | None = None) -> None:
        self.row = row
        self.added: DailyMetric | None = None

    async def scalar(self, _query):
        return self.row

    def add(self, row: DailyMetric) -> None:
        self.added = row
        self.row = row
        if row.id is None:
            row.id = uuid.uuid4()

    async def commit(self) -> None:
        return None

    async def refresh(self, _row: DailyMetric) -> None:
        return None


def test_daily_metric_schema_rejects_impossible_values() -> None:
    with pytest.raises(ValidationError):
        DailyMetricUpdate(sleep_minutes=1500)
    with pytest.raises(ValidationError):
        DailyMetricUpdate(steps=-1)
    with pytest.raises(ValidationError):
        DailyMetricUpdate()


@pytest.mark.asyncio
async def test_save_daily_metrics_sets_and_clears_manual_source() -> None:
    user = User(id=uuid.uuid4(), anthropometry={}, goals={})
    session = FakeSession()
    row = await save_for_day(
        session,  # type: ignore[arg-type]
        user,
        date(2026, 8, 15),
        DailyMetricUpdate(sleep_minutes=450, steps=9000),
    )
    assert row.sleep_minutes == 450
    assert row.steps == 9000
    assert row.sources == {"sleep_minutes": "manual", "steps": "manual"}

    row = await save_for_day(
        session,  # type: ignore[arg-type]
        user,
        date(2026, 8, 15),
        DailyMetricUpdate(steps=None),
    )
    assert row.sleep_minutes == 450
    assert row.steps is None
    assert row.sources == {"sleep_minutes": "manual"}
