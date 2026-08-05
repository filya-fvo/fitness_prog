# -*- coding: utf-8 -*-
"""
Wipe user-generated data and notify everyone who ever logged in via Telegram.

Keeps catalogs: exercises, programs, nutrition_products.
Deletes: users, workouts, workout_sets, nutrition_logs, ai_conversations, email_otp_codes.

Usage:
  # dry-run (default)
  python scripts/reset_user_data_and_notify.py

  # apply
  python scripts/reset_user_data_and_notify.py --execute
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

# Ensure backend package root is on path when run as script
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import engine  # noqa: E402
from app.services.telegram_bot import TelegramBotError, send_app_notification  # noqa: E402

# User-owned tables only (order matters for FKs without CASCADE everywhere)
WIPE_TABLES = [
    "workout_sets",
    "workouts",
    "nutrition_logs",
    "ai_conversations",
    "email_otp_codes",
    "users",
]

KEEP_TABLES = [
    "exercises",
    "programs",
    "nutrition_products",
]

NOTIFY_TITLE = "Данные приложения сброшены"
NOTIFY_TEXT = (
    "Мы обновили Fitness Mini App и очистили пользовательскую базу.\n\n"
    "Пожалуйста, откройте приложение заново и пройдите регистрацию / анкету "
    "с нуля (профиль, цели, программа).\n\n"
    "Каталог упражнений, программ и продуктов сохранён — ваши личные "
    "тренировки, замеры и настройки сброшены."
)


@dataclass
class TgUser:
    telegram_id: int
    username: str | None


async def fetch_recipients() -> list[TgUser]:
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT telegram_id, username FROM users "
                    "WHERE telegram_id IS NOT NULL "
                    "ORDER BY created_at NULLS LAST"
                )
            )
        ).fetchall()
    out: list[TgUser] = []
    seen: set[int] = set()
    for tid, uname in rows:
        if tid is None:
            continue
        tid_i = int(tid)
        if tid_i in seen:
            continue
        seen.add(tid_i)
        out.append(TgUser(telegram_id=tid_i, username=uname))
    return out


async def table_counts() -> dict[str, int]:
    async with engine.connect() as conn:
        names = (
            await conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public' ORDER BY 1"
                )
            )
        ).fetchall()
        result: dict[str, int] = {}
        for (name,) in names:
            try:
                n = (await conn.execute(text(f'SELECT count(*) FROM "{name}"'))).scalar()
                result[name] = int(n or 0)
            except Exception:  # noqa: BLE001
                result[name] = -1
        return result


async def wipe_user_data() -> dict[str, int]:
    """TRUNCATE user tables. Returns deleted-ish counts from before wipe."""
    before = await table_counts()
    async with engine.begin() as conn:
        existing = {
            r[0]
            for r in (
                await conn.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema='public'"
                    )
                )
            ).fetchall()
        }
        to_wipe = [t for t in WIPE_TABLES if t in existing]
        if not to_wipe:
            return before
        # RESTART IDENTITY + CASCADE for any leftover FKs
        joined = ", ".join(f'"{t}"' for t in to_wipe)
        await conn.execute(text(f"TRUNCATE TABLE {joined} RESTART IDENTITY CASCADE"))
    return before


async def notify_all(recipients: list[TgUser]) -> tuple[int, int, list[str]]:
    settings = get_settings()
    ok = 0
    fail = 0
    errors: list[str] = []
    for u in recipients:
        label = f"tg={u.telegram_id} @{u.username or '-'}"
        try:
            await send_app_notification(
                settings,
                telegram_id=u.telegram_id,
                title=NOTIFY_TITLE,
                text=NOTIFY_TEXT,
                startapp="profile",
            )
            ok += 1
            print(f"  OK  {label}")
        except TelegramBotError as exc:
            fail += 1
            msg = f"FAIL {label}: {exc}"
            errors.append(msg)
            print(f"  {msg}")
        except Exception as exc:  # noqa: BLE001
            fail += 1
            msg = f"FAIL {label}: {exc}"
            errors.append(msg)
            print(f"  {msg}")
        await asyncio.sleep(0.05)  # gentle rate limit
    return ok, fail, errors


async def run(*, execute: bool) -> int:
    print("=== reset_user_data_and_notify ===")
    print(f"mode: {'EXECUTE' if execute else 'DRY-RUN'}")
    counts = await table_counts()
    print("counts before:")
    for k in sorted(counts):
        mark = "KEEP" if k in KEEP_TABLES else ("WIPE" if k in WIPE_TABLES else "?")
        print(f"  [{mark}] {k}: {counts[k]}")

    recipients = await fetch_recipients()
    print(f"recipients: {len(recipients)}")
    for u in recipients:
        print(f"  tg={u.telegram_id} @{u.username or '-'}")

    if not execute:
        print("\nDry-run only. Re-run with --execute to wipe + notify.")
        return 0

    if not recipients:
        print("No telegram users found — still wiping user tables.")

    print("\n1) Wiping user tables…")
    before = await wipe_user_data()
    after = await table_counts()
    for t in WIPE_TABLES:
        if t in after:
            print(f"  {t}: {before.get(t, '?')} -> {after.get(t)}")
    for t in KEEP_TABLES:
        if t in after:
            print(f"  keep {t}: {after.get(t)}")

    print("\n2) Notifying…")
    ok, fail, _ = await notify_all(recipients)
    print(f"\nDone. notified_ok={ok} notified_fail={fail} wiped_users={before.get('users')}")
    return 0 if fail == 0 else 2


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually wipe DB and send Telegram messages (default is dry-run).",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(execute=args.execute)))


if __name__ == "__main__":
    main()
