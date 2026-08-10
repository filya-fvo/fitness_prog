"""Append SMTP email-auth settings to backend/.env if missing."""

from __future__ import annotations

from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / ".env"
BLOCK = """
# --- Email OTP login (browser) ---
SMTP_FROM_EMAIL=fil_fit_bot@mail.ru
SMTP_FROM_NAME=Fil Fit
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_USERNAME=fil_fit_bot@mail.ru
SMTP_PASSWORD=
SMTP_USE_SSL=true
EMAIL_OTP_TTL_MINUTES=10
EMAIL_OTP_LENGTH=6
EMAIL_OTP_MAX_ATTEMPTS=5
EMAIL_OTP_RESEND_SECONDS=60
EMAIL_OTP_DEV_RETURN_CODE=true
"""


def main() -> None:
    text = ENV.read_text(encoding="utf-8") if ENV.exists() else ""
    if "SMTP_FROM_EMAIL" in text:
        print("env_smtp_exists")
        return
    with ENV.open("a", encoding="utf-8") as f:
        if text and not text.endswith("\n"):
            f.write("\n")
        f.write(BLOCK.lstrip("\n") if not text.endswith("\n\n") else BLOCK)
    print("env_smtp_appended")


if __name__ == "__main__":
    main()
