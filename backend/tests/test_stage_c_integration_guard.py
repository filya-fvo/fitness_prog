"""Safety guard for the destructive Stage C integration probe."""

import pytest

from scripts.verify_stage_c_integration import validate_environment


def valid_environment() -> dict[str, str]:
    return {
        "CI": "true",
        "QA_STAGE_C_INTEGRATION": "1",
        "ENVIRONMENT": "test",
        "DATABASE_URL": "postgresql+asyncpg://fitness:test@db:5432/fitness",
        "REDIS_URL": "redis://redis:6379/0",
    }


def test_stage_c_probe_accepts_only_ephemeral_ci_compose_hosts() -> None:
    environment = valid_environment()
    assert validate_environment(environment) == (
        environment["DATABASE_URL"],
        environment["REDIS_URL"],
    )


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("CI", "false"),
        ("QA_STAGE_C_INTEGRATION", "0"),
        ("ENVIRONMENT", "production"),
        ("DATABASE_URL", "postgresql+asyncpg://fitness:test@localhost:5432/fitness"),
        ("DATABASE_URL", "postgresql+asyncpg://fitness:test@db:5432/production"),
        ("REDIS_URL", "redis://localhost:6379/0"),
        ("REDIS_URL", "redis://redis:6379/1"),
    ],
)
def test_stage_c_probe_rejects_non_ci_or_non_ephemeral_targets(key: str, value: str) -> None:
    environment = valid_environment()
    environment[key] = value
    with pytest.raises(RuntimeError):
        validate_environment(environment)
