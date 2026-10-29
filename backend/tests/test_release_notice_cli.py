"""Public APK verification never accepts caller-controlled URLs or redirects."""
import importlib.util
from pathlib import Path

import httpx
import pytest


def cli():
    spec = importlib.util.spec_from_file_location("publish_release_notice", Path(__file__).resolve().parents[1] / "scripts/publish_release_notice.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.asyncio
async def test_cli_verifies_download_bytes_and_manifest_identity_without_sending():
    import hashlib
    from app.schemas.release_notice import ReleaseNoticePublish
    data = b"signed checked APK fixture"
    fingerprint = hashlib.sha256(data).hexdigest()
    body = ReleaseNoticePublish(release_key="apk-27", title="Обновление", message_text="Изменения", apk_version=27,
        apk_sha256=fingerprint, source_commit="b" * 40, shared_commit="c" * 40)
    manifest = {"versionCode": 27, "sha256": fingerprint, "sourceCommit": "b" * 40, "sharedCommit": "c" * 40,
        "size": len(data), "signatureVerified": True, "certificateSha256": "8a313fef52cf7e7b7f692760790b9d0f2b8af76ae9a0bdd69bc56f38d9a69472",
        "packageId": "ru.filfitclub.app", "apiOrigin": "https://api.filfitclub.ru"}
    async def respond(request):
        assert request.url.host == "app.filfitclub.ru"
        if request.url.path.endswith(".json"):
            return httpx.Response(200, json=manifest)
        assert request.url.path == "/android/latest.apk"
        return httpx.Response(200, content=data)
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        await cli().verify_public_apk(body, client)
        manifest["sourceCommit"] = "d" * 40
        with pytest.raises(ValueError, match="metadata"):
            await cli().verify_public_apk(body, client)
        manifest["sourceCommit"] = "b" * 40
        data = b"wrong bytes with same metadata"
        with pytest.raises(ValueError, match="bytes"):
            await cli().verify_public_apk(body, client)
