"""Public immutable delivery of non-sensitive exercise catalog media."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import admin_exercise_media

router = APIRouter(prefix="/exercise-media", tags=["exercise-media"])


async def _serve(
    asset_id: uuid.UUID,
    request: Request,
    session: AsyncSession,
    *,
    head_only: bool,
) -> Response:
    asset = await admin_exercise_media.get_asset(session, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Медиа упражнения не найдено")
    etag = f'"{asset.sha256}"'
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": str(asset.size_bytes),
        "ETag": etag,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
    }
    if request.headers.get("if-none-match") == etag:
        headers.pop("Content-Length", None)
        return Response(status_code=304, headers=headers)
    content = b"" if head_only else asset.media_data
    return Response(content=content, media_type=asset.mime_type, headers=headers)


@router.get("/{asset_id}", response_class=Response)
async def serve_exercise_media(
    asset_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> Response:
    return await _serve(asset_id, request, session, head_only=False)


@router.head("/{asset_id}", response_class=Response, include_in_schema=False)
async def head_exercise_media(
    asset_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> Response:
    return await _serve(asset_id, request, session, head_only=True)
