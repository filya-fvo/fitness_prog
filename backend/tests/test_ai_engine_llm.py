"""Local AI request profile and output safety tests."""

from __future__ import annotations

import pytest
from types import SimpleNamespace
import uuid

from app.core.config import Settings
from app.routers import ai as ai_router
from app.routers.ai import ai_chat
from app.schemas.ai import AIChatRequest
from app.services import ai_engine, local_llm


class FakeResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"choices": [{"message": {"content": " Короткий локальный ответ "}}]}


class FakeAsyncClient:
    requests: list[dict] = []
    init_kwargs: list[dict] = []

    def __init__(self, **kwargs: object) -> None:
        self.init_kwargs.append(kwargs)

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, url: str, *, headers: dict, json: dict) -> FakeResponse:
        self.requests.append({"url": url, "headers": headers, "json": json})
        return FakeResponse()


@pytest.fixture(autouse=True)
def reset_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests.clear()
    FakeAsyncClient.init_kwargs.clear()
    monkeypatch.setattr(local_llm.httpx, "AsyncClient", FakeAsyncClient)


def local_settings() -> Settings:
    return Settings(
        llm_provider="local",
        llm_api_key="internal-test-key",
        llm_base_url="http://llm:8080/v1",
        llm_model="qwen3-1.7b",
    )


async def test_chat_route_has_no_daily_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_chat(*_args: object, **_kwargs: object) -> tuple[uuid.UUID, str, str]:
        return uuid.uuid4(), "Ответ", "local"

    async def fake_has_plus(*_args: object, **_kwargs: object) -> bool:
        return True

    monkeypatch.setattr(ai_engine, "chat", fake_chat)
    monkeypatch.setattr(ai_router, "user_has_plus", fake_has_plus)
    response = await ai_chat(
        AIChatRequest(message="Как тренироваться?"),
        session=object(),  # type: ignore[arg-type]
        user=SimpleNamespace(id=uuid.uuid4()),  # type: ignore[arg-type]
        settings=local_settings(),
    )

    assert response.reply == "Ответ"
    assert response.remaining_requests is None


async def test_local_ai_uses_internal_chat_completions() -> None:
    result = await local_llm.call_local_chat(local_settings(), "system", "question")

    assert result == "Короткий локальный ответ"
    request = FakeAsyncClient.requests[0]
    assert request["url"] == "http://llm:8080/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer internal-test-key"
    assert request["json"] == {
        "model": "qwen3-1.7b",
        "messages": [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "question"},
        ],
        "temperature": 0.2,
        "max_tokens": 256,
        "chat_template_kwargs": {"enable_thinking": False},
    }


async def test_structured_output_uses_llama_cpp_flat_schema_http_contract() -> None:
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["fact_id", "text"],
        "properties": {
            "fact_id": {"type": "string", "enum": ["F1", "F2"]},
            "text": {"type": "string", "maxLength": 140},
        },
    }

    result = await local_llm.call_local_chat(
        local_settings(), "Верни JSON по проверенным фактам.", "ФАКТЫ: F1, F2",
        json_schema=schema,
    )

    assert result == "Короткий локальный ответ"
    assert len(FakeAsyncClient.requests) == 1
    request = FakeAsyncClient.requests[0]
    assert request["url"] == "http://llm:8080/v1/chat/completions"
    # The pinned llama.cpp parser accepts flat schema with json_object.
    # A flat schema with type=json_schema is ignored in build b10630.
    assert request["json"]["response_format"] == {"type": "json_object", "schema": schema}


async def test_external_ai_host_is_rejected_without_http_request() -> None:
    configured = local_settings().model_copy(
        update={"llm_base_url": "https://api.groq.com/openai/v1"}
    )

    result = await local_llm.call_local_chat(configured, "system", "question")

    assert result is None
    assert FakeAsyncClient.requests == []


async def test_busy_local_model_falls_back_without_waiting_for_full_model_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    busy_lock = local_llm.asyncio.Lock()
    await busy_lock.acquire()
    monkeypatch.setattr(local_llm, "_request_lock", busy_lock)

    try:
        result = await local_llm.call_local_chat(
            local_settings(),
            "system",
            "question",
            timeout_seconds=1,
            queue_timeout_seconds=0.01,
        )
    finally:
        busy_lock.release()

    assert result is None
    assert FakeAsyncClient.requests == []


