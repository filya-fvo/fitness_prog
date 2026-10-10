"""Stable schedule boundary; normal workout progress is deliberately excluded."""
import hashlib
import json
from app.services import scheduler

def schedule_fingerprint(goals: dict) -> str:
    value = {
        "program": goals.get("active_program_id"),
        "timezone": str(scheduler._schedule_timezone(goals)),
        "settings": scheduler.workout_schedule_settings(goals),
        "overrides": scheduler._schedule_overrides(goals),
        "cancellations": scheduler._schedule_cancellations(goals),
        "assignments": scheduler._schedule_assignments(goals),
        "history": goals.get(scheduler.SCHEDULE_HISTORY_KEY),
        "time_history": goals.get(scheduler.SCHEDULE_TIME_HISTORY_KEY),
        "illness": goals.get("workout_illness_periods"),
    }
    encoded = json.dumps(value,sort_keys=True,separators=(",",":"),default=str).encode()
    return hashlib.sha256(encoded).hexdigest()
