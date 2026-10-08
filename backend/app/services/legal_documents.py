"""Load and verify the canonical texts shipped with both clients and API."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from app.schemas.legal import LegalDocument


def normalize_document_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def load_documents(directory: Path) -> tuple[LegalDocument, ...]:
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, list) or [item.get("document_id") for item in manifest] != ["privacy", "consent", "offer"]:
        raise ValueError("Invalid legal documents manifest")
    documents = []
    for entry in manifest:
        if entry.get("file") != f"{entry['document_id']}.md":
            raise ValueError("Invalid legal documents filename")
        text = normalize_document_text((directory / entry["file"]).read_text(encoding="utf-8"))
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        if digest != entry["text_sha256"]:
            raise ValueError("Published legal document checksum differs")
        documents.append(LegalDocument(**{key: value for key, value in entry.items() if key != "file"}, text=text))
    return tuple(documents)


@lru_cache(maxsize=1)
def current_documents() -> tuple[LegalDocument, ...]:
    packaged = Path("/docs/legal")
    local = Path(__file__).resolve().parents[3] / "frontend/src/features/legal/documents"
    return load_documents(packaged if packaged.is_dir() else local)
