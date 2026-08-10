"""Try SMTP login only (no email send). Does not print password."""

from __future__ import annotations

import smtplib
import ssl
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import get_settings


def main() -> None:
    get_settings.cache_clear()
    s = get_settings()
    pwd = (s.smtp_password or "").strip()
    if not pwd:
        print("FAIL: SMTP_PASSWORD empty")
        raise SystemExit(1)

    user = s.smtp_username or s.smtp_from_email
    host = s.smtp_host
    port = int(s.smtp_port)
    print(f"connecting {host}:{port} as {user} ssl={s.smtp_use_ssl}")
    try:
        if s.smtp_use_ssl or port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as smtp:
                smtp.login(user, pwd)
        else:
            with smtplib.SMTP(host, port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(user, pwd)
        print("OK: SMTP login succeeded")
    except Exception as exc:
        print(f"FAIL: {type(exc).__name__}: {exc}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
