"""Web Push configuration and failure-safety tests."""

from __future__ import annotations

from base64 import urlsafe_b64encode
from types import SimpleNamespace
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import Vapid

from app.core.config import Settings
from app.services import web_push


def vapid_pair() -> tuple[str, str]:
    private = ec.generate_private_key(ec.SECP256R1())
    private_pem = private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = urlsafe_b64encode(
        private.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
    ).rstrip(b"=").decode()
    return public, private_pem


def test_web_push_configuration_requires_a_matching_key_pair() -> None:
    public, private = vapid_pair()

    assert web_push.web_push_configured(
        public,
        private.replace("\n", "\\n"),
        "mailto:a@b.test",
    )
    assert not web_push.web_push_configured(
        public,
        "not-a-private-key",
        "mailto:a@b.test",
    )
    other_public, _ = vapid_pair()
    assert not web_push.web_push_configured(other_public, private, "mailto:a@b.test")


class FakeSession:
    def __init__(self, subscription: SimpleNamespace) -> None:
        self.subscription = subscription
        self.commits = 0

    async def scalars(self, _statement):
        return [self.subscription]

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_local_push_error_does_not_disable_browser_subscription(monkeypatch) -> None:
    public, private = vapid_pair()
    subscription = SimpleNamespace(
        id=uuid4(),
        endpoint="https://push.example.test/one",
        p256dh="p256dh",
        auth="auth",
        failure_count=2,
        disabled_at=None,
        last_success_at=None,
    )
    session = FakeSession(subscription)

    received_vapid: list[object] = []

    def broken_webpush(**kwargs) -> None:
        received_vapid.append(kwargs["vapid_private_key"])
        raise ValueError("local key/config failure")

    monkeypatch.setattr(web_push, "webpush", broken_webpush)
    sent = await web_push.send_user_web_push(
        session,  # type: ignore[arg-type]
        Settings(
            jwt_secret="test-secret",
            web_push_vapid_public_key=public,
            web_push_vapid_private_key=private,
            web_push_vapid_subject="mailto:a@b.test",
        ),
        user_id=uuid4(),
        title="Проверка",
        body="Текст",
        url="/notifications",
        tag="test",
    )

    assert sent == 0
    assert isinstance(received_vapid[0], Vapid)
    assert subscription.failure_count == 2
    assert subscription.disabled_at is None
    assert session.commits == 1
