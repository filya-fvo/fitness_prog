"""Resolve wall-clock slots consistently across DST gaps and folds."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def resolve_local_slot(day: date, slot: time, timezone_name: str) -> datetime:
    zone = ZoneInfo(timezone_name)
    wall = datetime.combine(day, slot).replace(tzinfo=None)
    for offset in range(181):
        candidate = wall + timedelta(minutes=offset)
        instants = []
        for fold in (0, 1):
            instant = candidate.replace(tzinfo=zone, fold=fold).astimezone(UTC)
            if instant.astimezone(zone).replace(tzinfo=None) == candidate:
                instants.append(instant)
        if instants:
            return min(instants)
    raise ValueError("Не удалось определить время напоминания")
