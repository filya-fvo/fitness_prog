"""Smoke tests for app wiring."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_telegram_rejects_empty_body() -> None:
    response = client.post("/auth/telegram", json={})
    assert response.status_code == 422


def test_auth_telegram_rejects_invalid_init_data() -> None:
    response = client.post("/auth/telegram", json={"init_data": "not-valid"})
    # 401 from InitDataError, or 500 if DB missing — signature fails before DB
    assert response.status_code in (401, 500)
