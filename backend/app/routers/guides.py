"""Download the public user manual or the authenticated administrator manual."""
from fastapi import APIRouter, Depends, HTTPException, Response
from starlette.concurrency import run_in_threadpool

from app.deps import require_admin
from app.models.user import User
from app.services.guide_download import GuideKind, GuideUnavailableError, load_guide

router = APIRouter(prefix="/guides", tags=["guides"])


async def _download(kind: GuideKind) -> Response:
    try:
        filename, content = await run_in_threadpool(load_guide, kind)
    except GuideUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    return Response(content, media_type="text/markdown; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.get("/user", response_class=Response)
async def download_user_guide() -> Response:
    return await _download("user")


@router.get("/admin", response_class=Response)
async def download_admin_guide(_admin: User = Depends(require_admin)) -> Response:
    return await _download("admin")
