"""Build-time download of pinned OCR weights; never called during inference."""
from pathlib import Path
import hashlib
import urllib.request

BASE = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5"
MODELS = {
    "ch_PP-OCRv5_det_mobile.onnx": (
        "det", "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae"),
    "cyrillic_PP-OCRv5_rec_mobile.onnx": (
        "rec", "90f761b4bfcce0c8c561c0cb5c887b0971d3ec01c32164bdf7374a35b0982711"),
}
directory = Path("/app/ocr_models")
directory.mkdir(parents=True, exist_ok=True)
for filename, (kind, expected) in MODELS.items():
    with urllib.request.urlopen(f"{BASE}/{kind}/{filename}", timeout=120) as response:
        data = response.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"OCR weight verification failed: {filename}")
    (directory / filename).write_bytes(data)
