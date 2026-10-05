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
    storage_dir: str = "./storage"
    # "thread": background worker thread polls the jobs table. "inline": run jobs immediately (tests).
    jobs_mode: str = "thread"
    # Photo analysis (M5). vision_mode: "auto" = use the Gemini API when credentials exist, else off;
    # "gemini" | "off" | "mock" (mock returns "uncertain" for everything: exercises the pipeline only).
    vision_mode: str = "auto"
    vision_model: str = "gemini-3.8-flash"
    vision_effort: str = "high"  # Gemini thinking_level: low | medium | high
    gemini_api_key: str = ""
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
