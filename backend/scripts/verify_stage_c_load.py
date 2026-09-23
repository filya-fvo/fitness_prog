"""Guarded Stage C load test for an isolated API/PostgreSQL/Redis stack."""

from __future__ import annotations

import argparse
import asyncio
import math
import os
import random
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from urllib.parse import urlparse

import httpx
from redis.asyncio import Redis
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token
from app.models.daily_metric import DailyMetric
from app.models.user import User


ALLOWED_HOSTS = {"api", "fitness-load-api", "localhost", "127.0.0.1"}
TRUTHY = {"1", "true", "yes"}


@dataclass(frozen=True, slots=True)
class LoadConfig:
    base_url: str
    users: int
    duration_seconds: int
    read_ratio: float
    think_time_ms: int
    p95_limit_ms: float
    max_error_rate: float
    request_timeout_seconds: float


@dataclass(frozen=True, slots=True)
class Sample:
    operation: str
    elapsed_ms: float
    succeeded: bool


def parse_args() -> LoadConfig:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://api:8000")
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--duration-seconds", type=int, default=600)
    parser.add_argument("--read-ratio", type=float, default=0.70)
    parser.add_argument("--think-time-ms", type=int, default=1000)
    parser.add_argument("--p95-limit-ms", type=float, default=500.0)
    parser.add_argument("--max-error-rate", type=float, default=0.01)
    parser.add_argument("--request-timeout-seconds", type=float, default=10.0)
    args = parser.parse_args()
    return LoadConfig(
        base_url=args.base_url.rstrip("/"),
        users=args.users,
        duration_seconds=args.duration_seconds,
        read_ratio=args.read_ratio,
        think_time_ms=args.think_time_ms,
        p95_limit_ms=args.p95_limit_ms,
        max_error_rate=args.max_error_rate,
        request_timeout_seconds=args.request_timeout_seconds,
    )


def require_isolated_test_environment(config: LoadConfig) -> None:
    settings = get_settings()
    hostname = (urlparse(config.base_url).hostname or "").lower()
    if os.getenv("CI", "").lower() not in TRUTHY:
        raise RuntimeError("LOAD_GUARD_REQUIRES_CI")
    if os.getenv("QA_STAGE_C_LOAD") != "1":
        raise RuntimeError("LOAD_GUARD_REQUIRES_QA_STAGE_C_LOAD")
    if settings.environment != "test":
        raise RuntimeError("LOAD_GUARD_REQUIRES_TEST_ENVIRONMENT")
    if hostname not in ALLOWED_HOSTS:
        raise RuntimeError("LOAD_GUARD_REJECTED_API_HOST")
    if not 1 <= config.users <= 100:
        raise RuntimeError("LOAD_USERS_OUT_OF_RANGE")
    if not 5 <= config.duration_seconds <= 900:
        raise RuntimeError("LOAD_DURATION_OUT_OF_RANGE")
    if not 0.5 <= config.read_ratio <= 0.95:
        raise RuntimeError("LOAD_READ_RATIO_OUT_OF_RANGE")
    if not 0 <= config.think_time_ms <= 10_000:
        raise RuntimeError("LOAD_THINK_TIME_OUT_OF_RANGE")
    if not 50 <= config.p95_limit_ms <= 10_000:
        raise RuntimeError("LOAD_P95_LIMIT_OUT_OF_RANGE")
    if not 0 <= config.max_error_rate <= 0.10:
        raise RuntimeError("LOAD_ERROR_RATE_OUT_OF_RANGE")


async def wait_for_api(config: LoadConfig) -> None:
    deadline = time.monotonic() + 60
    async with httpx.AsyncClient(timeout=2) as client:
        while time.monotonic() < deadline:
            try:
                response = await client.get(f"{config.base_url}/health")
                if response.status_code == 200 and response.json().get("status") == "ok":
                    return
            except (httpx.HTTPError, ValueError):
                pass
            await asyncio.sleep(1)
    raise RuntimeError("LOAD_API_NOT_READY")


async def create_test_users(count: int, run_id: str) -> list[tuple[uuid.UUID, str]]:
    settings = get_settings()
    users: list[User] = []
    async with AsyncSessionLocal() as session:
        for index in range(count):
            user = User(
                id=uuid.uuid4(),
                username=f"qa_load_{run_id}_{index}",
                anthropometry={},
                goals={"timezone": "UTC"},
            )
            session.add(user)
            users.append(user)
        await session.commit()
    return [
        (user.id, create_access_token(subject=str(user.id), settings=settings)) for user in users
    ]


async def timed_request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    *,
    operation: str,
    expected_user_id: uuid.UUID,
    json_body: dict[str, object] | None = None,
) -> Sample:
    started = time.perf_counter()
    succeeded = False
    try:
        response = await client.request(method, path, json=json_body)
        body = response.json()
        succeeded = response.status_code == 200
        if succeeded and operation == "read_profile":
            succeeded = body.get("id") == str(expected_user_id)
        elif succeeded and operation in {"read_metric", "write_metric"}:
            succeeded = body.get("date") == date.today().isoformat()
            if succeeded and operation == "write_metric":
                succeeded = body.get("steps") == json_body["steps"]
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        succeeded = False
    return Sample(operation, (time.perf_counter() - started) * 1000, succeeded)


