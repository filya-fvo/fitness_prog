"""Idempotent seed: 100 exercises + template programs (P0)."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise
from app.models.program import Program
from app.models.user import User
from app.services import seed_programs

CONTENT = Path(__file__).resolve().parent / "seed_content"

PROGRAM_RENAMES = seed_programs.PROGRAM_RENAMES


def _load_exercise_renames() -> dict[str, str]:
    path = CONTENT / "exercise_renames.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {str(k): str(v) for k, v in raw.items() if str(k) and str(v) and str(k) != str(v)}


async def upsert_exercises(session) -> tuple[int, int]:
    payload = json.loads((CONTENT / "exercises.json").read_text(encoding="utf-8"))
    renames = _load_exercise_renames()
    existing_items = list(
        (
            await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
        ).all()
    )
    existing = {item.name_ru: item for item in existing_items}

    # Rename existing rows first so programs keep the same exercise UUIDs.
    renamed = 0
    for old_name, new_name in renames.items():
        item = existing.get(old_name)
        if item is None or old_name == new_name:
            continue
        target = existing.get(new_name)
        if target is not None and target.id != item.id:
            # Prefer keeping the already-correct Russian row; retire the old name.
            item.is_deleted = True
            renamed += 1
            continue
        item.name_ru = new_name
        existing.pop(old_name, None)
        existing[new_name] = item
        renamed += 1

    created = 0
    updated = 0
    for row in payload:
        current = existing.get(row["name_ru"])
        tags = {str(tag) for tag in row.get("tags") or []}
        desired_review_status = (
            "rejected"
            if "media:no-exact-gif" in tags
            else "verified"
            if "media:verified" in tags
            else "pending"
        )
        desired_review_reason = (
            "В каталоге нет точного проверенного GIF."
            if desired_review_status == "rejected"
            else None
        )
        if current is None:
            session.add(
                Exercise(
                    **row,
                    media_review_status=desired_review_status,
                    media_review_reason=desired_review_reason,
                )
            )
            created += 1
            continue
        rejected_by_admin = (
            current.media_review_status == "rejected"
            and bool(current.media_review_reason)
            and "media:rejected-by-admin" in {str(tag) for tag in current.tags or []}
        )
        for key, value in row.items():
            if rejected_by_admin and key in {"animation_url", "thumbnail_url", "tags"}:
                continue
            setattr(current, key, value)
        if not rejected_by_admin:
            current.media_review_status = desired_review_status
            current.media_review_reason = desired_review_reason
        updated += 1
    await session.flush()
    if renamed:
        print(f"exercises_renamed_in_db={renamed}")
    return created, updated


async def upsert_programs(session) -> seed_programs.SeedProgramSyncStats:
    """Synchronize seed programs without mutating published versions in place."""
    payload = json.loads((CONTENT / "programs.json").read_text(encoding="utf-8"))
    return await seed_programs.sync_seed_programs(
        session,
        payload,
        renames=PROGRAM_RENAMES,
    )


async def migrate_renamed_program_references(session) -> int:
    """Move profile pointers from archived renamed templates to their active replacements."""
    names = set(PROGRAM_RENAMES) | set(PROGRAM_RENAMES.values())
    rows = list((await session.scalars(select(Program).where(Program.name.in_(names)))).all())
    by_name = {item.name: item for item in rows}
    id_map = {
        str(by_name[old_name].id): str(by_name[new_name].id)
        for old_name, new_name in PROGRAM_RENAMES.items()
        if old_name in by_name
        and new_name in by_name
        and by_name[old_name].id != by_name[new_name].id
    }
    if not id_map:
        return 0

    migrated = 0
    users = list((await session.scalars(select(User))).all())
    for user in users:
        goals = dict(user.goals or {})
        changed = False
        for field in ("active_program_id", "recommended_program_id"):
            current_id = str(goals.get(field) or "")
            replacement_id = id_map.get(current_id)
            if replacement_id:
                goals[field] = replacement_id
                changed = True
        if changed:
            user.goals = goals
            migrated += 1
    await session.flush()
    return migrated


async def main(*, dry_run: bool = False) -> None:
    if not (CONTENT / "exercises.json").exists() or not (CONTENT / "programs.json").exists():
        raise SystemExit("Run scripts/build_programs_v2.py (or generate_seed_content.py) first")

    async with AsyncSessionLocal() as session:
        ex_c, ex_u = await upsert_exercises(session)
        program_stats = await upsert_programs(session)
        pr_refs = await migrate_renamed_program_references(session)
        ex_total = await session.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.is_deleted.is_(False))
        )
        pr_total = await session.scalar(
            select(func.count()).select_from(Program).where(Program.is_deleted.is_(False))
        )
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
        result = "SEED_DRY_RUN_OK" if dry_run else "SEED_OK"
        print(
            f"{result} exercises_created={ex_c} exercises_updated={ex_u} exercises_total={ex_total} "
            f"programs_created={program_stats.created} "
            f"programs_unchanged={program_stats.unchanged} "
            f"programs_versioned={program_stats.versioned} "
            f"programs_retired={program_stats.retired} "
            f"programs_total={pr_total} program_profile_refs_migrated={pr_refs}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish maintained exercise and program seed")
    parser.add_argument("--dry-run", action="store_true", help="validate changes and roll them back")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
