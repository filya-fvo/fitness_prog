"""Local nutrition-label OCR and conservative nutrient extraction."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

import httpx
from loguru import logger
from app.core.config import Settings
from app.schemas.nutrition import NutritionLabelRecognitionResponse

MAX_LABEL_IMAGE_BYTES = 8 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
_NUMBER_RE = r"(\d{1,4}(?:[.,]\d{1,3})?)"
_NUTRIENT_ALIASES = {
    "proteins_g": ("белк", "белок", "protein"),
    "fats_g": ("жир", "fat"),
    "carbs_g": ("углевод", "carbohydrate", "carbs"),
    "fiber_g": ("клетчат", "пищев волок", "fiber", "fibre"),
    "sugars_g": ("сахар", "sugars"),
    "salt_g": ("соль", "salt"),
}
_LOCAL_OCR_HOSTS = {"ocr", "localhost", "127.0.0.1", "::1"}


class NutritionLabelImageError(ValueError):
    """The uploaded file is not a supported, bounded image."""


class NutritionLabelUnavailable(RuntimeError):
    """The local OCR service is unavailable."""


class NutritionLabelInvalidResponse(RuntimeError):
    """A local service returned no usable structured result."""


def is_local_ocr_config(settings: Settings) -> bool:
    parsed = urlsplit(settings.ocr_base_url.strip())
    return parsed.scheme == "http" and (parsed.hostname or "").casefold() in _LOCAL_OCR_HOSTS


def detect_image_mime(data: bytes) -> str | None:
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def read_label_image(upload) -> tuple[bytes, str]:
    """Read one upload with a hard limit and verify its magic bytes."""
    data = await upload.read(MAX_LABEL_IMAGE_BYTES + 1)
    if not data:
        raise NutritionLabelImageError("empty_image")
    if len(data) > MAX_LABEL_IMAGE_BYTES:
        raise NutritionLabelImageError("image_too_large")
    detected = detect_image_mime(data)
    if detected not in SUPPORTED_IMAGE_TYPES:
        raise NutritionLabelImageError("unsupported_image")
    declared = str(getattr(upload, "content_type", "") or "").lower()
    if declared and declared not in SUPPORTED_IMAGE_TYPES:
        raise NutritionLabelImageError("unsupported_image")
    return data, detected


def _decimal(raw: str) -> float:
    return float(raw.replace(",", "."))


def _line_value(lines: list[str], aliases: tuple[str, ...]) -> float | None:
    all_aliases = tuple(alias for values in _NUTRIENT_ALIASES.values() for alias in values)
    for index, line in enumerate(lines):
        lowered = line.casefold()
        positions = [lowered.find(alias) for alias in aliases if alias in lowered]
        if not positions:
            continue
        match = re.search(_NUMBER_RE, line[min(positions) :])
        if match:
            return _decimal(match.group(1))
        # Tesseract often puts a row label and its value on adjacent lines.
        # Stop before the next nutrient label so one value is never assigned twice.
        for following in lines[index + 1 : index + 3]:
            following_lowered = following.casefold()
            if any(alias in following_lowered for alias in all_aliases):
                break
            match = re.search(_NUMBER_RE, following)
            if match:
                return _decimal(match.group(1))
    return None


def _energy_kcal(lines: list[str]) -> float | None:
    for index, line in enumerate(lines):
        lowered = line.casefold()
        if not any(word in lowered for word in ("энерг", "energy", "ккал", "kcal")):
            continue
        window = " ".join(lines[index : index + 2]).casefold()
        kcal = re.search(_NUMBER_RE + r"\s*(?:ккал|kcal)", window)
        if not kcal:
            kcal = re.search(r"(?:ккал|kcal)\s*[:=-]?\s*" + _NUMBER_RE, window)
        if kcal:
            return _decimal(kcal.group(1))
        kj = re.search(_NUMBER_RE + r"\s*(?:кдж|кд?ж|kj)", window)
        if not kj:
            kj = re.search(r"(?:кдж|кд?ж|kj)\s*[:=-]?\s*" + _NUMBER_RE, window)
        if kj:
            return round(_decimal(kj.group(1)) / 4.184, 1)
    return None


def parse_ocr_text(text: str, *, ocr_confidence: float = 0.0) -> NutritionLabelRecognitionResponse:
    """Extract only explicit values; never infer a missing nutrient."""
    normalized = re.sub(r"[ \t]+", " ", text.replace("\u00a0", " ")).strip()
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    joined = "\n".join(lines).casefold()
    values = {field: _line_value(lines, aliases) for field, aliases in _NUTRIENT_ALIASES.items()}
    calories = _energy_kcal(lines)

    basis_100 = re.search(r"(?:на|в|per)\s*100\s*(?:г(?:р)?|g|мл|ml)\b", joined)
    serving_match = re.search(
        r"(?:порц\w*|serving)[^\d]{0,20}" + _NUMBER_RE + r"\s*(?:г|g|мл|ml)\b",
        joined,
    )
    serving = _decimal(serving_match.group(1)) if serving_match else None
    warnings: list[str] = []
    basis_label: str | None = None
    factor = 1.0
    if basis_100:
        basis_label = "На 100 г/мл"
    elif serving:
        basis_label = f"Порция {serving:g} г/мл; пересчитано на 100"
        factor = 100.0 / serving
    elif any(value is not None for value in [calories, *values.values()]):
        basis_label = "Основа не распознана"
        warnings.append("Проверьте, указаны ли значения на 100 г или на порцию")

    def scaled(value: float | None, maximum: float) -> float | None:
        if value is None:
            return None
        result = round(value * factor, 2)
        return result if 0 <= result <= maximum else None

    nutrients = {field: scaled(value, 100) for field, value in values.items()}
    calories = scaled(calories, 1200)
    recognized = calories is not None or any(value is not None for value in nutrients.values())
    if not recognized:
        warnings.append("Пищевая ценность не распознана; попробуйте снять этикетку крупнее")
    confidence = min(max(float(ocr_confidence), 0.0), 1.0)
    if recognized and confidence == 0:
        confidence = 0.45
    return NutritionLabelRecognitionResponse(
        recognized=recognized,
        name_ru=None,
        basis_label=basis_label,
        serving_grams=serving,
        calories_kcal=calories,
        confidence=round(confidence, 2),
        warnings=warnings,
        **nutrients,
    )


async def recognize_nutrition_label(
    data: bytes,
    mime_type: str,
    settings: Settings,
) -> NutritionLabelRecognitionResponse:
    """Run local OCR and conservatively extract editable label fields."""
    if not is_local_ocr_config(settings):
        logger.error("local_ocr_rejected_non_local_configuration")
        raise NutritionLabelUnavailable("local_ocr_non_local_url")
    try:
        async with httpx.AsyncClient(timeout=settings.ocr_timeout_seconds) as client:
            response = await client.post(
                f"{settings.ocr_base_url.rstrip('/')}/recognize",
                headers={"Content-Type": mime_type},
                content=data,
            )
            response.raise_for_status()
        payload = response.json()
        text = str(payload["text"]).strip()
        confidence = float(payload.get("confidence") or 0)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        logger.warning("local_ocr_failed err_type={}", type(exc).__name__)
        raise NutritionLabelUnavailable("local_ocr_unavailable") from exc

    # Never queue label photos behind the single-slot language model: a model
    # may guess absent values, while the editable OCR draft is deterministic.
    return parse_ocr_text(text, ocr_confidence=confidence)
