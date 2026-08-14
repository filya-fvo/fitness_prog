"""Exercise retrieval should rank query matches and never invent a generic sample."""

from __future__ import annotations

from app.ai.rag import _exercise_score, exercise_query_terms
from app.models.exercise import Exercise


def exercise(name: str, muscle: str, description: str = "") -> Exercise:
    return Exercise(
        name_ru=name,
        muscle_group=muscle,
        description=description,
        difficulty=2,
        equipment="тренажёр",
        tags=[],
    )


def test_russian_query_terms_handle_inflection_and_yo() -> None:
    terms = exercise_query_terms("Скажи, на что можно заменить жим лёжа?")

    assert "жим" in terms
    assert "леж" in terms
    assert "заменить" not in terms


def test_bench_query_ranks_bench_above_unrelated_squat() -> None:
    terms = exercise_query_terms("Чем заменить жим лежа")
    bench = exercise("Жим штанги лёжа", "грудь")
    squat = exercise("Приседания со своим весом", "ноги")

    assert _exercise_score(bench, terms) > 0
    assert _exercise_score(squat, terms) == 0


def test_general_workout_question_has_no_random_exercise_match() -> None:
    terms = exercise_query_terms("Как ты считаешь качество моей сегодняшней тренировки?")
    squat = exercise("Приседания со своим весом", "ноги")

    assert _exercise_score(squat, terms) == 0
