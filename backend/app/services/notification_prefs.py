"""User notification preferences + due checks (stored in users.goals JSONB)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

DEFAULT_TZ = "Europe/Moscow"

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

# Special time tokens resolved against workout time
SPECIAL_TIMES = {
    "pre_workout": -45,  # minutes before workout time
    "post_workout": 30,
    "during_workout": 0,
}


def default_notification_settings() -> dict[str, Any]:
    return {
        "timezone": DEFAULT_TZ,
        "measurements": {
            "enabled": True,
            "time": "10:00",
            "interval_days": 14,
        },
        "workouts": {
            "enabled": True,
            "time": "18:30",
            # 0=Mon ... 6=Sun (Python weekday)
            "days": [0, 2, 4],
        },
        "supplements": {
            "enabled": True,
        },
    }


def merge_notification_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = default_notification_settings()
    if not raw:
        return base
    out = {**base, **raw}
    for key in ("measurements", "workouts", "supplements"):
        if isinstance(raw.get(key), dict):
            out[key] = {**base.get(key, {}), **raw[key]}
    return out


def parse_hhmm(value: str) -> time | None:
    try:
        parts = value.strip().split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        if 0 <= h <= 23 and 0 <= m <= 59:
            return time(h, m)
    except (TypeError, ValueError, IndexError):
        return None
    return None


def _resolve_tz(tz_name: str | None = None):
    name = tz_name or DEFAULT_TZ
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except Exception:
            pass
    # Windows without tzdata package: fall back to fixed UTC+3 (MSK)
    return timezone(timedelta(hours=3), name="MSK")


def local_now(tz_name: str | None = None) -> datetime:
    return datetime.now(_resolve_tz(tz_name))


def _state(goals: dict[str, Any]) -> dict[str, Any]:
    st = goals.get("notification_state")
    return dict(st) if isinstance(st, dict) else {}


def due_notifications(
    goals: dict[str, Any],
    *,
    now: datetime | None = None,
    window_minutes: int = 7,
) -> list[dict[str, Any]]:
    """
    Return list of notification payloads due now (within window).
    Does not mutate goals; caller applies state updates from returned mark keys.
    """
    settings = merge_notification_settings(
        goals.get("notification_settings")
        if isinstance(goals.get("notification_settings"), dict)
        else None
    )
    tz_name = str(settings.get("timezone") or DEFAULT_TZ)
    now = now or local_now(tz_name)
    state = _state(goals)
    due: list[dict[str, Any]] = []

    # --- measurements ---
    mcfg = settings.get("measurements") or {}
    if mcfg.get("enabled"):
        t = parse_hhmm(str(mcfg.get("time") or "10:00"))
        interval = int(mcfg.get("interval_days") or 14)
        if t and _in_window(now, t, window_minutes):
            last = state.get("last_measurement_date")
            today_s = now.date().isoformat()
            should = True
            if last:
                try:
                    last_d = date.fromisoformat(str(last)[:10])
                    should = (now.date() - last_d).days >= interval
                except ValueError:
                    should = True
            if should:
                due.append(
                    {
                        "kind": "measurements",
                        "title": "Напоминание о замерах",
                        "text": (
                            "Пора обновить замеры тела (вес, талия и др.) в профиле Mini App.\n"
                            "Это поможет точнее считать калории и видеть прогресс."
                        ),
                        "startapp": "profile",
                        "state_key": "last_measurement_date",
                        "state_value": today_s,
                    }
                )

    # --- workouts ---
    wcfg = settings.get("workouts") or {}
    if wcfg.get("enabled"):
        t = parse_hhmm(str(wcfg.get("time") or "18:30"))
        days = wcfg.get("days") or []
        try:
            days_i = {int(d) for d in days}
        except (TypeError, ValueError):
            days_i = set()
        if t and now.weekday() in days_i and _in_window(now, t, window_minutes):
            mark = f"workout:{now.date().isoformat()}"
            if state.get("last_workout_mark") != mark:
                due.append(
                    {
                        "kind": "workout",
                        "title": "День тренировки",
                        "text": (
                            f"Сегодня тренировочный день. Время по плану: {t.strftime('%H:%M')}.\n"
                            "Откройте Mini App и начните сессию."
                        ),
                        "startapp": "home",
                        "state_key": "last_workout_mark",
                        "state_value": mark,
                    }
                )

    # --- supplements ---
    scfg = settings.get("supplements") or {}
    if scfg.get("enabled"):
        supplements = goals.get("supplements")
        if isinstance(supplements, list):
            workout_t = parse_hhmm(
                str((settings.get("workouts") or {}).get("time") or "18:30")
            ) or time(18, 30)
            for sup in supplements:
                if not isinstance(sup, dict) or not sup.get("enabled", True):
                    continue
                name = str(sup.get("name_ru") or sup.get("key") or "Добавка")
                dose = str(sup.get("dose") or "")
                sid = str(sup.get("id") or sup.get("key") or name)
                times = sup.get("times") or []
                if not isinstance(times, list):
                    continue
                for slot in times:
                    slot_s = str(slot)
                    target = _resolve_slot_time(slot_s, workout_t)
                    if not target or not _in_window(now, target, window_minutes):
                        continue
                    mark = f"sup:{sid}:{now.date().isoformat()}:{slot_s}"
                    sent = state.get("supplement_marks") or {}
                    if isinstance(sent, dict) and sent.get(mark):
                        continue
                    due.append(
                        {
                            "kind": "supplement",
                            "title": f"Добавка: {name}",
                            "text": (
                                f"Пора принять: <b>{name}</b>"
                                + (f" — {dose}" if dose else "")
                                + f"\nСлот: {slot_s}"
                            ),
                            "startapp": "supplements",
                            "state_key": "supplement_mark",
                            "state_value": mark,
                        }
                    )

    return due


def apply_state_updates(goals: dict[str, Any], due_items: list[dict[str, Any]]) -> dict[str, Any]:
    """Return new goals dict with notification_state updated for sent items."""
    g = dict(goals or {})
    state = _state(g)
    marks = dict(state.get("supplement_marks") or {})
    for item in due_items:
        key = item.get("state_key")
        val = item.get("state_value")
        if not key or val is None:
            continue
        if key == "supplement_mark":
            marks[str(val)] = True
        else:
            state[str(key)] = val

    if marks:
        cutoff = (date.today() - timedelta(days=3)).isoformat()
        pruned: dict[str, Any] = {}
        for k, v in marks.items():
            parts = str(k).split(":")
            # mark format: sup:id:YYYY-MM-DD:slot...
            day_part = parts[2] if len(parts) >= 3 else ""
            if not day_part or day_part >= cutoff:
                pruned[k] = v
        state["supplement_marks"] = pruned

    g["notification_state"] = state
    return g


def _in_window(now: datetime, target: time, window_minutes: int) -> bool:
    target_dt = now.replace(hour=target.hour, minute=target.minute, second=0, microsecond=0)
    delta = abs((now - target_dt).total_seconds())
    return delta <= window_minutes * 60


def _resolve_slot_time(slot: str, workout_time: time) -> time | None:
    if slot in SPECIAL_TIMES:
        base = datetime(2000, 1, 1, workout_time.hour, workout_time.minute)
        base = base + timedelta(minutes=SPECIAL_TIMES[slot])
        return base.time()
    return parse_hhmm(slot)
