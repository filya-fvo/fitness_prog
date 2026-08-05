"""Supplements catalog + user stack (stored in users.goals.supplements)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.database import get_db
from app.data.supplements_catalog import (
    SUPPLEMENTS_CATALOG,
    catalog_by_key,
    user_entry_from_catalog,
)
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/supplements", tags=["supplements"])


class SupplementScheduleItem(BaseModel):
    """One reminder slot: clock time or special (pre_workout/...) + day rule."""

    slot: str
    days: str = Field(default="every", description="every | workout | rest")


class SupplementEntry(BaseModel):
    id: str
    key: str
    name_ru: str
    dose: str = ""
    times: list[str] = Field(default_factory=list)
    schedule: list[SupplementScheduleItem] = Field(default_factory=list)
    enabled: bool = True
    custom: bool = False
    notes: str = ""


class SupplementStackResponse(BaseModel):
    items: list[SupplementEntry]
    catalog: list[dict[str, Any]]


class SupplementStackUpdate(BaseModel):
    items: list[SupplementEntry]


class AddFromCatalogRequest(BaseModel):
    key: str
    dose: str | None = None
    times: list[str] | None = None


class AddCustomRequest(BaseModel):
    name_ru: str = Field(min_length=1, max_length=120)
    dose: str = ""
    times: list[str] = Field(default_factory=lambda: ["10:00"])
    notes: str = ""
    # optional link to catalog key for description
    key: str | None = None


def _stack(user: User) -> list[dict[str, Any]]:
    goals = user.goals or {}
    raw = goals.get("supplements")
    if not isinstance(raw, list):
        return []
    return [x for x in raw if isinstance(x, dict)]


def _normalize_entry_dump(raw: dict[str, Any]) -> dict[str, Any]:
    """Keep times[] in sync with schedule[] for legacy clients / bot marks."""
    item = dict(raw)
    schedule = item.get("schedule") or []
    times = item.get("times") or []
    norm_schedule: list[dict[str, str]] = []
    if isinstance(schedule, list) and schedule:
        for s in schedule:
            if isinstance(s, dict):
                slot = str(s.get("slot") or s.get("time") or "").strip()
                days = str(s.get("days") or "every").strip().lower()
                if days in {"workout", "workout_day", "training", "train"}:
                    days = "workout"
                elif days in {"rest", "rest_day", "off", "non_workout", "no_workout", "recovery"}:
                    days = "rest"
                else:
                    days = "every"
                if slot:
                    norm_schedule.append({"slot": slot, "days": days})
            elif isinstance(s, str) and s.strip():
                norm_schedule.append({"slot": s.strip(), "days": "every"})
    if not norm_schedule and isinstance(times, list):
        for t in times:
            slot = str(t).strip()
            if slot:
                norm_schedule.append({"slot": slot, "days": "every"})
    item["schedule"] = norm_schedule
    item["times"] = [x["slot"] for x in norm_schedule]
    return item


@router.get("/catalog")
async def get_catalog(user: User = Depends(get_current_user)) -> dict[str, Any]:
    _ = user
    return {"items": SUPPLEMENTS_CATALOG, "total": len(SUPPLEMENTS_CATALOG)}


@router.get("/stack", response_model=SupplementStackResponse)
async def get_stack(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupplementStackResponse:
    items = _stack(user)
    # Do not auto-seed stack — user adds supplements manually from catalog.
    if not (user.goals or {}).get("supplements_initialized"):
        goals = {
            **(user.goals or {}),
            "supplements": items if items else [],
            "supplements_initialized": True,
        }
        user.goals = goals
        flag_modified(user, "goals")
        await session.commit()
        await session.refresh(user)
        items = _stack(user)
    return SupplementStackResponse(
        items=[SupplementEntry.model_validate(x) for x in items],
        catalog=SUPPLEMENTS_CATALOG,
    )


@router.put("/stack", response_model=SupplementStackResponse)
async def put_stack(
    body: SupplementStackUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupplementStackResponse:
    items = [_normalize_entry_dump(x.model_dump()) for x in body.items]
    user.goals = {
        **(user.goals or {}),
        "supplements": items,
        "supplements_initialized": True,
    }
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    return SupplementStackResponse(
        items=[SupplementEntry.model_validate(x) for x in items],
        catalog=SUPPLEMENTS_CATALOG,
    )


@router.post("/stack/from-catalog", response_model=SupplementStackResponse)
async def add_from_catalog(
    body: AddFromCatalogRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupplementStackResponse:
    cat = catalog_by_key().get(body.key)
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown supplement key")
    items = _stack(user)
    if any(str(x.get("key")) == body.key for x in items):
        raise HTTPException(status_code=400, detail="Already in stack")
    entry = user_entry_from_catalog(cat)
    if body.dose:
        entry["dose"] = body.dose
    if body.times is not None:
        times = [str(t).strip() for t in body.times if str(t).strip()]
        entry["times"] = times
        entry["schedule"] = [{"slot": t, "days": "every"} for t in times]
    items.append(entry)
    user.goals = {
        **(user.goals or {}),
        "supplements": items,
        "supplements_initialized": True,
    }
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    return SupplementStackResponse(
        items=[SupplementEntry.model_validate(x) for x in items],
        catalog=SUPPLEMENTS_CATALOG,
    )


@router.post("/stack/custom", response_model=SupplementStackResponse)
async def add_custom(
    body: AddCustomRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupplementStackResponse:
    items = _stack(user)
    times = [str(t).strip() for t in (body.times or ["10:00"]) if str(t).strip()] or ["10:00"]
    entry = {
        "id": f"custom_{uuid.uuid4().hex[:10]}",
        "key": body.key or "custom",
        "name_ru": body.name_ru.strip(),
        "dose": body.dose,
        "times": times,
        "schedule": [{"slot": t, "days": "every"} for t in times],
        "enabled": True,
        "custom": True,
        "notes": body.notes,
    }
    items.append(entry)
    user.goals = {
        **(user.goals or {}),
        "supplements": items,
        "supplements_initialized": True,
    }
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    return SupplementStackResponse(
        items=[SupplementEntry.model_validate(x) for x in items],
        catalog=SUPPLEMENTS_CATALOG,
    )


@router.delete("/stack/{entry_id}", response_model=SupplementStackResponse)
async def remove_entry(
    entry_id: str,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupplementStackResponse:
    items = [x for x in _stack(user) if str(x.get("id")) != entry_id]
    user.goals = {
        **(user.goals or {}),
        "supplements": items,
        "supplements_initialized": True,
    }
    flag_modified(user, "goals")
    await session.commit()
    await session.refresh(user)
    return SupplementStackResponse(
        items=[SupplementEntry.model_validate(x) for x in items],
        catalog=SUPPLEMENTS_CATALOG,
    )
