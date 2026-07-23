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

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
