"""Serve the built single-page application from the API process."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse
from loguru import logger
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response
from starlette.staticfiles import StaticFiles


SPA_ROUTES = {
    "/",
    "/admin",
    "/ai",
    "/help",
    "/knowledge",
    "/more",
    "/measurements",
    "/nutrition",
    "/onboarding",
    "/profile",
    "/programs",
    "/progress",
    "/train",
    "/workouts",
}


def _is_spa_navigation(request: Request) -> bool:
    if request.method != "GET":
        return False
    path = request.url.path.rstrip("/") or "/"
    if path == "/":
        return True
    if "text/html" not in request.headers.get("accept", ""):
        return False
    return path in SPA_ROUTES or path.startswith("/workouts/active/")


def _safe_frontend_file(dist_dir: Path, request_path: str) -> Path | None:
    candidate = (dist_dir / request_path.lstrip("/")).resolve()
    try:
        candidate.relative_to(dist_dir)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def register_frontend(app: FastAPI, dist_dir: Path) -> bool:
    """Register production frontend files when a Vite build is available."""
    dist_dir = dist_dir.resolve()
    index_file = dist_dir / "index.html"
    if not index_file.is_file():
        logger.warning(
            "frontend_build_missing path={} hint='run npm.cmd run build in frontend'",
            str(index_file),
        )
        return False

    assets_dir = dist_dir / "assets"
    exercise_gifs_dir = dist_dir / "exercise-gifs"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")
    if exercise_gifs_dir.is_dir():
        app.mount(
            "/exercise-gifs",
            StaticFiles(directory=exercise_gifs_dir),
            name="exercise-gifs",
        )

    @app.middleware("http")
    async def frontend_navigation_middleware(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        # Several SPA screens share paths with JSON APIs. Browser navigation asks
        # for HTML, whereas axios/fetch asks for JSON, so both can use one origin.
        if _is_spa_navigation(request):
            return FileResponse(index_file, headers={"Cache-Control": "no-cache"})

        response = await call_next(request)
        if request.url.path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif request.url.path.startswith("/exercise-gifs/"):
            response.headers["Cache-Control"] = "public, max-age=604800"
        return response

    @app.get("/{frontend_path:path}", include_in_schema=False)
    async def frontend_fallback(frontend_path: str, request: Request) -> FileResponse:
        requested_path = "favicon.svg" if frontend_path == "favicon.ico" else frontend_path
        requested_file = _safe_frontend_file(dist_dir, requested_path)
        if requested_file is not None:
            cache_control = "no-cache" if requested_file.name in {
                "index.html",
                "manifest.webmanifest",
                "sw.js",
            } else "public, max-age=3600"
            return FileResponse(requested_file, headers={"Cache-Control": cache_control})
        if "text/html" in request.headers.get("accept", ""):
            return FileResponse(index_file, headers={"Cache-Control": "no-cache"})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    logger.info("frontend_build_enabled path={}", str(dist_dir))
    return True