async def test_configured_ai_reports_local_source() -> None:
    reply, source = await ai_engine._call_configured_ai(local_settings(), "system", "question")

    assert reply == "Короткий локальный ответ"
    assert source == "local"
    request = FakeAsyncClient.requests[0]
    assert request["json"]["max_tokens"] == 256
    assert float(FakeAsyncClient.init_kwargs[0]["timeout"]) <= 60


def test_urgent_health_question_never_reaches_model() -> None:
    assert ai_engine._requires_rule_only("После подхода резкая боль в груди") is True
    reply = ai_engine._rule_based_reply("После подхода резкая боль в груди", "")
    assert "Прекратите тренировку" in reply
    assert "медицинской помощью" in reply


def test_non_urgent_pain_question_uses_safe_rule_reply() -> None:
    message = "Что лучше делать, если начинает болеть плечо?"

    assert ai_engine._requires_rule_only(message) is True
    reply = ai_engine._rule_based_reply(message, "")

    assert "Остановите" in reply
    assert "через неё" in reply
    assert "обратитесь к врачу" in reply


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Сколько отдыхать между тяжёлыми подходами?", "2–4 минуты"),
        ("Что есть после тренировки?", "белка и углеводов"),
    ],
)
def test_basic_safety_facts_use_deterministic_reply(message: str, expected: str) -> None:
    assert ai_engine._requires_rule_only(message) is True
    assert expected in ai_engine._rule_based_reply(message, "")


def test_cycle_training_question_uses_symptom_led_rule() -> None:
    message = "Как менять тренировки по фазам менструального цикла?"

    assert ai_engine._requires_rule_only(message) is True
    reply = ai_engine._rule_based_reply(message, "")

    assert "фиксированными 28 днями" in reply
    assert "фактическое самочувствие" in reply


def test_english_only_model_reply_is_rejected() -> None:
    assert ai_engine._russian_only("Here is your detailed workout recommendation") is None
    assert ai_engine._russian_only("Увеличьте вес на 2.5 kg, если техника стабильна") is not None


@pytest.mark.parametrize(
    "reply",
    [
        "Не забывайте оhydration и выпейте适量 воды.",
        "Добавьте немного protein после тренировки.",
    ],
)
def test_mixed_foreign_model_reply_is_rejected(reply: str) -> None:
    assert ai_engine._russian_only(reply) is None


def test_context_echo_is_detected_by_long_prefix() -> None:
    context = (
        "Пользователь выполнил тренировку полностью, используя 6 упражнений и 23 подхода. "
        "Объём составил 14976 кг."
    )
    reply = (
        "Пользователь выполнил тренировку полностью, используя 6 упражнений и 23 подхода. "
        "Продолжайте в том же духе."
    )

    assert ai_engine._looks_like_context_echo(reply, context) is True
    assert ai_engine._looks_like_context_echo("Отдыхайте между подходами 2–3 минуты.", context) is False


def test_chat_prompt_keeps_latest_question_last_and_drops_echo_history() -> None:
    context = (
        "Пользователь выполнил тренировку полностью, используя 6 упражнений и 23 подхода."
    )
    question = "Сколько отдыхать между тяжёлыми подходами?"
    prompt = ai_engine._build_chat_prompt(
        message=question,
        app_context=context,
        catalog_context="Совпадений нет.",
        history=[
            {"role": "user", "content": "Прокомментируй тренировку"},
            {"role": "assistant", "content": context},
        ],
    )

    assert prompt.count(context) == 1
    assert prompt.rfind(question) > prompt.rfind("</conversation_history>")
    assert prompt.endswith(question)


def test_chat_prompt_bounds_large_runtime_context() -> None:
    prompt = ai_engine._build_chat_prompt(
        message="вопрос " * 1_000,
        app_context="контекст " * 1_000,
        catalog_context="каталог " * 1_000,
        history=[{"role": "user", "content": "история " * 1_000}],
    )

    assert len(prompt) < 6_000
    assert "…" in prompt


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("<think>secret reasoning</think>Итог на русском.", "Итог на русском."),
        ("Полезный итог.\n<think>unfinished secret", "Полезный итог."),
        ("<think>unfinished secret", None),
        ("Here's a thinking process: analyze user input", None),
        ("Начни с полезного ответа на этот вопрос. Не пересказывай контекст.", None),
        ("```markdown\nКороткий итог.\n```", "Короткий итог."),
    ],
)
def test_ai_output_sanitizer_never_exposes_reasoning(raw: str, expected: str | None) -> None:
    assert ai_engine.sanitize_ai_output(raw) == expected


