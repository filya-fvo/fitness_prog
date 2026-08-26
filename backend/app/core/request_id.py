"""Validated request correlation identifiers."""

from __future__ import annotations

import uuid

from fastapi import Request


def parse_or_create_request_id(value: str | None) -> uuid.UUID:
    if value:
        try:
            return uuid.UUID(value.strip())
        except (ValueError, AttributeError):
            pass
    return uuid.uuid4()


def get_request_id(request: Request) -> uuid.UUID:
    value = getattr(request.state, "correlation_id", None)
    return value if isinstance(value, uuid.UUID) else uuid.uuid4()
