"""Safety guards for the destructive Stage C chaos harness."""

import pytest

from scripts.verify_stage_c_chaos import validate_api_url, validate_environment


def valid_environment() -> dict[str, str]:
    return {
        "CI": "true",
        "QA_STAGE_C_CHAOS": "1",
        "ENVIRONMENT": "test",
        "REDIS_URL": "redis://redis:6379/0",
    }


def test_chaos_harness_accepts_only_ephemeral_ci_redis() -> None:
    environment = valid_environment()
    assert validate_environment(environment) == environment["REDIS_URL"]


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("CI", "false"),
        ("QA_STAGE_C_CHAOS", "0"),
        ("ENVIRONMENT", "production"),
        ("REDIS_URL", "redis://localhost:6379/0"),
        ("REDIS_URL", "redis://redis:6379/1"),
    ],
)
def test_chaos_harness_rejects_non_ci_or_non_ephemeral_redis(key: str, value: str) -> None:
    environment = valid_environment()
    environment[key] = value
    with pytest.raises(RuntimeError):
        validate_environment(environment)


def test_chaos_harness_accepts_only_named_ephemeral_api() -> None:
    assert validate_api_url("http://fitness-chaos-api:8000") == (
        "http://fitness-chaos-api:8000"
    )
    for unsafe in (
        "https://api.filfitclub.ru",
        "http://localhost:8000",
        "http://fitness-chaos-api:9000",
    ):
        with pytest.raises(RuntimeError):
            validate_api_url(unsafe)
