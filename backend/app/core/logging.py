"""Structured JSON logging via loguru (TZ §12)."""

from __future__ import annotations

import logging
import sys

from loguru import logger


class InterceptHandler(logging.Handler):
    """Route stdlib logging into loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def setup_logging(*, environment: str = "development") -> None:
    """Configure loguru sinks. JSON in production, pretty in development."""
    logger.remove()
    serialize = environment != "development"
    logger.add(
        sys.stdout,
        level="INFO",
        serialize=serialize,
        backtrace=environment == "development",
        diagnose=environment == "development",
        enqueue=False,
    )

    logging.root.handlers = [InterceptHandler()]
    logging.root.setLevel(logging.INFO)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logging.getLogger(name).handlers = [InterceptHandler()]
        logging.getLogger(name).propagate = False
