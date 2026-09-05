"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env (not cwd-dependent). utf-8-sig strips BOM from editors.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """Runtime configuration for the FastAPI backend."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8-sig",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/fitness"
    bot_token: str = "replace_with_telegram_bot_token"
    bot_username: str = ""  # e.g. fil_fit_bot — for Mini App deep links
    # Public OIDC client id shown by BotFather for browser Telegram Login.
    # Telegram currently uses the numeric bot id; when empty, it is derived
    # from the non-secret prefix of BOT_TOKEN.
    telegram_login_client_id: str = ""
    # Public HTTPS Mini App front (local Tailscale or permanent production host).
    mini_app_url: str = ""
    # Public API host from the Compose environment. The notification worker uses
    # it only to restore the same Telegram webhook after a delivery timeout.
    api_domain: str = ""
    # Telegram webhook header X-Telegram-Bot-Api-Secret-Token; required in production.
    telegram_webhook_secret: str = ""
    # Comma-separated Telegram usernames (without @) allowed to use admin tools.
    # Example: Filatov_Slava
    admin_telegram_usernames: str = ""
    # Optional comma-separated Telegram numeric IDs (more stable than username).
    # Optional stable alternative to username-based administrator access.
    admin_telegram_ids: str = ""
    # Dedicated private chat used by the explicit write Telegram delivery smoke.
    admin_smoke_telegram_id: int | None = None
    # Optional directory with small allowlisted host status JSON files.
    # It is mounted read-only in production; the API never receives Docker access.
    admin_system_status_dir: str = ""
    jwt_secret: str = "replace_with_long_random_secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30
    cors_origins: str = "https://web.telegram.org"
    # Standards-based Web Push (VAPID). Private key stays backend-only.
    web_push_vapid_public_key: str = ""
    web_push_vapid_private_key: str = ""
    web_push_vapid_subject: str = "mailto:admin@example.com"
    # Local llama.cpp server. Production rejects non-local hosts, so user data is
    # never sent to an external AI provider by a configuration mistake.
    llm_provider: str = "local"
    llm_api_key: str = ""
    llm_base_url: str = "http://llm:8080/v1"
    llm_model: str = "qwen2.5-3b-instruct"
    llm_timeout_seconds: float = 75.0
    llm_max_output_tokens: int = 320
    # Tesseract is a separate internal-only container. The API sends it the
    # image, then gives only extracted text to the local language model.
    ocr_base_url: str = "http://ocr:8090"
    ocr_timeout_seconds: float = 35.0
    redis_url: str = "redis://localhost:6379/0"
    environment: str = "development"
    sentry_dsn: str = ""
    # Optional override for daily log files (default: <repo>/logs)
    log_dir: str = ""
    # How long to keep zipped day logs under logs/archive/
    log_archive_days: int = 30

    # --- Email OTP login (browser) ---
    # From-address / SMTP login (Mail.ru: full mailbox address).
    smtp_from_email: str = "fil_fit_bot@mail.ru"
    smtp_from_name: str = "Fitness Trainer"
    smtp_host: str = "smtp.mail.ru"
    smtp_port: int = 465
    smtp_username: str = "fil_fit_bot@mail.ru"
    # Mailbox password or Mail.ru app password. Empty → codes only logged in development.
    smtp_password: str = ""
    smtp_use_ssl: bool = True
    # OTP policy
    email_otp_ttl_minutes: int = 10
    email_otp_length: int = 6
    email_otp_max_attempts: int = 5
    email_otp_resend_seconds: int = 60
    email_otp_ip_hourly_limit: int = 20
    # Dev helper: include plaintext code in API response when SMTP is not configured.
    email_otp_dev_return_code: bool = True

    @property
    def admin_username_set(self) -> set[str]:
        return {
            u.strip().lstrip("@").lower()
            for u in self.admin_telegram_usernames.split(",")
            if u.strip()
        }

    @property
    def admin_telegram_id_set(self) -> set[int]:
        out: set[int] = set()
        for part in self.admin_telegram_ids.split(","):
            p = part.strip()
            if not p:
                continue
            try:
                out.add(int(p))
            except ValueError:
                continue
        return out

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def effective_telegram_login_client_id(self) -> str | None:
        """Return a validated public Telegram Login client id."""
        explicit = self.telegram_login_client_id.strip()
        candidate = explicit or self.bot_token.partition(":")[0].strip()
        if not candidate.isdigit() or int(candidate) <= 0:
            return None
        return candidate


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
