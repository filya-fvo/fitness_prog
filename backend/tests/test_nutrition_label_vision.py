import pytest

from app.core.config import Settings
from app.services import nutrition_label_vision
from app.services.nutrition_label_vision import (
    MAX_LABEL_IMAGE_BYTES,
    NutritionLabelImageError,
    detect_image_mime,
    parse_ocr_text,
    read_label_image,
)


class FakeUpload:
    def __init__(self, data: bytes, content_type: str = "image/jpeg") -> None:
        self.data = data
        self.content_type = content_type

    async def read(self, size: int) -> bytes:
        return self.data[:size]


class FakeOcrResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {
            "text": (
                "Пищевая ценность на 100 г\n"
                "Энергетическая ценность 929 кДж / 222 ккал\n"
                "Белки 7,5 г\nЖиры 12 г\nУглеводы 21 г"
            ),
            "confidence": 0.86,
        }


class FakeOcrClient:
    requests: list[dict] = []

    def __init__(self, **_kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "FakeOcrClient":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, url: str, *, headers: dict, content: bytes) -> FakeOcrResponse:
        self.requests.append({"url": url, "headers": headers, "content": content})
        return FakeOcrResponse()


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


def test_parser_keeps_kilojoules_separate_and_reads_decimal_comma():
    parsed = parse_ocr_text(
        "Пищевая ценность на 100 г\n"
        "Энергетическая ценность 929 кДж / 222 ккал\n"
        "Белки 7,5 г\nЖиры 12 г\nУглеводы 21 г",
        ocr_confidence=0.84,
    )

    assert parsed.recognized is True
    assert parsed.calories_kcal == 222
    assert parsed.proteins_g == 7.5
    assert parsed.fats_g == 12
    assert parsed.carbs_g == 21
    assert parsed.basis_label == "На 100 г/мл"


def test_parser_converts_explicit_serving_values_to_per_100():
    parsed = parse_ocr_text(
        "Порция 40 г\nЭнергетическая ценность 100 ккал\nБелки 4 г\nЖиры 2 г\nУглеводы 10 г"
    )

    assert parsed.calories_kcal == 250
    assert parsed.proteins_g == 10
    assert parsed.fats_g == 5
    assert parsed.carbs_g == 25
    assert parsed.serving_grams == 40


def test_parser_reads_values_split_onto_the_next_ocr_line():
    parsed = parse_ocr_text(
        "Пищевая ценность в 100 гр\n"
        "Энергетическая ценность\n929 кДж / 222 ккал\n"
        "Белок\n7,5 г\nЖиры\n12 г\nУглеводы\n21 г"
    )

    assert parsed.recognized is True
    assert parsed.calories_kcal == 222
    assert parsed.proteins_g == 7.5
    assert parsed.fats_g == 12
    assert parsed.carbs_g == 21
    assert parsed.basis_label == "На 100 г/мл"


@pytest.mark.asyncio
async def test_recognition_sends_image_only_to_local_ocr(
    monkeypatch: pytest.MonkeyPatch,
):
    FakeOcrClient.requests.clear()
    monkeypatch.setattr(nutrition_label_vision.httpx, "AsyncClient", FakeOcrClient)

    settings = Settings(
        ocr_base_url="http://ocr:8090",
        llm_provider="local",
        llm_base_url="http://llm:8080/v1",
    )

    result = await nutrition_label_vision.recognize_nutrition_label(
        b"\xff\xd8\xffphoto", "image/jpeg", settings
    )

    assert result.calories_kcal == 222
    assert result.proteins_g == 7.5
    assert FakeOcrClient.requests[0]["url"] == "http://ocr:8090/recognize"
    assert FakeOcrClient.requests[0]["content"] == b"\xff\xd8\xffphoto"


@pytest.mark.asyncio
async def test_external_ocr_host_is_rejected_before_sending_image(
    monkeypatch: pytest.MonkeyPatch,
):
    FakeOcrClient.requests.clear()
    monkeypatch.setattr(nutrition_label_vision.httpx, "AsyncClient", FakeOcrClient)
    settings = Settings(ocr_base_url="https://vision.example.com")

    with pytest.raises(nutrition_label_vision.NutritionLabelUnavailable):
        await nutrition_label_vision.recognize_nutrition_label(
            b"\xff\xd8\xffphoto", "image/jpeg", settings
        )

    assert FakeOcrClient.requests == []
