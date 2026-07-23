"""Unit tests for schedule shift logic (TZ §6, §11)."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.scheduler import shift_future_workouts


class _FakeResult:
    def __init__(self, items: list) -> None:
        self._items = items

    def all(self) -> list:
        return self._items


@pytest.mark.asyncio
async def test_shift_future_workouts_moves_dates() -> None:
    d0 = date(2026, 7, 20)
    w1 = SimpleNamespace(id="1", scheduled_date=d0, status="planned")
    w2 = SimpleNamespace(id="2", scheduled_date=d0 + timedelta(days=2), status="planned")

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=_FakeResult([w1, w2]))
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    user = SimpleNamespace(id="user-1")
    moved = await shift_future_workouts(session, user, from_date=d0, days=1)

    assert len(moved) == 2
    assert w1.scheduled_date == d0 + timedelta(days=1)
    assert w2.scheduled_date == d0 + timedelta(days=3)
    session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_shift_future_workouts_zero_days_noop() -> None:
    session = AsyncMock()
    user = SimpleNamespace(id="user-1")
    moved = await shift_future_workouts(session, user, from_date=date.today(), days=0)
    assert moved == []
    session.scalars.assert_not_called()
