"""Download portable Redis for Windows into tools/redis (no admin/MSI)."""
from __future__ import annotations

import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "tools" / "redis"
ZIP_PATH = ROOT / "tools" / "redis-win.zip"

URLS = [
    # tporadowski Redis 5.x Windows builds
    "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-192.168.1.1.zip",
    "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip",
    # Microsoft archive Redis 3.0.504
    "https://github.com/microsoftarchive/redis/releases/download/win-3.0.504/Redis-x64-3.0.504.zip",
]


def main() -> int:
    DEST.mkdir(parents=True, exist_ok=True)
    ok = False
    for url in URLS:
        print(f"TRY {url}")
        try:
            urllib.request.urlretrieve(url, ZIP_PATH)
            size = ZIP_PATH.stat().st_size
            print(f"  size={size}")
            if size > 100_000:
                ok = True
                break
        except Exception as exc:  # noqa: BLE001
            print(f"  fail: {exc}")
    if not ok:
        print("ERROR: could not download Redis zip")
        return 2

    # clean dest except zip
    for p in list(DEST.iterdir()):
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        else:
            try:
                p.unlink()
            except OSError:
                pass

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        zf.extractall(DEST)

    servers = list(DEST.rglob("redis-server.exe"))
    print("servers:", [str(s) for s in servers])
    if not servers:
        print("ERROR: redis-server.exe not found in archive")
        return 3

    server_dir = servers[0].parent
    if server_dir.resolve() != DEST.resolve():
        for f in server_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, DEST / f.name)

    server = DEST / "redis-server.exe"
    cli = DEST / "redis-cli.exe"
    print("has redis-server:", server.exists())
    print("has redis-cli:", cli.exists())
    if not server.exists():
        return 4

    # minimal conf
    conf = DEST / "redis.windows.conf"
    if not conf.exists():
        conf.write_text(
            "\n".join(
                [
                    "bind 127.0.0.1",
                    "port 6379",
                    "protected-mode yes",
                    "save \"\"",
                    "appendonly no",
                    "",
                ]
            ),
            encoding="utf-8",
        )
    print("OK installed to", DEST)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
