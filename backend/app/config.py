import secrets
import warnings
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"  # dev | test | prod
    database_url: str = "sqlite:///./data/app.db"
    jwt_secret: str = ""
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    bcrypt_rounds: int = 12
    cors_origins: list[str] = ["http://localhost:5173"]

    @model_validator(mode="after")
    def _secret(self) -> "Settings":
        if not self.jwt_secret:
            if self.app_env == "prod":
                raise ValueError("JWT_SECRET must be set in production")
            # Ephemeral secret for dev/test: tokens stop working when the process restarts.
            warnings.warn("JWT_SECRET not set; using an ephemeral secret", stacklevel=1)
            self.jwt_secret = secrets.token_urlsafe(48)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
