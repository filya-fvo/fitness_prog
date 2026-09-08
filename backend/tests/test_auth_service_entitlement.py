"""Initial PLUS access at Telegram account creation."""

from __future__ import annotations

import uuid

import pytest

from app.core.config import Settings
from app.core.security import TelegramUser
from app.models.user import User
from app.services.auth_service import authenticate_telegram_user


class _Result:
    def __init__(self, value: User | None) -> None:
        self.value = value

    def scalar_one_or_none(self) -> User | None:
        return self.value


class _Session:
    def __init__(self, existing: User | None = None) -> None:
        self.existing = existing
        self.execute_count = 0
        self.added: list[object] = []

    async def execute(self, *_args, **_kwargs):
        self.execute_count += 1
        return None if self.execute_count == 1 else _Result(self.existing)

    async def scalar(self, *_args, **_kwargs):
        return None

    def add(self, row: object) -> None:
        self.added.append(row)

    async def flush(self) -> None:
        for row in self.added:
            if getattr(row, "id", None) is None:
                row.id = uuid.uuid4()

    async def commit(self) -> None:
        return None

    async def refresh(self, _row: object) -> None:
        return None


def _telegram_user() -> TelegramUser:
    return TelegramUser(id=123456, first_name="Test", username="tester")


@pytest.mark.asyncio
async def test_new_telegram_account_receives_beta_plus() -> None:
    session = _Session()

    user, token = await authenticate_telegram_user(
        session,  # type: ignore[arg-type]
        _telegram_user(),
        Settings(jwt_secret="test-secret"),
    )

    assert session.added[0] is user
    assert len(session.added) == 2
    entitlement = session.added[1]
    assert entitlement.user_id == user.id
    assert entitlement.code == "plus"
    assert entitlement.source == "beta_grant"
    assert token


@pytest.mark.asyncio
async def test_existing_telegram_account_does_not_receive_duplicate_grant() -> None:
    existing = User(
        id=uuid.uuid4(),
        telegram_id=123456,
        username="tester",
        anthropometry={},
        goals={},
    )
    session = _Session(existing)

    user, token = await authenticate_telegram_user(
        session,  # type: ignore[arg-type]
        _telegram_user(),
        Settings(jwt_secret="test-secret"),
    )

    assert user is existing
    assert session.added == []
    assert token
