"""Internal-only Tesseract OCR microservice for nutrition labels."""

from __future__ import annotations

import asyncio
import io
import subprocess
from collections import defaultdict

from fastapi import FastAPI, HTTPException, Request, status
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000

app = FastAPI(title="Fitness local OCR", docs_url=None, redoc_url=None, openapi_url=None)
_ocr_lock = asyncio.Lock()


def _prepare_image(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("L")
        if max(image.size) > 3000:
            image.thumbnail((3000, 3000))
        elif max(image.size) < 1400:
            image = image.resize((image.width * 2, image.height * 2))
        image = ImageOps.autocontrast(image, cutoff=1)
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        return output.getvalue()


def _run_tesseract(data: bytes) -> tuple[str, float]:
    prepared = _prepare_image(data)
    completed = subprocess.run(
        [
            "tesseract",
            "stdin",
            "stdout",
            "-l",
            "rus+eng",
            "--oem",
            "1",
            "--psm",
            "6",
            "tsv",
        ],
        input=prepared,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=25,
        check=True,
    )
    lines: dict[tuple[str, str, str, str], list[str]] = defaultdict(list)
    confidences: list[float] = []
    for row in completed.stdout.decode("utf-8", errors="replace").splitlines()[1:]:
        columns = row.split("\t", 11)
        if len(columns) != 12 or not columns[11].strip():
            continue
        lines[(columns[2], columns[3], columns[4], columns[5])].append(columns[11].strip())
        try:
            confidence = float(columns[10])
            if confidence >= 0:
                confidences.append(confidence)
        except ValueError:
            pass
    text = "\n".join(" ".join(words) for words in lines.values())
    score = sum(confidences) / len(confidences) / 100 if confidences else 0.0
    return text, round(min(max(score, 0.0), 1.0), 3)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/recognize")
async def recognize(request: Request) -> dict[str, str | float]:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
    data = await request.body()
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
    try:
        async with _ocr_lock:
            text, confidence = await asyncio.to_thread(_run_tesseract, data)
    except (UnidentifiedImageError, OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY) from exc
    return {"text": text, "confidence": confidence}
