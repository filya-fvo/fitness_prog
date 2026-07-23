import asyncio
import hashlib
import hmac
import json
import time
import traceback
from urllib.parse import urlencode

from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine
from app.core.security import validate_init_data
from app.services.auth_service import authenticate_telegram


async def main() -> None:
    settings = get_settings()
    print("bot_token_set", bool(settings.bot_token and not settings.bot_token.startswith("replace")))
    print("jwt_set", bool(settings.jwt_secret and not settings.jwt_secret.startswith("replace")))

    try:
        async with engine.connect() as conn:
            value = (await conn.execute(text("select 1"))).scalar()
            print("db_ok", value)
    except Exception:
        print("DB_CONNECT_FAIL")
        traceback.print_exc()
        return

    user = {"id": 999001, "username": "debug_user", "first_name": "Debug"}
    payload = {
        "auth_date": str(int(time.time())),
        "query_id": "AAEAAAE",
        "user": json.dumps(user, separators=(",", ":")),
    }
    data_check = "\n".join(f"{key}={value}" for key, value in sorted(payload.items()))
    secret = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    init_data = urlencode(payload)
    print("init_data_len", len(init_data))

    try:
        validated = validate_init_data(init_data, settings.bot_token)
        print("validate_ok", validated.user.id, validated.user.username)
    except Exception as exc:
        print("validate_fail", type(exc).__name__, exc)
        return

    try:
        async with AsyncSessionLocal() as session:
            user_row, token = await authenticate_telegram(session, init_data, settings)
            print("auth_ok", str(user_row.id), user_row.telegram_id, token[:24] + "...")
    except Exception:
        print("AUTH_SERVICE_FAIL")
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
