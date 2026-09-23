"""Safety and result-accounting tests for the isolated Stage C load harness."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import httpx
import pytest

from scripts import verify_stage_c_load as load


def config(**overrides: object) -> load.LoadConfig:
    values: dict[str, object] = {
        "base_url": "http://api:8000",
        "users": 50,
        "duration_seconds": 600,
        "read_ratio": 0.70,
        "think_time_ms": 1000,
        "p95_limit_ms": 500.0,
        "max_error_rate": 0.01,
        "request_timeout_seconds": 10.0,
    }
    values.update(overrides)
    return load.LoadConfig(**values)


def test_load_guard_accepts_only_explicit_internal_test_run(monkeypatch) -> None:
    monkeypatch.setenv("CI", "true")
    monkeypatch.setenv("QA_STAGE_C_LOAD", "1")
    monkeypatch.setattr(load, "get_settings", lambda: SimpleNamespace(environment="test"))

    load.require_isolated_test_environment(config())

    with pytest.raises(RuntimeError, match="LOAD_GUARD_REJECTED_API_HOST"):
        load.require_isolated_test_environment(
            config(base_url="https://api.filfitclub.ru")
        )


def test_load_guard_requires_explicit_opt_in(monkeypatch) -> None:
    monkeypatch.setenv("CI", "true")
    monkeypatch.delenv("QA_STAGE_C_LOAD", raising=False)
    monkeypatch.setattr(load, "get_settings", lambda: SimpleNamespace(environment="test"))

    with pytest.raises(RuntimeError, match="LOAD_GUARD_REQUIRES_QA_STAGE_C_LOAD"):
        load.require_isolated_test_environment(config())


def test_percentile_uses_nearest_rank() -> None:
    assert load.percentile([1, 2, 3, 4, 5], 0.95) == 5
    assert load.percentile([5, 1, 4, 2, 3], 0.50) == 3


@pytest.mark.asyncio
async def test_timed_request_marks_wrong_user_as_failure() -> None:
    expected_user_id = uuid.uuid4()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": str(uuid.uuid4())})

    async with httpx.AsyncClient(
        base_url="http://api:8000",
        transport=httpx.MockTransport(handler),
    ) as client:
        sample = await load.timed_request(
            client,
            "GET",
            "/users/me",
            operation="read_profile",
            expected_user_id=expected_user_id,
        )

    assert sample.operation == "read_profile"
    assert sample.succeeded is False
