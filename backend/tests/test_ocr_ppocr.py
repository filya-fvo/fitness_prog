"""OCR backend selection and reading-order regressions without ONNX dependencies."""
from types import SimpleNamespace
import sys

from fastapi.testclient import TestClient
from app import ocr_main
from app.ocr_ppocr import reconstruct_lines


def test_rotated_lines_follow_their_baseline_instead_of_raw_top_coordinates() -> None:
    records = [
        {"text": "Белки 4,7 г", "box": [[0, 120], [300, 150], [300, 160], [0, 130]]},
        {"text": "Пищевая", "box": [[220, 132], [380, 148], [380, 158], [220, 142]]},
        {"text": "ценность на 100 г", "box": [[0, 140], [300, 170], [300, 180], [0, 150]]},
    ]
    assert reconstruct_lines(records).splitlines() == [
        "Пищевая", "Белки 4,7 г", "ценность на 100 г",
    ]


def test_empty_detector_result_is_empty_text() -> None:
    assert reconstruct_lines([]) == ""


def test_private_service_selects_ppocr_without_changing_its_contract(monkeypatch) -> None:
    observed = []

    def fake_run(data):
        observed.append(data)
        return "Белки 4,7 г", 0.91

    monkeypatch.setenv("OCR_ENGINE", "ppocr")
    monkeypatch.setitem(sys.modules, "app.ocr_ppocr", SimpleNamespace(run_ppocr=fake_run))
    with TestClient(ocr_main.app) as client:
        response = client.post("/recognize", content=b"test-image", headers={"Content-Type": "image/jpeg"})
    assert response.status_code == 200
    assert response.json() == {"text": "Белки 4,7 г", "confidence": 0.91}
    assert observed == [b"test-image"]
