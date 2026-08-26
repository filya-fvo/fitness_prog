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
        llm_model="qwen2.5-1.5b-instruct",
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
        "model": "qwen2.5-1.5b-instruct",
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


def test_english_only_model_reply_is_rejected() -> None:
    assert ai_engine._russian_only("Here is your detailed workout recommendation") is None
    assert ai_engine._russian_only("Увеличьте вес на 2.5 kg, если техника стабильна") is not None


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
