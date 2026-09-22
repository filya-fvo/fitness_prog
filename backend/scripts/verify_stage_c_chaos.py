"""Verify bounded fallbacks during Stage C service outages in ephemeral CI only."""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Mapping
from contextlib import asynccontextmanager
from datetime import UTC, datetime
import json
import os
from time import perf_counter
from urllib.parse import urlsplit

import httpx


def validate_environment(environ: Mapping[str, str]) -> str:
    """Refuse to run fault injection against any non-CI or production target."""
    if environ.get("CI", "").lower() != "true":
        raise RuntimeError("Stage C chaos checks require CI=true")
    if environ.get("QA_STAGE_C_CHAOS") != "1":
        raise RuntimeError("Stage C chaos checks require QA_STAGE_C_CHAOS=1")
    if environ.get("ENVIRONMENT") != "test":
        raise RuntimeError("Stage C chaos checks require ENVIRONMENT=test")

    redis_url = environ.get("REDIS_URL", "")
    parsed = urlsplit(redis_url)
    if parsed.scheme != "redis" or parsed.hostname != "redis" or parsed.path not in {"", "/0"}:
        raise RuntimeError("Stage C chaos Redis must be ephemeral host redis db 0")
    return redis_url


def validate_api_url(raw_url: str) -> str:
    parsed = urlsplit(raw_url)
    if parsed.scheme != "http" or parsed.hostname != "fitness-chaos-api" or parsed.port != 8000:
        raise RuntimeError("Stage C chaos API must be http://fitness-chaos-api:8000")
    return raw_url.rstrip("/")


def _response(status: int, payload: dict[str, object]) -> bytes:
    body = json.dumps(payload, ensure_ascii=False).encode()
    reason = "OK" if status == 200 else "Bad Gateway"
    return (
        f"HTTP/1.1 {status} {reason}\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n\r\n"
    ).encode() + body


@asynccontextmanager
async def fault_server(*, status: int = 200, delay: float = 0.0):
    """Serve a tiny deterministic HTTP endpoint without external dependencies."""
    handlers: set[asyncio.Task[None]] = set()

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        if task is not None:
            handlers.add(task)
        try:
            headers = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=1)
            content_length = 0
            for line in headers.decode(errors="replace").split("\r\n"):
                if line.casefold().startswith("content-length:"):
                    content_length = int(line.partition(":")[2].strip())
            if content_length:
                await asyncio.wait_for(reader.readexactly(content_length), timeout=1)
            if delay:
                await asyncio.sleep(delay)
            request_line = headers.partition(b"\r\n")[0]
            if b"/recognize" in request_line:
                payload: dict[str, object] = {
                    "text": "На 100 г\n250 ккал\nБелки 10 г\nЖиры 12 г\nУглеводы 20 г",
                    "confidence": 0.91,
                }
            else:
                payload = {
                    "choices": [{"message": {"content": "Безопасный локальный ответ"}}]
                }
            writer.write(_response(status, payload))
            await writer.drain()
        except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError):
            pass
        finally:
            writer.close()
            await writer.wait_closed()
            if task is not None:
                handlers.discard(task)

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = int(server.sockets[0].getsockname()[1])
    try:
        yield port
    finally:
        server.close()
        await server.wait_closed()
        for task in tuple(handlers):
            task.cancel()
        if handlers:
            await asyncio.gather(*handlers, return_exceptions=True)


async def _check_llm_fault(*, status: int, delay: float, timeout: float) -> str | None:
    from app.core.config import Settings
    from app.services.local_llm import call_local_chat

    async with fault_server(status=status, delay=delay) as port:
        settings = Settings(
            environment="test",
            llm_provider="local",
            llm_base_url=f"http://127.0.0.1:{port}/v1",
            llm_timeout_seconds=timeout,
        )
        return await call_local_chat(
            settings,
            "Отвечай кратко",
            "Как восстановиться?",
            timeout_seconds=timeout,
            queue_timeout_seconds=timeout,
        )


