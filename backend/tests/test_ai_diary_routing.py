"""Diary routing separates verified facts from genuine, bounded AI interpretation."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import uuid

import pytest
from app.core.config import Settings
from app.services import ai_engine

SCREENSHOT_PROMPTS = [
    ("Проанализируй мой прогресс за месяц", 30, "За месяц завершены восемь тренировок."),
    ("Разбор недели: объём и восстановление", 7, "За неделю завершены две тренировки."),
    ("Тренировки", 14, "В дневнике есть завершённые тренировки."),
    ("Проанализируй мою предыдущую тренировку", 14, "Последняя тренировка завершена."),
]


def forbidden_context(monkeypatch):
    for name in ("_call_configured_ai", "call_local_chat", "build_application_context",
                 "conversation_history", "retrieve_exercise_context", "build_analysis_evidence"):
        monkeypatch.setattr(ai_engine, name, AsyncMock(
            side_effect=AssertionError(f"Diary routing called irrelevant {name}"),
        ))


def mocked_evidence(monkeypatch, report="Проверенные подходы: 30 кг × 8.", has_data=True):
    evidence = SimpleNamespace(report=report, facts={"workout": report}, has_data=has_data)
    builder = AsyncMock(return_value=evidence)
    monkeypatch.setattr(ai_engine, "build_workout_evidence", builder, raising=False)
    return evidence, builder


@pytest.mark.parametrize(("message", "expected_days", "conclusion"), SCREENSHOT_PROMPTS)
async def test_diary_chat_interprets_current_evidence_without_old_history(
    monkeypatch, message, expected_days, conclusion,
):
    session, user, sid = object(), SimpleNamespace(id=uuid.uuid4()), uuid.uuid4()
    evidence, builder = mocked_evidence(monkeypatch)
    interpretation = f"Вывод: {conclusion}\nСледующий шаг: Оцените восстановление."
    model, store = AsyncMock(return_value=interpretation), AsyncMock()
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", model, raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", store)
    forbidden_context(monkeypatch)
    settings = Settings()

    actual_sid, reply, source = await ai_engine.chat(
        session, user, message=message, session_id=sid, settings=settings,
        include_historical_context=True,
    )

    assert actual_sid == sid and source == "local"
    assert reply.startswith(interpretation)
    assert evidence.report in reply
    builder.assert_awaited_once_with(session, user, message=message, days=expected_days)
    model.assert_awaited_once_with(settings, question=message, evidence=evidence)
    store.assert_awaited_once_with(
        session, user_id=user.id, session_id=sid, user_content=message, assistant_content=reply,
    )


@pytest.mark.parametrize("message", [item[0] for item in SCREENSHOT_PROMPTS])
async def test_diary_chat_keeps_plus_gate_before_evidence_and_model(monkeypatch, message):
    _, builder = mocked_evidence(monkeypatch)
    model, store = AsyncMock(), AsyncMock()
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", model, raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", store)
    forbidden_context(monkeypatch)

    _, reply, source = await ai_engine.chat(
        object(), SimpleNamespace(id=uuid.uuid4()), message=message, session_id=None,
        settings=Settings(), include_historical_context=False,
    )

    assert "PLUS" in reply and source == "rule"
    builder.assert_not_awaited()
    model.assert_not_awaited()
    assert store.await_args.kwargs["assistant_content"] == reply


@pytest.mark.parametrize("operation", ["chat", "analyze"])
async def test_failed_interpretation_is_explicit_and_preserves_verified_facts(monkeypatch, operation):
    evidence, _ = mocked_evidence(monkeypatch)
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", AsyncMock(return_value=None),
                        raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    forbidden_context(monkeypatch)
    kwargs = dict(message="Проанализируй мой прогресс за месяц", settings=Settings())
    session, user = object(), SimpleNamespace(id=uuid.uuid4())
    if operation == "chat":
        _, reply, source = await ai_engine.chat(session, user, session_id=None, **kwargs)
    else:
        reply, source = await ai_engine.analyze_progress(session, user, days=14, **kwargs)

    assert source == "data"
    assert "ИИ-разбор" in reply and "не удалось" in reply
    assert evidence.report in reply


@pytest.mark.parametrize("invalid_reply", [
    "Here is your detailed workout interpretation and recommendation.",
    "<think>Hidden reasoning only</think>",
    "训练数据说明训练负荷发生变化。",
])
async def test_language_drift_or_hidden_reasoning_never_gets_local_ai_source(
    monkeypatch, invalid_reply,
):
    evidence, _ = mocked_evidence(monkeypatch)
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence",
                        AsyncMock(return_value=invalid_reply), raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    forbidden_context(monkeypatch)

    _, reply, source = await ai_engine.chat(
        object(), SimpleNamespace(id=uuid.uuid4()),
        message="Проанализируй мой прогресс за месяц", session_id=None, settings=Settings(),
    )

    assert source == "data" and "ИИ-разбор" in reply and "не удалось" in reply
    assert evidence.report in reply
    assert invalid_reply not in reply


@pytest.mark.parametrize("operation", ["chat", "analyze"])
async def test_absent_diary_facts_do_not_call_model(monkeypatch, operation):
    evidence, _ = mocked_evidence(monkeypatch, report="Нет завершённых тренировок.", has_data=False)
    model = AsyncMock(side_effect=AssertionError("No-data evidence reached model"))
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", model, raising=False)
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    forbidden_context(monkeypatch)
    session, user = object(), SimpleNamespace(id=uuid.uuid4())
    kwargs = dict(message="Проанализируй мой прогресс за месяц", settings=Settings())
    if operation == "chat":
        _, reply, source = await ai_engine.chat(session, user, session_id=None, **kwargs)
    else:
        reply, source = await ai_engine.analyze_progress(session, user, days=14, **kwargs)

    assert reply == evidence.report and source == "data"
    model.assert_not_awaited()
    assert "не удалось" not in reply


@pytest.mark.parametrize(("message", "days", "expected_days", "question"), [
    ("Проанализируй мою предыдущую тренировку", 14, 14,
     "Проанализируй мою предыдущую тренировку"),
    ("Проанализируй мой прогресс за месяц", 14, 30, "Проанализируй мой прогресс за месяц"),
    (None, 21, 21, "Проанализируй мой тренировочный прогресс"),
])
async def test_explicit_analysis_uses_same_evidence_and_interpretation(
    monkeypatch, message, days, expected_days, question,
):
    session, user = object(), SimpleNamespace(id=uuid.uuid4())
    evidence, builder = mocked_evidence(monkeypatch)
    interpretation = "Вывод: Нагрузка записана.\nСледующий шаг: Продолжайте вести дневник."
    model = AsyncMock(return_value=interpretation)
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", model, raising=False)
    forbidden_context(monkeypatch)
    settings = Settings()

    reply, source = await ai_engine.analyze_progress(
        session, user, days=days, settings=settings, message=message,
    )

    assert source == "local" and reply.startswith(interpretation)
    builder.assert_awaited_once_with(session, user, message=question, days=expected_days)
    model.assert_awaited_once_with(settings, question=question, evidence=evidence)


@pytest.mark.parametrize("operation", ["chat", "analyze"])
async def test_urgent_symptoms_never_turn_into_diary_interpretation(monkeypatch, operation):
    _, builder = mocked_evidence(monkeypatch)
    model = AsyncMock(side_effect=AssertionError("Urgent symptom reached model"))
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", model, raising=False)
    monkeypatch.setattr(ai_engine, "_call_configured_ai", model)
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    monkeypatch.setattr(ai_engine, "retrieve_exercise_context", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_engine, "build_application_context", AsyncMock(return_value=""))
    monkeypatch.setattr(ai_engine, "conversation_history", AsyncMock(return_value=[]))
    message = "Проанализируй предыдущую тренировку: появилась резкая боль в груди"
    session, user = object(), SimpleNamespace(id=uuid.uuid4())
    if operation == "chat":
        _, reply, source = await ai_engine.chat(
            session, user, message=message, session_id=None, settings=Settings(),
        )
    else:
        reply, source = await ai_engine.analyze_progress(
            session, user, days=14, settings=Settings(), message=message,
        )

    assert source == "rule" and "Прекратите тренировку" in reply
    assert "медицинской помощью" in reply
    builder.assert_not_awaited()
    model.assert_not_awaited()


async def test_injury_analysis_keeps_health_boundary_without_model(monkeypatch):
    _, builder = mocked_evidence(monkeypatch)
    model = AsyncMock()
    monkeypatch.setattr(ai_engine, "interpret_workout_evidence", model, raising=False)
    forbidden_context(monkeypatch)
    reply, source = await ai_engine.analyze_progress(
        object(), SimpleNamespace(id=uuid.uuid4()), days=14, settings=Settings(),
        message="Можно тренироваться после травмы колена?",
    )
    assert source == "rule" and "врач" in reply and "травм" in reply
    builder.assert_not_awaited()
    model.assert_not_awaited()