def four_b_settings() -> Settings:
    return local_settings().model_copy(update={"llm_model": "qwen3-4b-instruct-2507"})


async def runtime_chat_request(monkeypatch, *, settings, app_context, message, history=None):
    from unittest.mock import AsyncMock

    monkeypatch.setattr(ai_engine, "retrieve_exercise_context", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_engine, "build_application_context", AsyncMock(return_value=app_context))
    monkeypatch.setattr(ai_engine, "conversation_history", AsyncMock(return_value=history or []))
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    _, reply, source = await ai_engine.chat(
        object(), SimpleNamespace(id=uuid.uuid4()), message=message, session_id=None,
        settings=settings,
    )
    assert reply == "Короткий локальный ответ" and source == "local"
    return FakeAsyncClient.requests[-1]["json"]


async def test_four_b_chat_has_smaller_input_and_preserves_whole_profile_before_history(monkeypatch):
    profile = "Профиль: цель=поддержание формы, оборудование=гантели, ограничения=исключить прыжки."
    message = "Как выбрать подходящее упражнение с учётом доступного оборудования?"
    request = await runtime_chat_request(
        monkeypatch, settings=four_b_settings(), message=message,
        app_context="Данные приложения:\n" + profile + "\nПлан следующего дня: " + "упражнение " * 1000,
        history=[{"role": "user", "content": "старый разговор " * 1000}],
    )
    instructions, prompt = [item["content"] for item in request["messages"]]
    assert len(instructions) <= 550
    assert len(prompt) <= 2300
    assert profile in prompt and message in prompt
    assert prompt.index(profile) < prompt.index("<conversation_history>")
    assert prompt.endswith(message)
    assert request["max_tokens"] == 192
    assert float(FakeAsyncClient.init_kwargs[-1]["timeout"]) <= 75


async def test_four_b_chat_preserves_complete_limitations_in_an_overlong_profile(monkeypatch):
    restriction = "ограничения=исключить прыжки и глубокое сгибание колена."
    profile = "Профиль: цель=поддержание формы, оборудование=" + "гантели " * 200 + ", " + restriction
    request = await runtime_chat_request(
        monkeypatch, settings=four_b_settings(), message="Как выбрать упражнение?",
        app_context=profile + "\nДальнейшая история: " + "занятие " * 1000,
    )
    prompt = request["messages"][1]["content"]
    context = prompt.split("<application_context>\n", 1)[1].split("\n</application_context>", 1)[0]
    assert len(context) <= 600
    assert restriction in context


async def test_four_b_cycle_question_keeps_symptom_based_guidance(monkeypatch):
    request = await runtime_chat_request(
        monkeypatch, settings=four_b_settings(),
        message="Как тренироваться во второй половине цикла?",
        app_context="Профиль: ограничения=не указаны.",
    )
    instructions = request["messages"][0]["content"]
    assert "симптом" in instructions and "не предполагаемую фазу" in instructions


async def test_four_b_compact_chat_keeps_current_question_when_old_history_is_large(monkeypatch):
    question = "Почему новый выбор упражнения нужно согласовать с доступным оборудованием?"
    request = await runtime_chat_request(
        monkeypatch, settings=four_b_settings(), message=question,
        app_context="Профиль: ограничения=исключить прыжки.\n" + "план " * 1000,
        history=[{"role": "assistant", "content": "Прошлый совет " * 1000}] * 6,
    )
    prompt = request["messages"][1]["content"]
    assert prompt.endswith(question)
    history = prompt.split("<conversation_history>\n", 1)[1].split("\n</conversation_history>", 1)[0]
    assert len(history) <= 250


async def test_four_b_runtime_latency_budget_is_seventy_five_seconds(monkeypatch):
    from unittest.mock import AsyncMock

    call = AsyncMock(return_value="Короткий локальный ответ")
    monkeypatch.setattr(ai_engine, "call_local_chat", call)
    reply, source = await ai_engine._call_configured_ai(four_b_settings(), "system", "question")
    assert reply == "Короткий локальный ответ" and source == "local"
    assert call.await_args.kwargs["max_tokens"] == 192
    assert call.await_args.kwargs["timeout_seconds"] == 75
    assert call.await_args.kwargs["queue_timeout_seconds"] == 5


