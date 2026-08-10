"""User notification preferences + due checks (stored in users.goals JSONB)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

DEFAULT_TZ = "Europe/Moscow"

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

SPECIAL_TIMES = {
    "pre_workout": -45,
    "post_workout": 30,
    "during_workout": 0,
}


SPECIAL_SLOT_LABELS = {
    "pre_workout": "До тренировки (−45 мин)",
    "post_workout": "После тренировки (+30 мин)",
    "during_workout": "Во время тренировки",
}


def slot_label(slot: str) -> str:
    s = str(slot or "").strip()
    if s in SPECIAL_SLOT_LABELS:
        return SPECIAL_SLOT_LABELS[s]
    return s


def _normalize_days_mode(raw: str | None) -> str:
    """Map UI/API day rules to every | workout | rest."""
    days_raw = str(raw or "every").strip().lower()
    if days_raw in {"workout", "workout_day", "training", "train"}:
        return "workout"
    if days_raw in {"rest", "rest_day", "off", "non_workout", "no_workout", "recovery"}:
        return "rest"
    return "every"


def normalize_supplement_schedule(sup: dict[str, Any]) -> list[dict[str, str]]:
    """Return [{slot, days}] where days is every|workout|rest. Accepts legacy times[]."""
    out: list[dict[str, str]] = []
    raw = sup.get("schedule")
    if isinstance(raw, list) and raw:
        for item in raw:
            if isinstance(item, str):
                slot = item.strip()
                days = "every"
            elif isinstance(item, dict):
                slot = str(item.get("slot") or item.get("time") or "").strip()
                days = _normalize_days_mode(str(item.get("days") or item.get("when") or "every"))
            else:
                continue
            if slot:
                out.append({"slot": slot, "days": days})
        if out:
            return out
    times = sup.get("times") or []
    if isinstance(times, list):
        for t in times:
            slot = str(t).strip()
            if slot:
                out.append({"slot": slot, "days": "every"})
    return out


def is_workout_day(settings: dict[str, Any], weekday: int) -> bool:
    wcfg = settings.get("workouts") or {}
    days = wcfg.get("days") or []
    try:
        days_i = {int(d) for d in days}
    except (TypeError, ValueError):
        days_i = set()
    return weekday in days_i

def default_notification_settings() -> dict[str, Any]:
    return {
        "timezone": DEFAULT_TZ,
        "catch_up": True,
        "measurements": {
            "enabled": True,
            "time": "10:00",
            "interval_days": 14,
            "weekday": 0,
        },
        "workouts": {
            "enabled": True,
            "time": "18:30",
            "days": [0, 2, 4],
        },
        "supplements": {
            "enabled": True,
        },
        "water": {
            "enabled": False,
            "daily_ml": 2500,
            "interval_minutes": 120,
            "start_time": "09:00",
            "end_time": "21:00",
        },
        "calories": {
            "enabled": False,
            "times": ["14:00", "20:00"],
        },
    }


def merge_notification_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = default_notification_settings()
    if not raw:
        return base
    out = {**base, **raw}
    for key in ("measurements", "workouts", "supplements", "water", "calories"):
        if isinstance(raw.get(key), dict):
            out[key] = {**base.get(key, {}), **raw[key]}
    cal = out.get("calories") or {}
    times = cal.get("times")
    if isinstance(times, str):
        cal["times"] = [t.strip() for t in times.replace(";", ",").split(",") if t.strip()]
        out["calories"] = cal
    elif not isinstance(times, list):
        cal["times"] = list(base["calories"]["times"])
        out["calories"] = cal
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
    return timezone(timedelta(hours=3), name="MSK")


def local_now(tz_name: str | None = None) -> datetime:
    return datetime.now(_resolve_tz(tz_name))


def _state(goals: dict[str, Any]) -> dict[str, Any]:
    st = goals.get("notification_state")
    return dict(st) if isinstance(st, dict) else {}


def water_ml_for_day(goals: dict[str, Any], day: date | str) -> int:
    key = day.isoformat() if isinstance(day, date) else str(day)[:10]
    logs = goals.get("water_log")
    if not isinstance(logs, dict):
        return 0
    try:
        return max(0, int(float(logs.get(key) or 0)))
    except (TypeError, ValueError):
        return 0


def set_water_ml_for_day(goals: dict[str, Any], day: date | str, ml: int) -> dict[str, Any]:
    g = dict(goals or {})
    logs = dict(g.get("water_log") or {}) if isinstance(g.get("water_log"), dict) else {}
    key = day.isoformat() if isinstance(day, date) else str(day)[:10]
    logs[key] = max(0, int(ml))
    try:
        cutoff = (date.fromisoformat(key) - timedelta(days=14)).isoformat()
        logs = {k: v for k, v in logs.items() if str(k) >= cutoff}
    except ValueError:
        pass
    g["water_log"] = logs
    return g


def water_slots(start: time, end: time, interval_minutes: int) -> list[time]:
    if interval_minutes <= 0:
        interval_minutes = 120
    interval_minutes = max(30, min(360, int(interval_minutes)))
    slots: list[time] = []
    cur = datetime(2000, 1, 1, start.hour, start.minute)
    end_dt = datetime(2000, 1, 1, end.hour, end.minute)
    if end_dt < cur:
        return [start]
    while cur <= end_dt:
        slots.append(cur.time())
        cur += timedelta(minutes=interval_minutes)
    return slots or [start]


def due_notifications(
    goals: dict[str, Any],
    *,
    now: datetime | None = None,
    window_minutes: int = 7,
    catch_up: bool | None = None,
) -> list[dict[str, Any]]:
    settings = merge_notification_settings(
        goals.get("notification_settings")
        if isinstance(goals.get("notification_settings"), dict)
        else None
    )
    tz_name = str(settings.get("timezone") or DEFAULT_TZ)
    now = now or local_now(tz_name)
    state = _state(goals)
    use_catch_up = settings.get("catch_up", True) if catch_up is None else bool(catch_up)
    due: list[dict[str, Any]] = []

    mcfg = settings.get("measurements") or {}
    if mcfg.get("enabled"):
        t = parse_hhmm(str(mcfg.get("time") or "10:00"))
        interval = int(mcfg.get("interval_days") or 14)
        raw_wd = mcfg.get("weekday", None)
        weekday_ok = True
        if raw_wd is not None and str(raw_wd).strip() != "":
            try:
                weekday_ok = now.weekday() == int(raw_wd)
            except (TypeError, ValueError):
                weekday_ok = True
        if t and weekday_ok and _time_due(now, t, window_minutes, catch_up=use_catch_up):
            last = state.get("last_measurement_date")
            today_s = now.date().isoformat()
            should = True
            if last:
                try:
                    last_d = date.fromisoformat(str(last)[:10])
                    should = (now.date() - last_d).days >= interval
                except ValueError:
                    should = True
            if should and state.get("last_measurement_mark") != f"meas:{today_s}":
                due.append(
                    {
                        "kind": "measurements",
                        "title": "Напоминание о замерах",
                        "text": (
                            "Пора обновить замеры тела (вес, талия и др.) в профиле Mini App.\n"
                            "Это поможет точнее считать калории и видеть прогресс."
                        ),
                        "startapp": "profile",
                        "state_key": "last_measurement_mark",
                        "state_value": f"meas:{today_s}",
                        "extra_state": {"last_measurement_date": today_s},
                    }
                )

    wcfg = settings.get("workouts") or {}
    if wcfg.get("enabled"):
        t = parse_hhmm(str(wcfg.get("time") or "18:30"))
        days = wcfg.get("days") or []
        try:
            days_i = {int(d) for d in days}
        except (TypeError, ValueError):
            days_i = set()
        if t and now.weekday() in days_i and _time_due(now, t, window_minutes, catch_up=use_catch_up):
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

    scfg = settings.get("supplements") or {}
    if scfg.get("enabled"):
        supplements = goals.get("supplements")
        if isinstance(supplements, list):
            workout_t = parse_hhmm(
                str((settings.get("workouts") or {}).get("time") or "18:30")
            ) or time(18, 30)
            sent = state.get("supplement_marks") or {}
            if not isinstance(sent, dict):
                sent = {}
            today_is_workout = is_workout_day(settings, now.weekday())
            for sup in supplements:
                if not isinstance(sup, dict) or not sup.get("enabled", True):
                    continue
                name = str(sup.get("name_ru") or sup.get("key") or "Добавка")
                dose = str(sup.get("dose") or "")
                sid = str(sup.get("id") or sup.get("key") or name)
                for entry in normalize_supplement_schedule(sup):
                    slot_s = entry["slot"]
                    days_mode = entry.get("days") or "every"
                    if days_mode == "workout" and not today_is_workout:
                        continue
                    if days_mode == "rest" and today_is_workout:
                        continue
                    target = _resolve_slot_time(slot_s, workout_t)
                    if not target or not _time_due(now, target, window_minutes, catch_up=use_catch_up):
                        continue
                    mark = f"sup:{sid}:{now.date().isoformat()}:{slot_s}:{days_mode}"
                    # legacy mark without days_mode
                    legacy = f"sup:{sid}:{now.date().isoformat()}:{slot_s}"
                    if sent.get(mark) or sent.get(legacy):
                        continue
                    day_note = ""
                    if days_mode == "workout":
                        day_note = " · в день тренировки"
                    elif days_mode == "rest":
                        day_note = " · в день без тренировки"
                    due.append(
                        {
                            "kind": "supplement",
                            "title": f"Добавка: {name}",
                            "text": (
                                f"Пора принять: <b>{name}</b>"
                                + (f" — {dose}" if dose else "")
                                + f"\nКогда: {slot_label(slot_s)}"
                                + day_note
                            ),
                            "startapp": "supplements",
                            "state_key": "supplement_mark",
                            "state_value": mark,
                        }
                    )

    wtr = settings.get("water") or {}
    if wtr.get("enabled"):
        try:
            daily_ml = max(500, min(8000, int(wtr.get("daily_ml") or 2500)))
        except (TypeError, ValueError):
            daily_ml = 2500
        try:
            interval = int(wtr.get("interval_minutes") or 120)
        except (TypeError, ValueError):
            interval = 120
        start_t = parse_hhmm(str(wtr.get("start_time") or "09:00")) or time(9, 0)
        end_t = parse_hhmm(str(wtr.get("end_time") or "21:00")) or time(21, 0)
        drunk = water_ml_for_day(goals, now.date())
        left = max(0, daily_ml - drunk)
        # Goal already met (e.g. 4500/4500) — skip remaining slots entirely.
        # Previously we still sent "цель выполнена" at each due slot.
        if left > 0:
            water_marks = state.get("water_marks") or {}
            if not isinstance(water_marks, dict):
                water_marks = {}
            pending_water: list[time] = []
            for slot in water_slots(start_t, end_t, interval):
                if not _time_due(now, slot, window_minutes, catch_up=use_catch_up):
                    continue
                mark = f"water:{now.date().isoformat()}:{slot.strftime('%H:%M')}"
                if water_marks.get(mark):
                    continue
                pending_water.append(slot)
            # Catch-up after downtime: one digest, mark all missed slots (no spam).
            if use_catch_up and len(pending_water) > 1:
                pending_water = [pending_water[-1]]
                all_missed = []
                for slot in water_slots(start_t, end_t, interval):
                    if not _time_due(now, slot, window_minutes, catch_up=True):
                        continue
                    mark = f"water:{now.date().isoformat()}:{slot.strftime('%H:%M')}"
                    if not water_marks.get(mark):
                        all_missed.append(slot)
                slot = pending_water[0]
                liters = daily_ml / 1000
                marks = [
                    f"water:{now.date().isoformat()}:{s.strftime('%H:%M')}" for s in all_missed
                ]
                due.append(
                    {
                        "kind": "water",
                        "title": "Напоминание о воде",
                        "text": (
                            f"Цель на день: <b>{liters:.1f} л</b> ({daily_ml} мл).\n"
                            f"Уже отмечено: <b>{drunk} мл</b>. "
                            f"Осталось ~<b>{left} мл</b>."
                            f"\nПропущено слотов: {len(all_missed)} "
                            f"(до {slot.strftime('%H:%M')}). Отметьте воду в приложении."
                        ),
                        "startapp": "home",
                        "state_key": "water_mark",
                        "state_value": marks[-1]
                        if marks
                        else f"water:{now.date().isoformat()}:{slot.strftime('%H:%M')}",
                        "state_values": marks,
                        "meta": {
                            "daily_ml": daily_ml,
                            "drunk_ml": drunk,
                            "left_ml": left,
                            "slot": slot.strftime("%H:%M"),
                            "missed_slots": [s.strftime("%H:%M") for s in all_missed],
                            "digest": True,
                        },
                    }
                )
            else:
                for slot in pending_water:
                    mark = f"water:{now.date().isoformat()}:{slot.strftime('%H:%M')}"
                    liters = daily_ml / 1000
                    due.append(
                        {
                            "kind": "water",
                            "title": "Напоминание о воде",
                            "text": (
                                f"Цель на день: <b>{liters:.1f} л</b> ({daily_ml} мл).\n"
                                f"Уже отмечено: <b>{drunk} мл</b>. "
                                f"Осталось ~<b>{left} мл</b>."
                                f"\nСлот: {slot.strftime('%H:%M')} · интервал {interval} мин."
                            ),
                            "startapp": "home",
                            "state_key": "water_mark",
                            "state_value": mark,
                            "meta": {
                                "daily_ml": daily_ml,
                                "drunk_ml": drunk,
                                "left_ml": left,
                                "slot": slot.strftime("%H:%M"),
                            },
                        }
                    )

    ccfg = settings.get("calories") or {}
    if ccfg.get("enabled"):
        raw_times = ccfg.get("times") or ["14:00", "20:00"]
        if not isinstance(raw_times, list):
            raw_times = ["14:00", "20:00"]
        cal_marks = state.get("calorie_marks") or {}
        if not isinstance(cal_marks, dict):
            cal_marks = {}
        pending_cal: list[tuple[time, str]] = []
        for slot_s in raw_times:
            target = parse_hhmm(str(slot_s))
            if not target or not _time_due(now, target, window_minutes, catch_up=use_catch_up):
                continue
            mark = f"cal:{now.date().isoformat()}:{target.strftime('%H:%M')}"
            if cal_marks.get(mark):
                continue
            pending_cal.append((target, mark))
        if use_catch_up and len(pending_cal) > 1:
            # mark all missed, send only latest
            all_marks = [m for _, m in pending_cal]
            target, mark = pending_cal[-1]
            due.append(
                {
                    "kind": "calories",
                    "title": "Напоминание о калориях",
                    "text": (
                        f"Проверьте дневник питания (слот {target.strftime('%H:%M')}).\n"
                        "Откройте Mini App -> Питание."
                    ),
                    "startapp": "nutrition",
                    "state_key": "calorie_mark",
                    "state_value": mark,
                    "state_values": all_marks,
                    "meta": {"slot": target.strftime("%H:%M"), "needs_calorie_context": True},
                }
            )
        else:
            for target, mark in pending_cal:
                due.append(
                    {
                        "kind": "calories",
                        "title": "Напоминание о калориях",
                        "text": (
                            f"Проверьте дневник питания (слот {target.strftime('%H:%M')}).\n"
                            "Откройте Mini App -> Питание."
                        ),
                        "startapp": "nutrition",
                        "state_key": "calorie_mark",
                        "state_value": mark,
                        "meta": {"slot": target.strftime("%H:%M"), "needs_calorie_context": True},
                    }
                )

    return due


def format_calorie_reminder_text(
    *,
    eaten: float,
    target: float | None,
    slot: str,
) -> str:
    eaten_i = int(round(eaten))
    if target is None or target <= 0:
        return (
            f"Сейчас {slot}. Сегодня съедено: <b>{eaten_i} ккал</b>.\n"
            "Цель калорий не рассчитана — заполните профиль (пол, вес, рост, активность).\n"
            "Mini App -> Питание."
        )
    target_i = int(round(target))
    delta = eaten_i - target_i
    if delta > 0:
        bal = f"Перебор: <b>+{delta} ккал</b>"
    elif delta < 0:
        bal = f"Недобор: <b>{delta} ккал</b> (ещё можно ~{abs(delta)} ккал)"
    else:
        bal = "Ровно в цели"
    return (
        f"Сейчас {slot}. Калории на сегодня:\n"
        f"Съедено: <b>{eaten_i}</b> / цель <b>{target_i}</b> ккал.\n"
        f"{bal}\n"
        "Mini App -> Питание."
    )


def apply_state_updates(goals: dict[str, Any], due_items: list[dict[str, Any]]) -> dict[str, Any]:
    g = dict(goals or {})
    state = _state(g)
    marks = dict(state.get("supplement_marks") or {})
    water_marks = dict(state.get("water_marks") or {})
    calorie_marks = dict(state.get("calorie_marks") or {})
    for item in due_items:
        key = item.get("state_key")
        vals = item.get("state_values")
        val = item.get("state_value")
        value_list: list[Any] = []
        if isinstance(vals, list) and vals:
            value_list = list(vals)
        elif val is not None:
            value_list = [val]
        if not key or not value_list:
            continue
        if key == "supplement_mark":
            for v in value_list:
                marks[str(v)] = True
        elif key == "water_mark":
            for v in value_list:
                water_marks[str(v)] = True
        elif key == "calorie_mark":
            for v in value_list:
                calorie_marks[str(v)] = True
        else:
            state[str(key)] = value_list[-1]
        extra = item.get("extra_state")
        if isinstance(extra, dict):
            for ek, ev in extra.items():
                state[str(ek)] = ev

    cutoff = (date.today() - timedelta(days=3)).isoformat()
    if marks:
        pruned: dict[str, Any] = {}
        for k, v in marks.items():
            parts = str(k).split(":")
            day_part = parts[2] if len(parts) >= 3 else ""
            if not day_part or day_part >= cutoff:
                pruned[k] = v
        state["supplement_marks"] = pruned
    if water_marks:
        pruned_w: dict[str, Any] = {}
        for k, v in water_marks.items():
            parts = str(k).split(":")
            day_part = parts[1] if len(parts) >= 2 else ""
            if not day_part or day_part >= cutoff:
                pruned_w[k] = v
        state["water_marks"] = pruned_w
    if calorie_marks:
        pruned_c: dict[str, Any] = {}
        for k, v in calorie_marks.items():
            parts = str(k).split(":")
            day_part = parts[1] if len(parts) >= 2 else ""
            if not day_part or day_part >= cutoff:
                pruned_c[k] = v
        state["calorie_marks"] = pruned_c

    g["notification_state"] = state
    return g


def _time_due(
    now: datetime,
    target: time,
    window_minutes: int,
    *,
    catch_up: bool,
) -> bool:
    target_dt = now.replace(hour=target.hour, minute=target.minute, second=0, microsecond=0)
    if catch_up:
        return now >= target_dt and now.date() == target_dt.date()
    delta = abs((now - target_dt).total_seconds())
    return delta <= window_minutes * 60


def _in_window(now: datetime, target: time, window_minutes: int) -> bool:
    return _time_due(now, target, window_minutes, catch_up=False)


def _resolve_slot_time(slot: str, workout_time: time) -> time | None:
    if slot in SPECIAL_TIMES:
        base = datetime(2000, 1, 1, workout_time.hour, workout_time.minute)
        base = base + timedelta(minutes=SPECIAL_TIMES[slot])
        return base.time()
    return parse_hhmm(slot)
