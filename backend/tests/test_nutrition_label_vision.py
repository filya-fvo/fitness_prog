import json

import pytest

from app.core.config import Settings
from app.services.nutrition_label_vision import (
    MAX_LABEL_IMAGE_BYTES,
    NutritionLabelImageError,
    build_label_request,
    detect_image_mime,
    parse_label_response,
    read_label_image,
)


class FakeUpload:
    def __init__(self, data: bytes, content_type: str = "image/jpeg") -> None:
        self.data = data
        self.content_type = content_type

    async def read(self, size: int) -> bytes:
        return self.data[:size]


def test_detect_image_mime_uses_magic_bytes():
    assert detect_image_mime(b"\xff\xd8\xffrest") == "image/jpeg"
    assert detect_image_mime(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert detect_image_mime(b"RIFF1234WEBPrest") == "image/webp"
    assert detect_image_mime(b"not-an-image") is None


@pytest.mark.asyncio
async def test_read_label_image_rejects_oversize_and_fake_image():
    with pytest.raises(NutritionLabelImageError, match="image_too_large"):
        await read_label_image(FakeUpload(b"\xff\xd8\xff" + b"x" * MAX_LABEL_IMAGE_BYTES))
    with pytest.raises(NutritionLabelImageError, match="unsupported_image"):
        await read_label_image(FakeUpload(b"plain text"))


def test_label_request_uses_groq_vision_and_json_mode():
    settings = Settings(nutrition_vision_model="qwen/qwen3.6-27b")
    body = build_label_request(b"\xff\xd8\xffphoto", "image/jpeg", settings)

    assert body["model"] == "qwen/qwen3.6-27b"
    assert body["response_format"] == {"type": "json_object"}
    assert body["reasoning_effort"] == "none"
    assert body["messages"][0]["content"][1]["type"] == "image_url"
    assert body["messages"][0]["content"][1]["image_url"]["url"].startswith(
        "data:image/jpeg;base64,"
    )
    assert "ровно с ключами" in body["messages"][0]["content"][0]["text"]


def test_parse_label_response_accepts_chat_completion():
    result = {
        "recognized": False,
        "name_ru": None,
        "basis_label": None,
        "serving_grams": None,
        "calories_kcal": None,
        "proteins_g": None,
        "fats_g": None,
        "carbs_g": None,
        "fiber_g": None,
        "sugars_g": None,
        "salt_g": None,
        "confidence": 0,
        "warnings": ["Текст не виден"],
    }
    payload = {
        "choices": [{"message": {"content": json.dumps(result, ensure_ascii=False)}}]
    }

    parsed = parse_label_response(payload)

    assert parsed.recognized is False
    assert parsed.warnings == ["Текст не виден"]


def test_parse_label_response_strips_reasoning_and_json_fence():
    raw = {
        "recognized": True,
        "name_ru": "Йогурт",
        "basis_label": "На 100 г",
        "serving_grams": None,
        "calories_kcal": 80,
        "proteins_g": 5,
        "fats_g": 2,
        "carbs_g": 10,
        "fiber_g": None,
        "sugars_g": None,
        "salt_g": None,
        "confidence": 0.9,
        "warnings": [],
    }
    payload = {
        "choices": [{
            "message": {
                "content": "<think>internal OCR reasoning</think>```json\n"
                + json.dumps(raw, ensure_ascii=False)
                + "\n```"
            }
        }]
    }

    assert parse_label_response(payload).name_ru == "Йогурт"
