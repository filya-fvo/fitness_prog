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
    # Public HTTPS Mini App front (ngrok / prod). Used for Menu Button Open + /start web_app.
    mini_app_url: str = ""
    # Optional secret for Telegram webhook header X-Telegram-Bot-Api-Secret-Token
    telegram_webhook_secret: str = ""
    # Comma-separated Telegram usernames (without @) allowed to use admin CRUD / feedback target.
    # Example: Filatov_Slava
    admin_telegram_usernames: str = "Filatov_Slava"
    # Optional comma-separated Telegram numeric IDs (more stable than username).
    # Required for reliable feedback delivery if admin never opened the Mini App.
    admin_telegram_ids: str = ""
    jwt_secret: str = "replace_with_long_random_secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30
    cors_origins: str = "https://web.telegram.org"
    r2_access_key: str = ""
    r2_secret_key: str = ""
    r2_bucket: str = ""
    r2_endpoint: str = ""
    llm_api_key: str = ""
    llm_base_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    environment: str = "development"
    sentry_dsn: str = ""
    # Optional override for daily log files (default: <repo>/logs)
    log_dir: str = ""
    # How long to keep zipped day logs under logs/archive/
    log_archive_days: int = 30

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


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
