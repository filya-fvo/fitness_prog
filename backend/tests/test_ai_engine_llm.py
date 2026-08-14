"""AI provider request profiles, fallback, and OpenAI Conversation creation."""

from __future__ import annotations

import uuid

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
        if url.endswith("/conversations"):
            return FakeResponse({"id": "conv_test_user"})
        if url.endswith("/chat/completions"):
            if json["model"] in self.rate_limited_models:
                return httpx.Response(
                    429,
                    headers={"retry-after": "120"},
                    json={"error": {"code": "rate_limit_exceeded"}},
                    request=httpx.Request("POST", url),
                )
            return FakeResponse({"choices": [{"message": {"content": " Ответ Groq "}}]})
        return FakeResponse(
            {
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": " Короткий ответ "}],
                    }
                ]
            }
        )


@pytest.fixture(autouse=True)
def reset_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests.clear()
    FakeAsyncClient.rate_limited_models.clear()
    ai_engine._groq_model_cooldowns.clear()
    monkeypatch.setattr(ai_engine.httpx, "AsyncClient", FakeAsyncClient)


def settings() -> Settings:
    return Settings(
        ai_provider="openai",
        openai_api_key="test-key",
        openai_base_url="https://api.openai.com/v1",
        openai_model="gpt-5-nano",
    )


def groq_settings() -> Settings:
    return Settings(
        ai_provider="groq",
        llm_api_key="groq-test-key",
        llm_base_url="https://api.groq.com/openai/v1",
        llm_model="qwen/qwen3.6-27b",
    )


async def test_gpt5_nano_uses_responses_api_and_conversation() -> None:
    result = await ai_engine._call_openai_response(
        settings(),
        "system",
        "question",
        conversation_id="conv_user_1",
    )

    assert result == "Короткий ответ"
    request = FakeAsyncClient.requests[0]
    assert request["url"] == "https://api.openai.com/v1/responses"
    assert request["json"] == {
        "model": "gpt-5-nano",
        "instructions": "system",
        "input": "question",
        "max_output_tokens": 600,
        "conversation": "conv_user_1",
    }
    assert request["headers"]["Authorization"] == "Bearer test-key"


async def test_stateless_analysis_omits_conversation() -> None:
    await ai_engine._call_openai_response(settings(), "system", "analyze")

    assert "conversation" not in FakeAsyncClient.requests[0]["json"]


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
    }
    assert request["headers"]["Authorization"] == "Bearer groq-test-key"


async def test_configured_groq_analysis_uses_default_reasoning() -> None:
    reply, source = await ai_engine._call_configured_ai(
        groq_settings(),
        "system",
        "analyze",
        analyze=True,
    )

    assert reply == "Ответ Groq"
    assert source == "groq"
    assert FakeAsyncClient.requests[0]["json"]["reasoning_effort"] == "default"


async def test_groq_rotates_to_next_model_after_rate_limit() -> None:
    FakeAsyncClient.rate_limited_models.add("qwen/qwen3.6-27b")
    configured = groq_settings().model_copy(
        update={"llm_fallback_models": "openai/gpt-oss-20b,llama-3.1-8b-instant"}
    )

    result = await ai_engine._call_groq_chat(configured, "system", "question")

    assert result == "Ответ Groq"
    assert [request["json"]["model"] for request in FakeAsyncClient.requests] == [
        "qwen/qwen3.6-27b",
        "openai/gpt-oss-20b",
    ]
    assert ai_engine._groq_model_cooldowns["qwen/qwen3.6-27b"] > 0
    assert "reasoning_effort" not in FakeAsyncClient.requests[1]["json"]


async def test_conversation_is_created_with_stable_internal_user_id() -> None:
    user_id = uuid.uuid4()

    result = await ai_engine._create_openai_conversation(settings(), user_id)

    assert result == "conv_test_user"
    request = FakeAsyncClient.requests[0]
    assert request["url"] == "https://api.openai.com/v1/conversations"
    assert request["json"] == {"metadata": {"fitness_user_id": str(user_id)}}


def test_response_text_joins_output_text_chunks() -> None:
    result = ai_engine._response_text(
        {
            "output": [
                {"type": "reasoning", "content": []},
                {
                    "type": "message",
                    "content": [
                        {"type": "output_text", "text": "Первая часть"},
                        {"type": "output_text", "text": "Вторая часть"},
                    ],
                },
            ]
        }
    )

    assert result == "Первая часть\nВторая часть"


def test_english_only_model_reply_is_rejected() -> None:
    assert ai_engine._russian_only("Here is your detailed workout recommendation") is None
    assert ai_engine._russian_only("Увеличьте вес на 2.5 kg, если техника стабильна") is not None
