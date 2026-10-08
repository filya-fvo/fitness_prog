"""Actual PostgreSQL one-consumer race and canonical Telegram account preservation.
Called only by check_android_sync_postgres against its fixed disposable cluster.
"""

import asyncio
import hashlib
import secrets
import uuid
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings
from app.core.security import TelegramUser
from app.models.android_login import AndroidLogin
from app.models.user import User
from app.services import android_login
from app.services.auth_service import authenticate_telegram_user


async def check_login(engine):
    assert (
        engine.url.host in {"127.0.0.1", "localhost"}
        and engine.url.database == "fitness_android_sync_test"
    )
    verifier = secrets.token_urlsafe(32)
    source = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
    telegram_id = 8_000_000_000_000 + secrets.randbelow(1_000_000_000)
    settings = Settings(
        bot_token="fixture", jwt_secret="test-only-do-not-publish", environment="test"
    )
    owner = None
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            user, _ = await authenticate_telegram_user(
                db, TelegramUser(id=telegram_id, first_name="Isolated test"), settings
            )
            owner = user.id
            user.goals = {"onboarding_completed": True, "native_login_retention_marker": "fixture"}
            await db.commit()
            started = await android_login.start_login(
                db, android_login.digest(verifier), "fitness_test_bot", source
            )
            token = started["bot_url"].split("android_login_")[1]
            assert await android_login.claim_login(
                db, token, {"id": telegram_id, "first_name": "Isolated test"}
            )
            assert await android_login.approve_login(db, token, telegram_id)

        async def consume():
            async with AsyncSession(engine, expire_on_commit=False) as db:
                try:
                    return await android_login.consume_login(db, started["request_id"], verifier)
                except HTTPException as error:
                    assert error.status_code == 410
                    return None

        results = await asyncio.gather(consume(), consume(), consume())
        actors = [actor for actor in results if actor]
        assert len(actors) == 1, "Concurrent exchange returned more than one identity"
        async with AsyncSession(engine, expire_on_commit=False) as db:
            same, _ = await authenticate_telegram_user(db, actors[0], settings)
            assert same.id == owner and same.auth_email is None
            assert same.goals["native_login_retention_marker"] == "fixture"
            assert (
                len(
                    (await db.execute(select(User).where(User.telegram_id == telegram_id)))
                    .scalars()
                    .all()
                )
                == 1
            )
        print(
            "PASS: native Telegram SQL race one consumer, canonical account without email, retained profile"
        )
    finally:
        async with AsyncSession(engine) as db:
            await db.execute(delete(AndroidLogin).where(AndroidLogin.source_hash == source))
            if owner:
                await db.execute(
                    delete(User).where(User.id == owner, User.telegram_id == telegram_id)
                )
            await db.commit()
