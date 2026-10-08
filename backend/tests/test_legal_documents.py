from __future__ import annotations

import hashlib
import importlib
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "frontend/src/features/legal/documents"


def module():
    assert importlib.util.find_spec("app.services.legal_documents") is not None, "Legal document contract is missing"
    return importlib.import_module("app.services.legal_documents")


def test_current_documents_match_published_manifest():
    documents = module().current_documents()
    assert [doc.document_id for doc in documents] == ["privacy", "consent", "offer"]
    manifest = json.loads((DOCS / "manifest.json").read_text(encoding="utf-8"))
    for doc, entry in zip(documents, manifest, strict=True):
        text = (DOCS / entry["file"]).read_text(encoding="utf-8")
        assert doc.text_sha256 == hashlib.sha256(text.encode("utf-8")).hexdigest()
        assert doc.revision == "2026-10-08"
        assert "Проект для проверки" not in doc.text


def test_windows_and_container_text_hashes_match():
    normalize = module().normalize_document_text
    text = "Документ\nСтрока\n"
    assert hashlib.sha256(normalize(text.replace("\n", "\r\n")).encode()).hexdigest() == hashlib.sha256(text.encode()).hexdigest()
    assert normalize("А\rБ\r") == "А\nБ\n"


def test_changed_published_text_is_rejected(tmp_path):
    loader = module().load_documents
    for file in DOCS.iterdir():
        (tmp_path / file.name).write_bytes(file.read_bytes())
    with (tmp_path / "consent.md").open("a", encoding="utf-8") as stream:
        stream.write("changed purpose")
    with pytest.raises(ValueError, match="checksum"):
        loader(tmp_path)


def test_duplicate_or_missing_document_is_rejected(tmp_path):
    loader = module().load_documents
    for file in DOCS.iterdir():
        (tmp_path / file.name).write_bytes(file.read_bytes())
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    manifest[1] = manifest[0]
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="documents"):
        loader(tmp_path)


def test_backend_image_packages_canonical_documents():
    for filename in ["backend/Dockerfile", "Dockerfile"]:
        # Image contracts: each production layout must include the same legal files.
        assert "COPY frontend/src/features/legal/documents /docs/legal" in (ROOT / filename).read_text(encoding="utf-8")
