from __future__ import annotations

import json
import sys
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from audit_exercise_media import audit  # noqa: E402


def test_every_seed_exercise_has_audited_media_status() -> None:
    rows, errors = audit()
    seed = json.loads(
        (Path(__file__).resolve().parents[1] / "scripts" / "seed_content" / "exercises.json")
        .read_text(encoding="utf-8")
    )

    assert len(rows) == len(seed)
    assert not errors
    assert all(row["status"] != "отсутствует" for row in rows)


def test_plank_has_verified_gif_and_side_plank_is_not_substituted() -> None:
    rows, _ = audit()
    by_name = {row["name"]: row for row in rows}

    assert by_name["Планка"]["file"] == "2135-VBAWRPG.gif"
    assert by_name["Планка"]["status"] == "точное"
    assert by_name["Боковая планка"]["file"] == "—"
    assert by_name["Боковая планка"]["status"] == "отклонено: нет точного GIF"
