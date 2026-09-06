"""Tests for the single-origin local production frontend."""

import httpx
from fastapi import FastAPI

from app.frontend import register_frontend


async def test_spa_navigation_and_api_can_share_a_path(tmp_path) -> None:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text("<html>fitness-spa</html>", encoding="utf-8")
    (assets / "app-123.js").write_text("console.log('ok')", encoding="utf-8")

    test_app = FastAPI()

    @test_app.get("/programs")
    async def programs_api() -> dict[str, str]:
        return {"kind": "api"}

    assert register_frontend(test_app, dist)
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        navigation = await client.get("/programs", headers={"Accept": "text/html"})
        api_response = await client.get("/programs", headers={"Accept": "application/json"})
        asset = await client.get("/assets/app-123.js")

    assert navigation.status_code == 200
    assert "fitness-spa" in navigation.text
    assert navigation.headers["cache-control"] == "no-store, no-cache, max-age=0, must-revalidate"
    assert navigation.headers["pragma"] == "no-cache"
    assert api_response.json() == {"kind": "api"}
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        missing_asset = await client.get("/assets/removed-release.js")
    assert missing_asset.status_code == 404
    assert missing_asset.headers["cache-control"] == "no-store"


async def test_spa_deep_link_and_root_files(tmp_path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>fitness-spa</html>", encoding="utf-8")
    (dist / "sw.js").write_text("self.skipWaiting()", encoding="utf-8")
    (dist / "version.json").write_text('{"buildId":"v2"}', encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")

    test_app = FastAPI()
    assert register_frontend(test_app, dist)
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        root = await client.get("/")
        deep_link = await client.get(
            "/workouts/active/123",
            headers={"Accept": "text/html"},
        )
        measurements = await client.get(
            "/measurements",
            headers={"Accept": "text/html"},
        )
        knowledge = await client.get(
            "/knowledge",
            headers={"Accept": "text/html"},
        )
        faq = await client.get(
            "/faq",
            headers={"Accept": "text/html"},
        )
        support_thread = await client.get(
            "/support/123",
            headers={"Accept": "text/html"},
        )
        service_worker = await client.get("/sw.js")
        version = await client.get("/version.json")
        legacy_favicon = await client.get("/favicon.ico")
        missing_api = await client.get("/auth/not-a-route", headers={"Accept": "application/json"})

    assert root.status_code == 200
    assert "fitness-spa" in root.text
    assert deep_link.status_code == 200
    assert "fitness-spa" in deep_link.text
    assert measurements.status_code == 200
    assert "fitness-spa" in measurements.text
    assert knowledge.status_code == 200
    assert "fitness-spa" in knowledge.text
    assert faq.status_code == 200
    assert "fitness-spa" in faq.text
    assert support_thread.status_code == 200
    assert "fitness-spa" in support_thread.text
    assert service_worker.text == "self.skipWaiting()"
    assert service_worker.headers["cache-control"] == "no-cache"
    assert version.json() == {"buildId": "v2"}
    assert version.headers["cache-control"] == "no-store, no-cache, max-age=0, must-revalidate"
    assert legacy_favicon.status_code == 200
    assert legacy_favicon.text == "<svg></svg>"
    assert missing_api.status_code == 404
    assert missing_api.json() == {"detail": "Not Found"}


def test_missing_build_does_not_register_fallback(tmp_path) -> None:
    test_app = FastAPI()
    assert register_frontend(test_app, tmp_path / "missing") is False
