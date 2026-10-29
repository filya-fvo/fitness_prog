"""Preview by default. Publish one checked WEB/APK release only with --publish.

Run in the deployed API environment. No test sends, credentials or recipient data
are printed. --status --release-key KEY reads only aggregate durable receipts.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import select

from app.core.config import Settings
from app.core.database import AsyncSessionLocal
from app.models.release_notice import ReleaseNotice
from app.schemas.release_notice import APK_URL, ReleaseNoticePublish
from app.services.release_notices import notice_counts, overlay_counts, preview_audience, publish_notice

MANIFEST_URL = "https://app.filfitclub.ru/android/latest.json"
CERTIFICATE = "8a313fef52cf7e7b7f692760790b9d0f2b8af76ae9a0bdd69bc56f38d9a69472"
MAX_APK_BYTES = 200_000_000


async def verify_public_apk(body: ReleaseNoticePublish, client: httpx.AsyncClient) -> None:
    expected = {"versionCode": body.apk_version, "sha256": body.apk_sha256,
        "sourceCommit": body.source_commit, "sharedCommit": body.shared_commit,
        "certificateSha256": CERTIFICATE, "signatureVerified": True,
        "packageId": "ru.filfitclub.app", "apiOrigin": "https://api.filfitclub.ru"}

    async def metadata():
        response = await client.get(MANIFEST_URL, follow_redirects=False, headers={"Cache-Control": "no-cache"})
        response.raise_for_status()
        value = response.json()
        if any(value.get(key) != item for key, item in expected.items()):
            raise ValueError("Public APK metadata does not match the checked release")
        size = value.get("size")
        if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= MAX_APK_BYTES:
            raise ValueError("Public APK metadata has invalid size")
        return size

    size = await metadata()
    digest, received = hashlib.sha256(), 0
    async with client.stream("GET", APK_URL, follow_redirects=False, headers={"Cache-Control": "no-cache"}) as response:
        response.raise_for_status()
        async for block in response.aiter_bytes():
            received += len(block)
            if received > size:
                raise ValueError("Public APK bytes exceed checked size")
            digest.update(block)
    if received != size or digest.hexdigest() != body.apk_sha256:
        raise ValueError("Public APK bytes do not match the checked release")
    if await metadata() != size:
        raise ValueError("Public APK metadata changed during verification")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--release-key", required=True)
    result.add_argument("--status", action="store_true", help="Only aggregate receipt counts")
    result.add_argument("--title")
    result.add_argument("--message-file", type=Path)
    result.add_argument("--apk-version", type=int)
    result.add_argument("--apk-sha256")
    result.add_argument("--source-commit", help="Checked native source commit")
    result.add_argument("--shared-commit", help="Checked deployed WEB/shared commit")
    result.add_argument("--actor-id", type=UUID, help="Existing administrator account")
    result.add_argument("--expected-users", type=int, help="Preview total; required with --publish")
    result.add_argument("--publish", action="store_true", help="Create delivery receipts; worker sends them")
    return result


async def main(args: argparse.Namespace) -> None:
    if args.status:
        if args.publish:
            raise ValueError("--status cannot publish")
        async with AsyncSessionLocal() as session:
            notice = await session.scalar(select(ReleaseNotice).where(ReleaseNotice.release_key == args.release_key))
            if notice is None:
                raise ValueError("Release notice not found")
            print(json.dumps({"counts": await notice_counts(session, notice.id), **await overlay_counts(session, notice.id)}, ensure_ascii=False))
        return
    if not all((args.title, args.message_file, args.apk_version, args.apk_sha256,
                args.source_commit, args.shared_commit, args.actor_id)):
        raise ValueError("Title, message file, checked APK identity and administrator are required")
    body = ReleaseNoticePublish(release_key=args.release_key, title=args.title,
        message_text=args.message_file.read_text(encoding="utf-8-sig"), apk_version=args.apk_version,
        apk_sha256=args.apk_sha256, source_commit=args.source_commit, shared_commit=args.shared_commit)
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
        await verify_public_apk(body, client)
    async with AsyncSessionLocal() as session:
        counts = await preview_audience(session)
        total = sum(counts.values())
        if not args.publish:
            print(json.dumps({"mode": "preview", "public_apk_verified": True, "total": total, "channels": counts}, ensure_ascii=False))
            return
        if args.expected_users is None or args.expected_users != total:
            raise ValueError("Audience differs from --expected-users; preview again")
        notice = await publish_notice(session, body, actor_id=args.actor_id, settings=Settings())
        print(json.dumps({"mode": "published", "counts": await notice_counts(session, notice.id), **await overlay_counts(session, notice.id)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        asyncio.run(main(parser().parse_args()))
    except Exception as exc:
        # No raw HTTP/database exceptions: these may contain URLs or credentials.
        print(f"Release notice operation failed ({type(exc).__name__}); no automatic retry.", file=sys.stderr)
        raise SystemExit(1) from None
