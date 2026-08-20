"""Extract editable nutrition facts from a package-label photo with Groq vision."""

from __future__ import annotations

import base64
import json
import re

import httpx
from loguru import logger
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.nutrition import NutritionLabelRecognitionResponse

MAX_LABEL_IMAGE_BYTES = 8 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class NutritionLabelImageError(ValueError):
    """The uploaded file is not a supported, bounded image."""


class NutritionLabelUnavailable(RuntimeError):
    """Vision recognition is not configured or the provider is unavailable."""


class NutritionLabelInvalidResponse(RuntimeError):
    """The provider returned no usable structured result."""


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


def build_label_request(
    data: bytes,
    mime_type: str,
    settings: Settings,
    *,
    model: str | None = None,
) -> dict:
    encoded = base64.b64encode(data).decode("ascii")
    instructions = (
        "Ты извлекаешь пищевую ценность только из видимого текста упаковки. "
        "Не угадывай отсутствующие числа. Переведи название продукта на русский. "
        "Верни калории, белки, жиры, углеводы и дополнительные нутриенты строго на 100 г. "
        "Если таблица дана на порцию и масса порции видна, пересчитай на 100 г. "
        "Не путай кДж и ккал. В basis_label кратко укажи исходную базу и пересчёт. "
        "Для отсутствующих значений используй null, а сомнения перечисли в warnings. "
        "recognized=true, если видна хотя бы часть пищевой ценности."
    )
    instructions += (
        " Верни только JSON-объект ровно с ключами: recognized, name_ru, basis_label, "
        "serving_grams, calories_kcal, proteins_g, fats_g, carbs_g, fiber_g, sugars_g, "
        "salt_g, confidence, warnings. Не добавляй markdown или другие ключи."
    )
    selected_model = model or settings.nutrition_vision_model.strip() or "qwen/qwen3.6-27b"
    task = (
        "Распознай название и таблицу пищевой ценности на фото упаковки. "
        "Подготовь проверяемый черновик для дневника питания."
    )
    # Groq documents Qwen Vision through chat.completions. JSON mode and
    # disabled reasoning keep hidden-thought text out of the editable draft.
    return {
        "model": selected_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"{instructions} {task}"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
                    },
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "reasoning_effort": "none",
        "temperature": 0.7,
        "top_p": 0.8,
        "max_completion_tokens": 800,
    }


def _response_text(payload: dict) -> str | None:
    choices = payload.get("choices") or []
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return None


def parse_label_response(payload: dict) -> NutritionLabelRecognitionResponse:
    raw = _response_text(payload)
    if not raw:
        raise NutritionLabelInvalidResponse("empty_provider_response")
    # Vision-capable reasoning models occasionally wrap otherwise valid JSON in
    # hidden-thought tags or a markdown fence despite JSON mode.
    raw = re.sub(r"<think\b[^>]*>.*?</think\s*>", "", raw, flags=re.IGNORECASE | re.DOTALL).strip()
    if re.search(r"<think\b[^>]*>", raw, flags=re.IGNORECASE):
        raise NutritionLabelInvalidResponse("unfinished_reasoning")
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", raw, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        raw = fenced.group(1).strip()
    try:
        parsed = json.loads(raw)
        return NutritionLabelRecognitionResponse.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise NutritionLabelInvalidResponse("invalid_provider_response") from exc


async def recognize_nutrition_label(
    data: bytes,
    mime_type: str,
    settings: Settings,
) -> NutritionLabelRecognitionResponse:
    if not settings.llm_api_key:
        raise NutritionLabelUnavailable("vision_not_configured")
    base_url = settings.llm_base_url.rstrip("/")
    model = settings.nutrition_vision_model.strip() or "qwen/qwen3.6-27b"
    body = build_label_request(data, mime_type, settings, model=model)
    async with httpx.AsyncClient(timeout=45.0) as client:
        try:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.llm_api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            return parse_label_response(response.json())
        except NutritionLabelInvalidResponse as exc:
            logger.warning("nutrition_label_invalid_response provider=groq model={}", model)
            raise NutritionLabelUnavailable("provider_invalid_response") from exc
        except (httpx.HTTPError, ValueError) as exc:
            status_code = (
                exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            )
            logger.warning(
                "nutrition_label_recognition_failed provider=groq model={} status={} err_type={}",
                model,
                status_code,
                type(exc).__name__,
            )
            raise NutritionLabelUnavailable("provider_unavailable") from exc
