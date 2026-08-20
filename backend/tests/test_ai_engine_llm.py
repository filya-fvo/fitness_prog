"""Groq request profile, model fallback, and output safety tests."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.services import ai_engine


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class FakeAsyncClient:
    requests: list[dict] = []
    rate_limited_models: set[str] = set()

    def __init__(self, **_kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict,
        json: dict,
    ) -> FakeResponse | httpx.Response:
        self.requests.append({"url": url, "headers": headers, "json": json})
        if url.endswith("/chat/completions"):
            if json["model"] in self.rate_limited_models:
                return httpx.Response(
                    429,
                    headers={"retry-after": "120"},
                    json={"error": {"code": "rate_limit_exceeded"}},
                    request=httpx.Request("POST", url),
                )
            return FakeResponse({"choices": [{"message": {"content": " Ответ Groq "}}]})
        raise AssertionError(f"Unexpected external endpoint: {url}")


@pytest.fixture(autouse=True)
def reset_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests.clear()
    FakeAsyncClient.rate_limited_models.clear()
    ai_engine._groq_model_cooldowns.clear()
    monkeypatch.setattr(ai_engine.httpx, "AsyncClient", FakeAsyncClient)


def groq_settings() -> Settings:
    return Settings(
        llm_api_key="groq-test-key",
        llm_base_url="https://api.groq.com/openai/v1",
        llm_model="qwen/qwen3.6-27b",
    )


async def test_groq_uses_chat_completions_without_reasoning_for_chat() -> None:
    result = await ai_engine._call_groq_chat(
        groq_settings(),
        "system",
        "question",
    )

    assert result == "Ответ Groq"
    request = FakeAsyncClient.requests[0]
    assert request["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert request["json"] == {
        "model": "qwen/qwen3.6-27b",
        "messages": [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "question"},
        ],
        "temperature": 0.3,
        "max_completion_tokens": 600,
        "reasoning_effort": "none",
        "reasoning_format": "hidden",
    }
    assert request["headers"]["Authorization"] == "Bearer groq-test-key"


async def test_configured_groq_analysis_disables_hidden_reasoning() -> None:
    reply, source = await ai_engine._call_configured_ai(
        groq_settings(),
        "system",
        "analyze",
    )

    assert reply == "Ответ Groq"
    assert source == "groq"
    assert FakeAsyncClient.requests[0]["json"]["reasoning_effort"] == "none"
    assert FakeAsyncClient.requests[0]["json"]["reasoning_format"] == "hidden"


async def test_groq_rotates_to_next_model_after_rate_limit() -> None:
    FakeAsyncClient.rate_limited_models.add("qwen/qwen3.6-27b")
    configured = groq_settings().model_copy(
        update={"llm_fallback_models": "llama-3.1-8b-instant"}
    )

    result = await ai_engine._call_groq_chat(configured, "system", "question")

    assert result == "Ответ Groq"
    assert [request["json"]["model"] for request in FakeAsyncClient.requests] == [
        "qwen/qwen3.6-27b",
        "llama-3.1-8b-instant",
    ]
    assert ai_engine._groq_model_cooldowns["qwen/qwen3.6-27b"] > 0
    assert "reasoning_effort" not in FakeAsyncClient.requests[1]["json"]


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
