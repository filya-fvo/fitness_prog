"""Search, preflight, media safety, and usage checks for the exercise editor."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import uuid
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlparse

import httpx
from pydantic import ValidationError
from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.exercise import Exercise
from app.models.program import Program
from app.models.workout import Workout, WorkoutSet
from app.schemas.admin_exercise import (
    AdminExerciseItem,
    AdminExerciseOptions,
    ExerciseDuplicateCandidate,
    ExerciseImportPreviewResponse,
    ExerciseImportPreviewRow,
    ExerciseMediaCheckRequest,
    ExerciseMediaCheckResponse,
    ExercisePreflightRequest,
    ExercisePreflightResponse,
    MediaQuality,
)
from app.schemas.exercise import ExerciseCreate

_MEDIA_LIMITS = {
    "video_url": 25 * 1024 * 1024,
    "animation_url": 25 * 1024 * 1024,
    "thumbnail_url": 5 * 1024 * 1024,
}
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}


def media_quality(exercise: Exercise) -> MediaQuality:
    tags = {str(item) for item in (exercise.tags or [])}
    if "media:no-exact-gif" in tags:
        return "rejected"
    urls = [exercise.animation_url, exercise.video_url, exercise.thumbnail_url]
    if not any(value and value.strip() for value in urls):
        return "missing"
    if "curated" in tags or "media:verified" in tags or (
        exercise.animation_url and exercise.animation_url.startswith("/exercise-gifs/")
    ):
        return "ready"
    return "unverified"


def _quality_filter(value: MediaQuality):
    rejected = Exercise.tags.contains(["media:no-exact-gif"])
    has_media = or_(
        func.coalesce(Exercise.video_url, "") != "",
        func.coalesce(Exercise.animation_url, "") != "",
        func.coalesce(Exercise.thumbnail_url, "") != "",
    )
    verified = or_(
        Exercise.tags.contains(["curated"]),
        Exercise.tags.contains(["media:verified"]),
        Exercise.animation_url.like("/exercise-gifs/%"),
    )
    if value == "rejected":
        return rejected
    if value == "missing":
        return and_(~rejected, ~has_media)
    if value == "ready":
        return and_(~rejected, has_media, verified)
    return and_(~rejected, has_media, ~verified)


def _program_references(structure: object, exercise_id: uuid.UUID) -> bool:
    needle = str(exercise_id)
    if isinstance(structure, dict):
        if str(structure.get("exercise_id") or "") == needle:
            return True
        return any(_program_references(value, exercise_id) for value in structure.values())
    if isinstance(structure, list):
        return any(_program_references(value, exercise_id) for value in structure)
    return False


async def _program_usage(
    session: AsyncSession,
    exercise_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    if not exercise_ids:
        return {}
    needles = [str(value) for value in exercise_ids]
    result = await session.execute(
        select(Program.id, Program.structure).where(
            Program.is_deleted.is_(False),
            or_(*(cast(Program.structure, String).contains(needle) for needle in needles)),
        )
    )
    counts = {value: 0 for value in exercise_ids}
    for _program_id, structure in result.all():
        for exercise_id in exercise_ids:
            if _program_references(structure, exercise_id):
                counts[exercise_id] += 1
    return counts


async def _workout_usage(
    session: AsyncSession,
    exercise_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    if not exercise_ids:
        return {}
    result = await session.execute(
        select(WorkoutSet.exercise_id, func.count(func.distinct(WorkoutSet.workout_id)))
        .where(WorkoutSet.exercise_id.in_(exercise_ids), WorkoutSet.is_deleted.is_(False))
        .group_by(WorkoutSet.exercise_id)
    )
    counts = {value: int(count) for value, count in result.all()}
    plan_rows = await session.execute(
        select(Workout.id, Workout.plan).where(
            Workout.is_deleted.is_(False),
            or_(*(cast(Workout.plan, String).contains(str(value)) for value in exercise_ids)),
        )
    )
    seen: dict[uuid.UUID, set[uuid.UUID]] = {value: set() for value in exercise_ids}
    for workout_id, plan in plan_rows.all():
        for exercise_id in exercise_ids:
            if _program_references(plan, exercise_id):
                seen[exercise_id].add(workout_id)
    for exercise_id, workout_ids in seen.items():
        counts[exercise_id] = max(counts.get(exercise_id, 0), len(workout_ids))
    return counts


async def usage_counts(session: AsyncSession, exercise_id: uuid.UUID) -> tuple[int, int]:
    workouts = await _workout_usage(session, [exercise_id])
    programs = await _program_usage(session, [exercise_id])
    return workouts.get(exercise_id, 0), programs.get(exercise_id, 0)


async def list_admin_exercises(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    q: str | None = None,
    muscle_group: str | None = None,
    equipment: str | None = None,
    difficulty: int | None = None,
    tag: str | None = None,
    weight_rule: str | None = None,
    quality: MediaQuality | None = None,
) -> tuple[list[AdminExerciseItem], int]:
    filters = [Exercise.is_deleted.is_(False)]
    if q and q.strip():
        like = f"%{q.strip()}%"
        filters.append(or_(Exercise.name_ru.ilike(like), Exercise.tags.cast(String).ilike(like)))
    if muscle_group:
        filters.append(Exercise.muscle_group == muscle_group)
    if equipment:
        filters.append(Exercise.equipment == equipment)
    if difficulty:
        filters.append(Exercise.difficulty == difficulty)
    if tag:
        filters.append(Exercise.tags.contains([tag]))
    if weight_rule:
        filters.append(Exercise.weight_rule == weight_rule)
    if quality:
        filters.append(_quality_filter(quality))

    total = int(await session.scalar(select(func.count()).select_from(Exercise).where(*filters)) or 0)
    result = await session.execute(
        select(Exercise)
        .where(*filters)
        .order_by(Exercise.name_ru.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    exercises = list(result.scalars().all())
    ids = [item.id for item in exercises]
    workout_counts = await _workout_usage(session, ids)
    program_counts = await _program_usage(session, ids)
    items = [
        AdminExerciseItem.model_validate(
            {
                **item.__dict__,
                "media_quality": media_quality(item),
                "workout_uses": workout_counts.get(item.id, 0),
                "program_uses": program_counts.get(item.id, 0),
            }
        )
        for item in exercises
    ]
    return items, total


async def get_options(session: AsyncSession) -> AdminExerciseOptions:
    filters = [Exercise.is_deleted.is_(False)]
    groups = await session.scalars(
        select(Exercise.muscle_group).where(*filters).distinct().order_by(Exercise.muscle_group)
    )
    equipment = await session.scalars(
        select(Exercise.equipment)
        .where(*filters, Exercise.equipment.is_not(None))
        .distinct()
        .order_by(Exercise.equipment)
    )
    tags_result = await session.scalars(select(Exercise.tags).where(*filters))
    tags = sorted({str(tag) for values in tags_result.all() for tag in (values or [])})
    return AdminExerciseOptions(
        muscle_groups=list(groups.all()),
        equipment=[value for value in equipment.all() if value],
        tags=tags,
    )


def _normalized_name(value: str) -> str:
    return " ".join(value.casefold().replace("ё", "е").split())


async def find_duplicates(
    session: AsyncSession,
    name: str,
    *,
    exclude_id: uuid.UUID | None = None,
) -> list[ExerciseDuplicateCandidate]:
    result = await session.execute(select(Exercise).where(Exercise.is_deleted.is_(False)))
    return _duplicate_candidates(list(result.scalars().all()), name, exclude_id=exclude_id)


def _duplicate_candidates(
    exercises: list[Exercise],
    name: str,
    *,
    exclude_id: uuid.UUID | None = None,
) -> list[ExerciseDuplicateCandidate]:
    target = _normalized_name(name)
    candidates: list[ExerciseDuplicateCandidate] = []
    for item in exercises:
        if item.id == exclude_id:
            continue
        ratio = SequenceMatcher(None, target, _normalized_name(item.name_ru)).ratio()
        if ratio >= 0.72:
            candidates.append(
                ExerciseDuplicateCandidate(id=item.id, name_ru=item.name_ru, similarity=round(ratio, 3))
            )
    return sorted(candidates, key=lambda item: (-item.similarity, item.name_ru))[:8]


async def _host_is_public(host: str) -> bool:
    if host.casefold() in {"localhost"} or host.casefold().endswith((".local", ".internal")):
        return False
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            resolved = await asyncio.get_running_loop().getaddrinfo(
                host, 443, type=socket.SOCK_STREAM
            )
        except OSError:
            return False
        addresses = [ipaddress.ip_address(item[4][0]) for item in resolved]
    return bool(addresses) and all(address.is_global for address in addresses)


def _mime_allowed(field: str, mime: str | None, url: str) -> bool:
    if not mime:
        return False
    if field == "thumbnail_url":
        return mime.startswith("image/")
    if field == "animation_url":
        return mime.startswith("image/") or mime.startswith("video/")
    return mime.startswith("video/") or urlparse(url).hostname in _YOUTUBE_HOSTS


async def check_media(
    request: ExerciseMediaCheckRequest,
    settings: Settings,
    *,
    client: httpx.AsyncClient | None = None,
) -> ExerciseMediaCheckResponse:
    original = request.url.strip()
    absolute = original
    if original.startswith("/"):
        if not settings.mini_app_url:
            return ExerciseMediaCheckResponse(
                field=request.field, url=original, available=False, status="error",
                message="Публичный адрес приложения не настроен.",
            )
        absolute = urljoin(settings.mini_app_url.rstrip("/") + "/", original.lstrip("/"))
    parsed = urlparse(absolute)
    host = (parsed.hostname or "").casefold()
    if parsed.scheme != "https" or not host or not await _host_is_public(host):
        return ExerciseMediaCheckResponse(
            field=request.field, url=original, preview_url=absolute if parsed.scheme == "https" else None,
            available=False, status="error", message="Разрешены только публичные HTTPS-адреса.",
        )
    if request.field == "video_url" and host in _YOUTUBE_HOSTS:
        return ExerciseMediaCheckResponse(
            field=request.field, url=original, preview_url=absolute, available=True,
            mime_type="text/html", status="warning",
            message="YouTube-ссылка доступна для предпросмотра; размер файла не проверяется.",
        )

    owns_client = client is None
    active_client = client or httpx.AsyncClient(timeout=6, follow_redirects=False)
    try:
        response = await active_client.head(absolute)
        if response.status_code in {403, 405}:
            response = await active_client.get(absolute, headers={"Range": "bytes=0-0"})
        mime = response.headers.get("content-type", "").split(";", 1)[0].strip().casefold() or None
        raw_size = response.headers.get("content-length")
        size = int(raw_size) if raw_size and raw_size.isdigit() else None
        if response.is_redirect:
            message = "Ссылка перенаправляет на другой адрес; укажите конечный URL."
        elif response.status_code >= 400:
            message = f"Медиа недоступно (HTTP {response.status_code})."
        elif size is not None and size > _MEDIA_LIMITS[request.field]:
            message = "Файл превышает допустимый размер."
        elif not _mime_allowed(request.field, mime, absolute):
            message = "Тип файла не подходит для выбранного поля."
        else:
            return ExerciseMediaCheckResponse(
                field=request.field, url=original, preview_url=absolute, available=True,
                mime_type=mime, size_bytes=size, status="ok", message="Медиа доступно и прошло проверку.",
            )
        return ExerciseMediaCheckResponse(
            field=request.field, url=original, preview_url=absolute, available=False,
            mime_type=mime, size_bytes=size, status="error", message=message,
        )
    except (httpx.HTTPError, ValueError):
        return ExerciseMediaCheckResponse(
            field=request.field, url=original, preview_url=absolute, available=False,
            status="error", message="Не удалось проверить доступность медиа.",
        )
    finally:
        if owns_client:
            await active_client.aclose()


async def preflight(
    session: AsyncSession,
    body: ExercisePreflightRequest,
    settings: Settings,
) -> ExercisePreflightResponse:
    media_requests = [
        ExerciseMediaCheckRequest(field=field, url=value)
        for field in ("video_url", "animation_url", "thumbnail_url")
        if (value := getattr(body, field))
    ]
    async with httpx.AsyncClient(timeout=6, follow_redirects=False) as client:
        media = list(
            await asyncio.gather(
                *(check_media(item, settings, client=client) for item in media_requests)
            )
        )
    duplicates = await find_duplicates(session, body.name_ru, exclude_id=body.exclude_id)
    errors = [item.message for item in media if item.status == "error"]
    if any(item.similarity == 1 for item in duplicates):
        errors.append("В каталоге уже есть упражнение с таким названием.")
    return ExercisePreflightResponse(
        valid=not errors,
        media=media,
        duplicates=duplicates,
        errors=errors,
    )


async def preview_import(
    session: AsyncSession,
    raw_items: list[dict[str, object]],
) -> ExerciseImportPreviewResponse:
    rows: list[ExerciseImportPreviewRow] = []
    seen: set[str] = set()
    catalog_result = await session.execute(select(Exercise).where(Exercise.is_deleted.is_(False)))
    catalog = list(catalog_result.scalars().all())
    for index, raw in enumerate(raw_items, start=1):
        errors: list[str] = []
        name = str(raw.get("name_ru") or "").strip() or None
        try:
            item = ExerciseCreate.model_validate(raw)
        except ValidationError as exc:
            errors.extend(
                f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
                for issue in exc.errors(include_url=False)[:8]
            )
            item = None
        duplicates: list[ExerciseDuplicateCandidate] = []
        if name:
            normalized = _normalized_name(name)
            if normalized in seen:
                errors.append("Название повторяется внутри файла.")
            seen.add(normalized)
            duplicates = _duplicate_candidates(catalog, name)
            if any(candidate.similarity == 1 for candidate in duplicates):
                errors.append("Такое название уже есть в каталоге.")
        rows.append(
            ExerciseImportPreviewRow(
                row=index,
                name_ru=item.name_ru if item else name,
                valid=not errors,
                errors=errors,
                duplicates=duplicates,
            )
        )
    valid = sum(row.valid for row in rows)
    return ExerciseImportPreviewResponse(
        total=len(rows), valid=valid, invalid=len(rows) - valid, rows=rows
    )
