"""Offline label-corpus diagnostic; does not initialize application settings."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.nutrition_label_vision import parse_ocr_text  # noqa: E402


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_image(sample: dict, corpus: Path) -> bytes:
    path = corpus / sample["image"]
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != sample["sha256"]:
        raise ValueError(f"Image checksum mismatch: {sample['id']}")
    return data


def recognize(sample: dict, data: bytes, args: argparse.Namespace) -> tuple[str, float]:
    if args.mode == "manual-text":
        return sample["manual_nutrition_excerpt"], 0.0
    if args.mode == "tesseract":
        if not shutil.which("tesseract"):
            raise RuntimeError("Tesseract is unavailable on PATH; no OCR was run")
        from app.ocr_main import _run_tesseract

        return _run_tesseract(data)
    import httpx

    parsed_url = urlsplit(args.ocr_url)
    if (
        parsed_url.scheme != "http"
        or parsed_url.hostname not in {"127.0.0.1", "localhost", "::1", "ocr"}
        or parsed_url.username
        or parsed_url.password
        or parsed_url.query
        or parsed_url.fragment
    ):
        raise ValueError("Only the internal OCR service or HTTP loopback is allowed")
    with httpx.Client(timeout=35, follow_redirects=False, trust_env=False) as client:
        response = client.post(
            f"{args.ocr_url.rstrip('/')}/recognize",
            headers={"Content-Type": "image/jpeg"},
            content=data,
        )
        response.raise_for_status()
        payload = response.json()
    return str(payload["text"]), float(payload.get("confidence") or 0)


def compare(expected: object, actual: object) -> bool:
    if expected is None:
        return actual is None
    if isinstance(expected, (int, float)):
        return isinstance(actual, (int, float)) and math.isclose(
            float(expected), float(actual), abs_tol=0.01, rel_tol=0
        )
    return expected == actual


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("manual-text", "tesseract", "ocr-http"), required=True)
    parser.add_argument("--ocr-url", default="http://127.0.0.1:8090")
    parser.add_argument(
        "--corpus", type=Path,
        default=ROOT / "backend/tests/fixtures/nutrition_labels_20261006",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    manifest = read_json(args.corpus / "manifest.json")
    results = []
    passed_fields = total_fields = numeric_passed = numeric_total = 0
    complete_samples = 0
    for sample in manifest["samples"]:
        data = verify_image(sample, args.corpus)
        started = time.perf_counter()
        error = None
        try:
            text, confidence = recognize(sample, data, args)
        except Exception as exc:
            error = type(exc).__name__
            text, confidence = "", 0.0
        actual = parse_ocr_text(text, ocr_confidence=confidence).model_dump()
        elapsed = round(time.perf_counter() - started, 4)
        differences = []
        challenges = []
        for field, expected in sample["expected"].items():
            matched = compare(expected, actual[field])
            detail = {"field": field, "expected": expected, "actual": actual[field]}
            if field in sample["challenge_fields"]:
                challenges.append({**detail, "matched": matched})
                continue
            total_fields += 1
            passed_fields += int(matched)
            if isinstance(expected, (int, float)):
                numeric_total += 1
                numeric_passed += int(matched)
            if not matched:
                differences.append(detail)
        complete_samples += int(not differences)
        results.append({
            "id": sample["id"], "description_ru": sample["description_ru"],
            "input_text": text,
            "ocr_confidence": None if args.mode == "manual-text" else confidence,
            "error": error,
            "elapsed_seconds": elapsed, "actual": actual,
            "strict_differences": differences, "challenge_results": challenges,
        })
    report = {
        "mode": args.mode,
        "ocr_was_run": args.mode != "manual-text",
        "scope": (
            "Manual nutrition excerpts only; measures parser, not OCR or full-label extraction"
            if args.mode == "manual-text" else "Original images through OCR and current parser"
        ),
        "summary": {
            "samples": len(results), "strict_complete_samples": complete_samples,
            "strict_fields_matched": passed_fields, "strict_fields_total": total_fields,
            "explicit_numeric_fields_matched": numeric_passed,
            "explicit_numeric_fields_total": numeric_total,
            "challenge_fields_excluded": sum(
                len(sample["challenge_fields"]) for sample in manifest["samples"]
            ),
        },
        "results": results,
    }
    output = args.output or Path(__file__).with_name(f"results-{args.mode}.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=True))
    print(f"OCR was run: {report['ocr_was_run']}")
    return int(args.strict and passed_fields != total_fields)


if __name__ == "__main__":
    raise SystemExit(main())
