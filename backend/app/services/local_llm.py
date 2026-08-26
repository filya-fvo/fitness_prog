"""Bounded client for the internal llama.cpp Chat Completions endpoint."""

from __future__ import annotations

import asyncio
from urllib.parse import urlsplit

import httpx
from loguru import logger

from app.core.config import Settings

_LOCAL_AI_HOSTS = {"llm", "localhost", "127.0.0.1", "::1"}
_request_lock = asyncio.Lock()


def is_local_ai_config(settings: Settings) -> bool:
    """Allow only the Docker service name or loopback, never an internet host."""
    if settings.llm_provider.strip().casefold() != "local":
        return False
    parsed = urlsplit(settings.llm_base_url.strip())
    return parsed.scheme == "http" and (parsed.hostname or "").casefold() in _LOCAL_AI_HOSTS


async def call_local_chat(
    settings: Settings,
    instructions: str,
    user_prompt: str,
    *,
    temperature: float = 0.2,
    max_tokens: int | None = None,
    json_schema: dict | None = None,
) -> str | None:
    """Call one local inference at a time and return plain model content."""
    if not is_local_ai_config(settings):
        logger.error("local_ai_rejected_non_local_configuration")
        return None

    body: dict = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens or settings.llm_max_output_tokens,
    }
    if json_schema:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "local_result", "strict": True, "schema": json_schema},
        }
    headers = {"Content-Type": "application/json"}
    if settings.llm_api_key.strip():
        headers["Authorization"] = f"Bearer {settings.llm_api_key.strip()}"

    base = settings.llm_base_url.rstrip("/")
    acquired = False
    try:
        await asyncio.wait_for(
            _request_lock.acquire(),
            timeout=settings.llm_timeout_seconds,
        )
        acquired = True
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                response = await client.post(
                    f"{base}/chat/completions",
                    headers=headers,
                    json=body,
                )
                response.raise_for_status()
        finally:
            _request_lock.release()
            acquired = False
        content = response.json()["choices"][0]["message"]["content"]
        return str(content).strip() if content is not None and str(content).strip() else None
    except (TimeoutError, httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        logger.warning(
            "local_ai_request_failed status={} err_type={}",
            status,
            type(exc).__name__,
        )
        return None
    finally:
        if acquired:
            _request_lock.release()
