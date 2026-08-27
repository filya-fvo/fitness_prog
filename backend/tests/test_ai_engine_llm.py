"""Local AI request profile and output safety tests."""

from __future__ import annotations

import pytest
from types import SimpleNamespace
import uuid

from app.core.config import Settings
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

    def __init__(self, **_kwargs: object) -> None:
        pass

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
    monkeypatch.setattr(local_llm.httpx, "AsyncClient", FakeAsyncClient)


def local_settings() -> Settings:
    return Settings(
        llm_provider="local",
        llm_api_key="internal-test-key",
        llm_base_url="http://llm:8080/v1",
        llm_model="qwen2.5-3b-instruct",
    )


async def test_chat_route_has_no_daily_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_chat(*_args: object, **_kwargs: object) -> tuple[uuid.UUID, str, str]:
        return uuid.uuid4(), "Ответ", "local"

    monkeypatch.setattr(ai_engine, "chat", fake_chat)
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
        "model": "qwen2.5-3b-instruct",
        "messages": [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "question"},
        ],
        "temperature": 0.2,
        "max_tokens": 320,
    }


async def test_external_ai_host_is_rejected_without_http_request() -> None:
    configured = local_settings().model_copy(
        update={"llm_base_url": "https://api.groq.com/openai/v1"}
    )

    result = await local_llm.call_local_chat(configured, "system", "question")

    assert result is None
    assert FakeAsyncClient.requests == []


async def test_configured_ai_reports_local_source() -> None:
    reply, source = await ai_engine._call_configured_ai(local_settings(), "system", "question")

    assert reply == "Короткий локальный ответ"
    assert source == "local"


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
    assert prompt.endswith("Не пересказывай контекст.")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("<think>secret reasoning</think>Итог на русском.", "Итог на русском."),
        ("Полезный итог.\n<think>unfinished secret", "Полезный итог."),
        ("<think>unfinished secret", None),
        ("Here's a thinking process: analyze user input", None),
        ("```markdown\nКороткий итог.\n```", "Короткий итог."),
    ],
)
def test_ai_output_sanitizer_never_exposes_reasoning(raw: str, expected: str | None) -> None:
    assert ai_engine.sanitize_ai_output(raw) == expected
