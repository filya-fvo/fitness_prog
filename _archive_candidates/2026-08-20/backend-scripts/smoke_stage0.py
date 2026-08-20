"""Stage 0 smoke checks for backend scaffold."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def main() -> int:
    settings = get_settings()
    client = TestClient(app)
    response = client.get("/health")

    print("app_title=", app.title)
    print("routes=", sorted({getattr(route, "path", "") for route in app.routes}))
    print("cors=", settings.cors_origin_list)
    print("jwt_days=", settings.jwt_expire_days)
    print("health_status=", response.status_code)
    print("health_body=", response.json())

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "https://web.telegram.org" in settings.cors_origin_list
    print("STAGE0_BACKEND_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
