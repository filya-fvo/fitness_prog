"""Optional Sentry init for production (no hard crash if package missing)."""

from __future__ import annotations

from loguru import logger


def init_sentry(*, dsn: str, environment: str) -> None:
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            traces_sample_rate=0.1 if environment == "production" else 0.0,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
            send_default_pii=False,
        )
        logger.info("sentry_initialized env={}", environment)
    except Exception as exc:  # noqa: BLE001 — optional dependency
        logger.warning("sentry_init_skipped err={}", str(exc))