async def test_other_model_keeps_existing_chat_and_latency_profile(monkeypatch):
    from unittest.mock import AsyncMock

    call = AsyncMock(return_value="Короткий локальный ответ")
    monkeypatch.setattr(ai_engine, "call_local_chat", call)
    reply, source = await ai_engine._call_configured_ai(local_settings(), "system", "question")
    assert reply == "Короткий локальный ответ" and source == "local"
    assert call.await_args.kwargs["max_tokens"] == 256
    assert call.await_args.kwargs["timeout_seconds"] == 60
    assert call.await_args.kwargs["queue_timeout_seconds"] == 5


async def test_four_b_nonworkout_analysis_bounds_profile_question_and_evidence(monkeypatch):
    from unittest.mock import AsyncMock

    question = "Проанализируй мой вес за месяц. " + "Изменения и причины мне важны. " * 100
    profile = "Профиль: цель=поддержание веса, ограничения=исключить прыжки."
    evidence_text = "Замеры веса за период:\n" + "Вес записан, причина изменения не установлена. " * 100
    monkeypatch.setattr(ai_engine, "build_analysis_evidence", AsyncMock(return_value=SimpleNamespace(
        text=evidence_text, has_data=True)))
    monkeypatch.setattr(ai_engine, "build_application_context", AsyncMock(return_value=(
        profile + "\n" + "План программы и история " * 1000)))
    reply, source = await ai_engine.analyze_progress(
        object(), SimpleNamespace(id=uuid.uuid4()), days=30, settings=four_b_settings(), message=question,
    )
    assert reply == "Короткий локальный ответ" and source == "local"
    request = FakeAsyncClient.requests[-1]["json"]
    instructions, prompt = [item["content"] for item in request["messages"]]
    assert len(instructions) <= 550
    assert len(prompt) <= 2100
    assert profile in prompt
    assert "Проанализируй мой вес за месяц." in prompt
    assert "Замеры веса за период:" in prompt
    assert request["max_tokens"] == 192


@pytest.mark.parametrize("message", [
    "Как выбрать рабочий вес для упражнения?",
    "Как подобрать вес для жима гантелей?",
    "How do I choose a working weight?",
])
async def test_working_weight_choice_is_explicit_rule_without_model_call(monkeypatch, message):
    from unittest.mock import AsyncMock

    model = AsyncMock(return_value="Модель не должна выбирать нагрузку в этом сценарии.")
    monkeypatch.setattr(ai_engine, "call_local_chat", model)
    monkeypatch.setattr(ai_engine, "retrieve_exercise_context", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_engine, "build_application_context", AsyncMock(return_value="Профиль: ограничения=нет."))
    monkeypatch.setattr(ai_engine, "conversation_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(ai_engine, "store_exchange", AsyncMock())
    _, reply, source = await ai_engine.chat(
        object(), SimpleNamespace(id=uuid.uuid4()), message=message, session_id=None,
        settings=four_b_settings(), include_historical_context=False,
    )
    assert source == "rule"
    assert "запланированное число повторов" in reply
    assert "2–3 повтора в запасе" in reply
    assert "уменьшите вес" in reply
    assert "Какое упражнение и число повторов?" in reply
    assert reply.count("?") == 1
    assert "%" not in reply and "кг" not in reply.casefold() and "шраг" not in reply.casefold()
    model.assert_not_awaited()


@pytest.mark.parametrize("message", [
    "Проанализируй изменение рабочего веса за месяц",
    "Как изменился рабочий вес за месяц?",
    "Как выбрать рабочий вес по сравнению с предыдущей тренировкой?",
    "Как подобрать вес для упражнения по истории за месяц?",
    "How did my working weight change last month?",
    "How do I choose a working weight based on my previous workout?",
])
def test_working_weight_history_is_not_stolen_by_basic_selection_rule(message):
    assert ai_engine._requires_rule_only(message) is False


def test_working_weight_rule_never_overrides_pain_priority():
    message = "Как выбрать рабочий вес, если болит плечо?"
    assert ai_engine._requires_rule_only(message)
    reply = ai_engine._rule_based_reply(message, "")
    assert "Остановите" in reply and "через неё" in reply
    assert "Какое упражнение и число повторов?" not in reply
