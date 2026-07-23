"""Lightweight RAG over exercises (pgvector optional; ILIKE fallback)."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise


async def retrieve_exercise_context(
    session: AsyncSession,
    query: str,
    *,
    limit: int = 3,
) -> list[dict]:
    """Return top exercise snippets for LLM / rule context."""
    term = (query or "").strip()
    stmt = select(Exercise).where(Exercise.is_deleted.is_(False))
    if term:
        like = f"%{term}%"
        # Prefer keyword hits; without embeddings this is the MVP path
        stmt = stmt.where(
            or_(
                Exercise.name_ru.ilike(like),
                Exercise.muscle_group.ilike(like),
                Exercise.description.ilike(like),
                Exercise.technique.ilike(like),
                Exercise.common_mistakes.ilike(like),
            )
        )
    stmt = stmt.order_by(Exercise.name_ru.asc()).limit(limit)
    rows = list((await session.scalars(stmt)).all())

    # If nothing matched keywords, return a small general sample
    if not rows:
        rows = list(
            (
                await session.scalars(
                    select(Exercise)
                    .where(Exercise.is_deleted.is_(False))
                    .order_by(Exercise.difficulty.asc())
                    .limit(limit)
                )
            ).all()
        )

    return [
        {
            "id": str(ex.id),
            "name_ru": ex.name_ru,
            "muscle_group": ex.muscle_group,
            "technique": ex.technique,
            "common_mistakes": ex.common_mistakes,
            "difficulty": ex.difficulty,
        }
        for ex in rows
    ]


def format_rag_block(items: list[dict]) -> str:
    if not items:
        return "Контекст упражнений пуст."
    lines: list[str] = []
    for i, item in enumerate(items, start=1):
        lines.append(
            f"{i}. {item['name_ru']} ({item.get('muscle_group') or '—'}), "
            f"сложность {item.get('difficulty')}. "
            f"Техника: {item.get('technique') or '—'}. "
            f"Ошибки: {item.get('common_mistakes') or '—'}."
        )
    return "\n".join(lines)
