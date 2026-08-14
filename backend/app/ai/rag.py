"""Lightweight deterministic retrieval over the local exercise catalog."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise

_STOP_WORDS = {
    "без", "больше", "будет", "были", "ваш", "вместо", "вопрос", "выполнял",
    "делать", "замена", "заменить", "как", "какие", "какой", "можно", "мой",
    "моя", "мои", "пожалуйста", "предложи", "сейчас", "сегодня", "скажи",
    "тренировка", "тренировки", "упражнение", "упражнения", "хочу", "что", "это",
}
_ENDINGS = (
    "иями", "ями", "ами", "ого", "ему", "ому", "ыми", "ими", "иях", "ах", "ях",
    "ой", "ей", "ий", "ый", "ая", "ое", "ые", "ам", "ям", "ом", "ем", "ов",
    "ев", "а", "я", "ы", "и", "е", "у", "ю",
)


def _normalize(value: str | None) -> str:
    return re.sub(r"[^a-zа-я0-9]+", " ", (value or "").lower().replace("ё", "е")).strip()


def _stem(token: str) -> str:
    for ending in _ENDINGS:
        if token.endswith(ending) and len(token) - len(ending) >= 3:
            return token[: -len(ending)]
    return token


def exercise_query_terms(query: str) -> set[str]:
    return {
        _stem(token)
        for token in _normalize(query).split()
        if len(token) >= 3 and token not in _STOP_WORDS
    }


def _exercise_score(exercise: Exercise, terms: set[str]) -> int:
    if not terms:
        return 0
    name = _normalize(exercise.name_ru)
    muscle = _normalize(exercise.muscle_group)
    details = _normalize(
        " ".join(
            filter(
                None,
                (exercise.description, exercise.technique, exercise.common_mistakes),
            )
        )
    )
    score = 0
    for term in terms:
        if term in name:
            score += 8
        elif term in muscle:
            score += 4
        elif term in details:
            score += 1
    return score


async def retrieve_exercise_context(
    session: AsyncSession,
    query: str,
    *,
    limit: int = 3,
) -> list[dict]:
    """Return top exercise snippets for LLM / rule context."""
    terms = exercise_query_terms(query)
    if not terms:
        return []
    catalog = list(
        (
            await session.scalars(
                select(Exercise)
                .where(Exercise.is_deleted.is_(False))
                .order_by(Exercise.name_ru.asc())
            )
        ).all()
    )
    ranked = sorted(
        ((exercise, _exercise_score(exercise, terms)) for exercise in catalog),
        key=lambda item: (-item[1], item[0].name_ru),
    )
    rows = [exercise for exercise, score in ranked if score > 0][:limit]

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
