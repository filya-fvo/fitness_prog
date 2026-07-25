"""Supplements catalog + user stack (stored in users.goals.supplements)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.data.supplements_catalog import (
    SUPPLEMENTS_CATALOG,
    catalog_by_key,
    recommended_user_entries,
    user_entry_from_catalog,
)
from sqlalchemy.orm.attributes import flag_modified

from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/supplements", tags=["supplements"])


class SupplementEntry(BaseModel):
    id: str
    key: str
    name_ru: str
    dose: str = ""
    times: list[str] = Field(default_factory=list)
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


def _save_stack(session: AsyncSession, user: User, items: list[dict[str, Any]]) -> User:
    goals = {**(user.goals or {}), "supplements": items}
    user.goals = goals
    return user


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
    # first visit: seed recommended
    if not items and not (user.goals or {}).get("supplements_initialized"):
        items = recommended_user_entries()
        goals = {
            **(user.goals or {}),
            "supplements": items,
            "supplements_initialized": True,
        }
        user.goals = goals
        flag_modified(user, "goals")
        await session.commit()
        await session.refresh(user)
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
    items = [x.model_dump() for x in body.items]
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
    if body.times:
        entry["times"] = body.times
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
    entry = {
        "id": f"custom_{uuid.uuid4().hex[:10]}",
        "key": body.key or "custom",
        "name_ru": body.name_ru.strip(),
        "dose": body.dose,
        "times": body.times or ["10:00"],
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
