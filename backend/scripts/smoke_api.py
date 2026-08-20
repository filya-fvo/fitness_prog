"""End-to-end API smoke against real DB via ASGI transport."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import json
import sys
import time
import urllib.parse
from datetime import date
from pathlib import Path

# Windows consoles (cp1251) choke on emoji in AI replies
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.main import app
from app.models.exercise import Exercise
from app.models.nutrition import NutritionProduct


def make_init(token: str, uid: int = 900001) -> str:
    user = {"id": uid, "username": "qa_user", "first_name": "QA"}
    payload = {
        "auth_date": str(int(time.time())),
        "query_id": "AAE",
        "user": json.dumps(user, separators=(",", ":")),
    }
    data = "\n".join(f"{k}={v}" for k, v in sorted(payload.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret, data.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(payload)


async def db_check() -> None:
    settings = get_settings()
    print("ENV", settings.environment)
    print("DB", settings.database_url.split("@")[-1])
    print("BOT_SET", bool(settings.bot_token and not settings.bot_token.startswith("replace")))
    async with AsyncSessionLocal() as session:
        await session.execute(text("SELECT 1"))
        ex = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_deleted.is_(False))
        )
        np = await session.scalar(
            select(func.count())
            .select_from(NutritionProduct)
            .where(NutritionProduct.is_deleted.is_(False))
        )
        print("DB_OK", "exercises=", ex, "products=", np)


async def api_health() -> int:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    print("health", response.status_code, response.text)
    return 0 if response.status_code == 200 else 1


async def api_flow(*, include_external: bool) -> int:
    settings = get_settings()
    errors = 0
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/health")
        print("health", r.status_code, r.text)
        if r.status_code != 200:
            return 1

        init = make_init(settings.bot_token)
        r = await client.post("/auth/telegram", json={"init_data": init})
        print("auth", r.status_code)
        if r.status_code != 200:
            return 1
        token = r.json()["access_token"]
        print("user", r.json()["user"])
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.get("/users/me", headers=headers)
        print("me", r.status_code, r.text[:220])
        if r.status_code != 200:
            errors += 1

        r = await client.put(
            "/users/me",
            headers=headers,
            json={
                "goals": {
                    "primary_goal": "maintain",
                    "level": "beginner",
                    "equipment": ["bodyweight"],
                    "onboarding_completed": True,
                },
                "anthropometry": {"weight_kg": 70, "height_cm": 175, "age": 30},
            },
        )
        print("onboard", r.status_code, r.json().get("onboarding_completed") if r.status_code == 200 else r.text[:200])
        if r.status_code != 200:
            errors += 1

        r = await client.get("/exercises", headers=headers, params={"page_size": 5})
        print(
            "exercises",
            r.status_code,
            "total",
            r.json().get("total") if r.status_code == 200 else r.text[:160],
        )
        items = r.json().get("items", []) if r.status_code == 200 else []
        ex_ids = [i["id"] for i in items[:2]]
        if r.status_code != 200:
            errors += 1

        if not ex_ids:
            print("NO_EXERCISES — seed sprint2 needed")
            errors += 1
        else:
            r = await client.post(
                "/workouts",
                headers=headers,
                json={"scheduled_date": str(date.today()), "exercise_ids": ex_ids},
            )
            print("create_workout", r.status_code, r.text[:220])
            if r.status_code not in (200, 201):
                errors += 1
            else:
                wid = r.json()["id"]
                r = await client.post(
                    f"/workouts/{wid}/sets",
                    headers=headers,
                    json={
                        "exercise_id": ex_ids[0],
                        "set_number": 1,
                        "reps": 10,
                        "weight": 40,
                        "is_completed": True,
                        "rest_time_sec": 60,
                    },
                )
                print("add_set", r.status_code, r.text[:180])
                if r.status_code not in (200, 201):
                    errors += 1
                r = await client.put(
                    f"/workouts/{wid}/complete",
                    headers=headers,
                    json={"rpe": 7, "ai_notes": "qa"},
                )
                print(
                    "complete",
                    r.status_code,
                    r.json().get("status") if r.status_code == 200 else r.text[:180],
                )
                if r.status_code != 200:
                    errors += 1
                r = await client.get("/workouts/history", headers=headers)
                print(
                    "history",
                    r.status_code,
                    "total",
                    r.json().get("total") if r.status_code == 200 else r.text[:160],
                )
                if r.status_code != 200:
                    errors += 1

                if include_external:
                    r = await client.post(
                        "/notifications/reminders",
                        headers=headers,
                        json={"workout_id": wid, "enqueue": False},
                    )
                    print("reminder", r.status_code, r.text[:200])
                    # Synthetic Telegram users have no real chat.
                    if r.status_code not in (200, 400, 502):
                        errors += 1

        r = await client.get("/nutrition/products", headers=headers, params={"q": "ябл"})
        print(
            "products",
            r.status_code,
            "total",
            r.json().get("total") if r.status_code == 200 else r.text[:180],
        )
        products = r.json().get("items", []) if r.status_code == 200 else []
        if r.status_code != 200:
            errors += 1
        if products:
            pid = products[0]["id"]
            r = await client.post(
                "/nutrition/log",
                headers=headers,
                json={"product_id": pid, "quantity_grams": 150, "meal_type": "snack"},
            )
            print("nutrition_log", r.status_code, r.text[:180])
            if r.status_code not in (200, 201):
                errors += 1
            r = await client.get("/nutrition/daily", headers=headers)
            print(
                "nutrition_daily",
                r.status_code,
                r.json().get("totals") if r.status_code == 200 else r.text[:180],
            )
            if r.status_code != 200:
                errors += 1
        else:
            print("NO_PRODUCTS")
            errors += 1

        if include_external:
            r = await client.post("/ai/chat", headers=headers, json={"message": "Замени жим лёжа"})
            if r.status_code == 200:
                body = r.json()
                reply = (body.get("reply") or "").encode("ascii", "replace").decode("ascii")
                print("ai_chat", r.status_code, body.get("source"), reply[:90])
            else:
                print("ai_chat", r.status_code, r.text[:180])
                errors += 1

            r = await client.post("/ai/analyze", headers=headers, json={"days": 14})
            if r.status_code == 200:
                body = r.json()
                report = (body.get("report") or "").encode("ascii", "replace").decode("ascii")
                print("ai_analyze", r.status_code, body.get("source"), report[:90])
            else:
                print("ai_analyze", r.status_code, r.text[:180])
                errors += 1

    print("ERRORS", errors)
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only health smoke by default; mutation requires an explicit flag.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="create a synthetic QA user and test workout/nutrition writes",
    )
    parser.add_argument(
        "--external",
        action="store_true",
        help="with --write, also call Telegram and the configured AI provider",
    )
    args = parser.parse_args()
    if args.external and not args.write:
        parser.error("--external requires --write")
    return args


async def main(args: argparse.Namespace) -> None:
    await db_check()
    code = await api_flow(include_external=args.external) if args.write else await api_health()
    raise SystemExit(code)


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
