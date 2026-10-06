"""Diary replies must use current verified data, independent of model history."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
import uuid

import pytest

from app.core.config import Settings
from app.services import ai_engine


SCREENSHOT_PROMPTS = [
    ("Проанализируй мой прогресс за месяц", 30, "За месяц завершены 8 тренировок."),
    ("Разбор недели: объём и восстановление", 7, "За неделю завершены 2 тренировки; сон 7 ч."),
    ("Тренировки", 14, "Последняя завершённая тренировка: 5 октября."),
    (
        "Проанализируй мою предыдущую тренировку",
        14,
        "Предыдущая завершённая тренировка: жим 30 кг × 8.",
    ),
]


def forbid_model_context(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "_call_configured_ai",
        "call_local_chat",
        "build_application_context",
        "conversation_history",
        "retrieve_exercise_context",
        "build_analysis_evidence",
    ):
        monkeypatch.setattr(
            ai_engine,
            name,
            AsyncMock(side_effect=AssertionError(f"Diary routing unexpectedly called {name}")),
        )


@pytest.mark.parametrize(("message", "expected_days", "report"), SCREENSHOT_PROMPTS)
async def test_diary_chat_uses_its_own_report_and_never_model_or_old_history(
    monkeypatch: pytest.MonkeyPatch,
    message: str,
    expected_days: int,
    report: str,
) -> None:
    session = object()
    user = SimpleNamespace(id=uuid.uuid4())
    sid = uuid.uuid4()
    helper = AsyncMock(return_value=report)
    store = AsyncMock()
    monkeypatch.setattr(ai_engine, "build_workout_report", helper, raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", store)
    forbid_model_context(monkeypatch)

    actual_sid, reply, source = await ai_engine.chat(
        session,
        user,
        message=message,
        session_id=sid,
        settings=Settings(),
        include_historical_context=True,
    )

    assert (actual_sid, reply, source) == (sid, report, "data")
    helper.assert_awaited_once_with(session, user, message=message, days=expected_days)
    store.assert_awaited_once_with(
        session,
        user_id=user.id,
        session_id=sid,
        user_content=message,
        assistant_content=report,
    )


@pytest.mark.parametrize("message", [item[0] for item in SCREENSHOT_PROMPTS])
async def test_diary_chat_keeps_plus_gate_before_fetching_any_report(
    monkeypatch: pytest.MonkeyPatch, message: str,
) -> None:
    helper = AsyncMock(side_effect=AssertionError("Non-PLUS user accessed diary report"))
    store = AsyncMock()
    monkeypatch.setattr(ai_engine, "build_workout_report", helper, raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", store)
    forbid_model_context(monkeypatch)

    _, reply, source = await ai_engine.chat(
        object(),
        SimpleNamespace(id=uuid.uuid4()),
        message=message,
        session_id=None,
        settings=Settings(),
        include_historical_context=False,
    )

    assert "PLUS" in reply
    assert source == "rule"
    helper.assert_not_awaited()
    assert store.await_args.kwargs["assistant_content"] == reply


@pytest.mark.parametrize(
    ("message", "days", "expected_days", "expected_question"),
    [
        ("Проанализируй мою предыдущую тренировку", 14, 14,
         "Проанализируй мою предыдущую тренировку"),
        ("Проанализируй мой прогресс за месяц", 14, 30,
         "Проанализируй мой прогресс за месяц"),
        (None, 21, 21, "Проанализируй мой тренировочный прогресс"),
    ],
)
async def test_explicit_analysis_shares_verified_report_and_preserves_requested_period(
    monkeypatch: pytest.MonkeyPatch,
    message: str | None,
    days: int,
    expected_days: int,
    expected_question: str,
) -> None:
    session = object()
    user = SimpleNamespace(id=uuid.uuid4())
    helper = AsyncMock(return_value="Проверенные подходы: 30 кг × 8.")
    monkeypatch.setattr(ai_engine, "build_workout_report", helper, raising=False)
    forbid_model_context(monkeypatch)

    result = await ai_engine.analyze_progress(
        session, user, days=days, settings=Settings(), message=message,
    )

    assert result == ("Проверенные подходы: 30 кг × 8.", "data")
    helper.assert_awaited_once_with(
        session, user, message=expected_question, days=expected_days,
    )


@pytest.mark.parametrize("operation", ["chat", "analyze"])
async def test_urgent_symptoms_never_turn_into_a_diary_report(
    monkeypatch: pytest.MonkeyPatch, operation: str,
) -> None:
    helper = AsyncMock(side_effect=AssertionError("Urgent symptom routed into a diary report"))
    model = AsyncMock(side_effect=AssertionError("Urgent symptom reached model"))
    monkeypatch.setattr(ai_engine, "build_workout_report", helper, raising=False)
    monkeypatch.setattr(ai_engine, "_call_configured_ai", model)
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    monkeypatch.setattr(ai_engine, "retrieve_exercise_context", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_engine, "build_application_context", AsyncMock(return_value=""))
    monkeypatch.setattr(ai_engine, "conversation_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_engine, "build_analysis_evidence", AsyncMock(
        side_effect=AssertionError("Urgent symptom reached historical analysis"),
    ))
    message = "Проанализируй предыдущую тренировку: появилась резкая боль в груди"
    session = object()
    user = SimpleNamespace(id=uuid.uuid4())

    if operation == "chat":
        _, reply, source = await ai_engine.chat(
            session, user, message=message, session_id=None, settings=Settings(),
        )
    else:
        reply, source = await ai_engine.analyze_progress(
            session, user, days=14, settings=Settings(), message=message,
        )

    assert source == "rule"
    assert "Прекратите тренировку" in reply
    assert "медицинской помощью" in reply
    helper.assert_not_awaited()
    model.assert_not_awaited()


async def test_injury_analysis_keeps_health_boundary_without_workout_report(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    helper = AsyncMock(side_effect=AssertionError("Injury question reached diary report"))
    monkeypatch.setattr(ai_engine, "build_workout_report", helper, raising=False)
    forbid_model_context(monkeypatch)

    reply, source = await ai_engine.analyze_progress(
        object(),
        SimpleNamespace(id=uuid.uuid4()),
        days=14,
        settings=Settings(),
        message="Можно тренироваться после травмы колена?",
    )

    assert source == "rule"
    assert "врач" in reply
    assert "травм" in reply
    helper.assert_not_awaited()
