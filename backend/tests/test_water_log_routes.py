from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.routers.notifications import WaterLogBody, get_water_log, put_water_log
from app.models.user import User
from app.main import app


class WaterSession:
    def __init__(self, user: User) -> None:
        self.user = user
        self.commits = 0
        self.statement = None

    async def scalar(self, statement):
        self.statement = statement
        return self.user

    async def commit(self) -> None:
        self.commits += 1


def water_user() -> User:
    return User(
        id=uuid4(),
        is_deleted=False,
        goals={
            "water_log": {"2026-09-01": 750, "2026-09-02": 1500},
            "notification_settings": {
                "timezone": "Europe/Moscow",
                "water": {"enabled": True, "daily_ml": 2600},
            },
        },
    )


@pytest.mark.asyncio
async def test_get_water_log_uses_requested_date() -> None:
    response = await get_water_log(date_value=date(2026, 9, 1), user=water_user())

    assert response.date == "2026-09-01"
    assert response.ml == 750
    assert response.daily_target_ml == 2600


@pytest.mark.asyncio
async def test_put_water_log_locks_user_and_updates_only_requested_date() -> None:
    user = water_user()
    session = WaterSession(user)

    response = await put_water_log(
        WaterLogBody(ml=250, date=date(2026, 9, 1), mode="add"),
        session=session,  # type: ignore[arg-type]
        user=user,  # type: ignore[arg-type]
    )

    assert response.date == "2026-09-01"
    assert response.ml == 1000
    assert user.goals["water_log"]["2026-09-02"] == 1500
    assert session.commits == 1
    assert "FOR UPDATE" in str(session.statement).upper()


def test_water_log_rejects_invalid_date_and_mode() -> None:
    with pytest.raises(ValidationError):
        WaterLogBody(ml=250, date="not-a-date")
    with pytest.raises(ValidationError):
        WaterLogBody(ml=250, mode="replace")


def test_water_get_contract_exposes_date_query_parameter() -> None:
    parameters = app.openapi()["paths"]["/notifications/water"]["get"]["parameters"]

    assert any(item["in"] == "query" and item["name"] == "date" for item in parameters)