async def _check_ocr_fault(*, status: int, delay: float, timeout: float):
    from app.core.config import Settings
    from app.services.nutrition_label_vision import recognize_nutrition_label

    async with fault_server(status=status, delay=delay) as port:
        settings = Settings(
            environment="test",
            ocr_base_url=f"http://127.0.0.1:{port}",
            ocr_timeout_seconds=timeout,
        )
        return await recognize_nutrition_label(b"\xff\xd8\xffphoto", "image/jpeg", settings)


async def check_http_faults() -> None:
    from app.services.nutrition_label_vision import NutritionLabelUnavailable

    started = perf_counter()
    if await _check_llm_fault(status=502, delay=0, timeout=0.4) is not None:
        raise AssertionError("LLM 502 did not select the rule fallback")
    if await _check_llm_fault(status=200, delay=0.6, timeout=0.1) is not None:
        raise AssertionError("Hung LLM did not select the rule fallback")
    llm_reply = await _check_llm_fault(status=200, delay=0.1, timeout=0.5)
    if llm_reply != "Безопасный локальный ответ":
        raise AssertionError("Slow but valid LLM response was not accepted")

    for status, delay in ((502, 0.0), (200, 0.6)):
        try:
            await _check_ocr_fault(status=status, delay=delay, timeout=0.1)
        except NutritionLabelUnavailable:
            pass
        else:
            raise AssertionError("Unavailable OCR did not return its safe failure")
    ocr_result = await _check_ocr_fault(status=200, delay=0.1, timeout=0.5)
    if not ocr_result.recognized or ocr_result.calories_kcal != 250:
        raise AssertionError("Slow but valid OCR response was not accepted")
    if perf_counter() - started > 3:
        raise AssertionError("Internal service fallbacks exceeded their bounded latency")


async def check_redis_outage(redis_url: str) -> None:
    from app.core.config import Settings
    from app.services.admin_system import probe_redis

    started = perf_counter()
    checks = await probe_redis(
        Settings(environment="test", redis_url=redis_url),
        datetime.now(UTC),
    )
    by_key = {item.key: item for item in checks}
    if by_key["redis"].status != "error":
        raise AssertionError("Stopped Redis was not reported as an error")
    if by_key["queue"].status != "no_data" or by_key["worker"].status != "no_data":
        raise AssertionError("Redis outage did not produce safe unknown queue/worker states")
    if perf_counter() - started > 4:
        raise AssertionError("Redis outage probe exceeded its bounded latency")


async def check_api(api_url: str, expectation: str) -> None:
    started = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=0.6) as client:
            response = await client.get(f"{api_url}/health")
    except httpx.TimeoutException:
        if expectation != "timeout":
            raise
    except httpx.RequestError:
        if expectation != "unavailable":
            raise
    else:
        if expectation != "healthy":
            raise AssertionError(f"API unexpectedly answered during {expectation}")
        if response.status_code != 200 or response.json() != {"status": "ok"}:
            raise AssertionError("Recovered API did not return its canonical health response")
    if perf_counter() - started > 2:
        raise AssertionError("API fault detection exceeded its bounded latency")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--http-faults", action="store_true")
    modes.add_argument("--redis-outage", action="store_true")
    modes.add_argument("--api-url")
    parser.add_argument("--expect-api", choices=("healthy", "timeout", "unavailable"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    redis_url = validate_environment(os.environ)
    if args.http_faults:
        asyncio.run(asyncio.wait_for(check_http_faults(), timeout=10))
        print("CHAOS_HTTP_OK llm=502,timeout,slow ocr=502,timeout,slow")
        return
    if args.redis_outage:
        asyncio.run(asyncio.wait_for(check_redis_outage(redis_url), timeout=6))
        print("CHAOS_REDIS_OK outage=bounded status=error queue=no_data")
        return
    if not args.expect_api:
        raise RuntimeError("--expect-api is required with --api-url")
    api_url = validate_api_url(args.api_url)
    asyncio.run(asyncio.wait_for(check_api(api_url, args.expect_api), timeout=3))
    print(f"CHAOS_API_OK state={args.expect_api}")


if __name__ == "__main__":
    main()