async def load_user(
    config: LoadConfig,
    user_index: int,
    user_id: uuid.UUID,
    token: str,
    start: asyncio.Event,
    deadline: float,
) -> list[Sample]:
    rng = random.Random(user_id.int)
    samples: list[Sample] = []
    write_sequence = 0
    limits = httpx.Limits(max_connections=1, max_keepalive_connections=1)
    async with httpx.AsyncClient(
        base_url=config.base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=config.request_timeout_seconds,
        limits=limits,
    ) as client:
        await start.wait()
        while time.monotonic() < deadline:
            if rng.random() < config.read_ratio:
                profile = rng.random() < 0.5
                sample = await timed_request(
                    client,
                    "GET",
                    "/users/me" if profile else f"/metrics/daily?date={date.today().isoformat()}",
                    operation="read_profile" if profile else "read_metric",
                    expected_user_id=user_id,
                )
            else:
                write_sequence += 1
                sample = await timed_request(
                    client,
                    "PUT",
                    f"/metrics/daily?date={date.today().isoformat()}",
                    operation="write_metric",
                    expected_user_id=user_id,
                    json_body={
                        "steps": (user_index * 1000 + write_sequence) % 200_001,
                        "active_minutes": user_index % 1441,
                    },
                )
            samples.append(sample)
            if config.think_time_ms:
                jitter = rng.uniform(0.75, 1.25)
                await asyncio.sleep(config.think_time_ms * jitter / 1000)
    return samples


async def verify_final_data(
    config: LoadConfig,
    users: list[tuple[uuid.UUID, str]],
) -> None:
    day = date.today().isoformat()

    async def verify_one(index: int, user_id: uuid.UUID, token: str) -> None:
        expected_steps = 150_000 + index
        async with httpx.AsyncClient(
            base_url=config.base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=config.request_timeout_seconds,
        ) as client:
            saved = await client.put(
                f"/metrics/daily?date={day}",
                json={"steps": expected_steps, "active_minutes": index % 1441},
            )
            loaded = await client.get(f"/metrics/daily?date={day}")
        if saved.status_code != 200 or loaded.status_code != 200:
            raise RuntimeError("LOAD_FINAL_HTTP_VERIFICATION_FAILED")
        if saved.json().get("steps") != expected_steps or loaded.json().get("steps") != expected_steps:
            raise RuntimeError("LOAD_FINAL_VALUE_VERIFICATION_FAILED")

    await asyncio.gather(
        *(verify_one(index, user_id, token) for index, (user_id, token) in enumerate(users))
    )
    user_ids = [user_id for user_id, _token in users]
    async with AsyncSessionLocal() as session:
        stored_count = await session.scalar(
            select(func.count(DailyMetric.id)).where(
                DailyMetric.user_id.in_(user_ids),
                DailyMetric.date == date.today(),
                DailyMetric.is_deleted.is_(False),
            )
        )
    if stored_count != len(users):
        raise RuntimeError("LOAD_DATABASE_ROW_COUNT_MISMATCH")


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        raise RuntimeError("LOAD_NO_SAMPLES")
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * quantile) - 1)]


async def run(config: LoadConfig) -> None:
    require_isolated_test_environment(config)
    await wait_for_api(config)
    run_id = datetime.now(UTC).strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:6]
    users = await create_test_users(config.users, run_id)

    redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    queue_key = f"fitness:qa:load:{run_id}:queue"
    queue_items = [f"job-{index}" for index in range(config.users)]
    await redis.rpush(queue_key, *queue_items)
    await redis.expire(queue_key, config.duration_seconds + 300)

    start = asyncio.Event()
    deadline = time.monotonic() + config.duration_seconds
    tasks = [
        asyncio.create_task(load_user(config, index, user_id, token, start, deadline))
        for index, (user_id, token) in enumerate(users)
    ]
    start.set()
    samples = [sample for user_samples in await asyncio.gather(*tasks) for sample in user_samples]
    await verify_final_data(config, users)
    preserved_queue = await redis.lrange(queue_key, 0, -1)
    await redis.delete(queue_key)
    await redis.aclose()
    if preserved_queue != queue_items:
        raise RuntimeError("LOAD_REDIS_QUEUE_MISMATCH")

    failures = sum(not sample.succeeded for sample in samples)
    error_rate = failures / len(samples) if samples else 1.0
    all_p95 = percentile([sample.elapsed_ms for sample in samples], 0.95)
    read_samples = [sample.elapsed_ms for sample in samples if sample.operation.startswith("read_")]
    write_samples = [sample.elapsed_ms for sample in samples if sample.operation == "write_metric"]
    read_p95 = percentile(read_samples, 0.95)
    write_p95 = percentile(write_samples, 0.95)
    print(
        "LOAD_RESULT",
        f"users={config.users}",
        f"duration_seconds={config.duration_seconds}",
        f"requests={len(samples)}",
        f"failures={failures}",
        f"error_rate={error_rate:.4f}",
        f"p95_ms={all_p95:.1f}",
        f"read_p95_ms={read_p95:.1f}",
        f"write_p95_ms={write_p95:.1f}",
        f"data_rows={config.users}",
        f"queue_items={len(preserved_queue)}",
    )
    if error_rate >= config.max_error_rate:
        raise RuntimeError("LOAD_ERROR_RATE_LIMIT_EXCEEDED")
    if all_p95 > config.p95_limit_ms:
        raise RuntimeError("LOAD_P95_LIMIT_EXCEEDED")
    print("LOAD_OK")


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
