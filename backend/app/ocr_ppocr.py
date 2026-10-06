"""Small, CPU-only PP-OCRv5 detector and Cyrillic/Latin recognizer."""
from __future__ import annotations

import hashlib
import statistics
from functools import lru_cache
from pathlib import Path

MODEL_DIR = Path("/app/ocr_models")
MODEL_HASHES = {
    "ch_PP-OCRv5_det_mobile.onnx": "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
    "cyrillic_PP-OCRv5_rec_mobile.onnx": "90f761b4bfcce0c8c561c0cb5c887b0971d3ec01c32164bdf7374a35b0982711",
}


def reconstruct_lines(records: list[dict]) -> str:
    """Order deskewed lines without merging unrelated columns or nutrient rows."""
    slopes = []
    for row in records:
        box = row["box"]
        dx = box[1][0] - box[0][0]
        if dx > 100:
            slopes.append((box[1][1] - box[0][1]) / dx)
    slope = statistics.median(slopes) if slopes else 0
    ordered = sorted(records, key=lambda row: (
        statistics.mean(point[1] - slope * point[0] for point in row["box"]),
        min(point[0] for point in row["box"]),
    ))
    return "\n".join(row["text"] for row in ordered)


@lru_cache(maxsize=1)
def load_components():
    """Verify local model files and initialize only the two required ONNX sessions."""
    import cv2
    import rapidocr
    from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion
    from rapidocr.ch_ppocr_det import TextDetector
    from rapidocr.ch_ppocr_rec import TextRecognizer
    from rapidocr.utils.parse_parameters import ParseParams

    for filename, expected in MODEL_HASHES.items():
        with (MODEL_DIR / filename).open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != expected:
                raise ValueError("ocr_model_checksum_mismatch")
    cv2.setNumThreads(1)
    cfg = ParseParams.load(Path(rapidocr.__file__).parent / "config.yaml")
    cfg = ParseParams.update_batch(cfg, {
        "Global.use_cls": False,
        "EngineConfig.onnxruntime.intra_op_num_threads": 1,
        "EngineConfig.onnxruntime.inter_op_num_threads": 1,
        "EngineConfig.onnxruntime.enable_cpu_mem_arena": False,
        "EngineConfig.onnxruntime.use_cuda": False,
        "Det.engine_type": EngineType.ONNXRUNTIME,
        "Det.lang_type": LangDet.CH,
        "Det.model_type": ModelType.MOBILE,
        "Det.ocr_version": OCRVersion.PPOCRV5,
        "Det.model_path": str(MODEL_DIR / "ch_PP-OCRv5_det_mobile.onnx"),
        "Det.limit_type": "max",
        "Det.limit_side_len": 1280,
        "Det.max_candidates": 256,
        "Rec.engine_type": EngineType.ONNXRUNTIME,
        "Rec.lang_type": LangRec.CYRILLIC,
        "Rec.model_type": ModelType.MOBILE,
        "Rec.ocr_version": OCRVersion.PPOCRV5,
        "Rec.model_path": str(MODEL_DIR / "cyrillic_PP-OCRv5_rec_mobile.onnx"),
        "Rec.rec_img_shape": [3, 48, 320],
        "Rec.rec_batch_num": 1,
    })
    cfg.Det.engine_cfg = cfg.EngineConfig.onnxruntime
    cfg.Rec.engine_cfg = cfg.EngineConfig.onnxruntime
    cfg.Rec.font_path = None
    cfg.Det.model_root_dir = str(MODEL_DIR)
    cfg.Rec.model_root_dir = str(MODEL_DIR)

    class EmbeddedDictionaryRecognizer(TextRecognizer):
        def get_character_dict(self, rec_cfg):
            if not self.session.have_key("character"):
                raise ValueError("ocr_model_dictionary_missing")
            return self.session.get_character_list(), None

    return TextDetector(cfg.Det), EmbeddedDictionaryRecognizer(cfg.Rec)


def run_ppocr(data: bytes) -> tuple[str, float]:
    import io
    import cv2
    import numpy as np
    from PIL import Image, ImageOps
    from rapidocr.ch_ppocr_rec import TextRecInput
    from rapidocr.utils.process_img import get_rotate_crop_image

    detector, recognizer = load_components()
    with Image.open(io.BytesIO(data)) as source:
        if source.width * source.height > 24_000_000:
            raise ValueError("ocr_image_pixel_limit")
        # JPEG draft decoding and early thumbnail avoid full-size EXIF/RGB copies.
        source.draft("RGB", (1280, 1280))
        source.thumbnail((1280, 1280))
        image = ImageOps.exif_transpose(source).convert("RGB")
        array = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    detected = detector(array)
    if detected.boxes is None or len(detected.boxes) == 0:
        return "", 0.0
    crops = [get_rotate_crop_image(array, box.copy()) for box in detected.boxes]
    read = recognizer(TextRecInput(img=crops, return_word_box=False))
    records = [
        {"text": text.strip(), "confidence": float(score), "box": box.tolist()}
        for box, text, score in zip(detected.boxes, read.txts, read.scores)
        if text.strip()
    ]
    confidence = statistics.mean(row["confidence"] for row in records) if records else 0.0
    return reconstruct_lines(records), round(min(max(confidence, 0), 1), 3)
