"""Print SMTP config status without leaking the password."""

from __future__ import annotations

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
    print("smtp_from_email=", s.smtp_from_email)
    print("smtp_username=", s.smtp_username)
    print("smtp_host=", s.smtp_host)
    print("smtp_port=", s.smtp_port)
    print("smtp_use_ssl=", s.smtp_use_ssl)
    print("password_set=", bool(pwd))
    print("password_len=", len(pwd))


if __name__ == "__main__":
    main()
