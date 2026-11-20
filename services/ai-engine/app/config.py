from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "postgresql://postgres:postgres_password_dev@localhost:5432/sih26043_db?schema=public"
    )
    INTERNAL_AI_SERVICE_KEY: str = "dev_internal_ai_service_secret_key"
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"
    DEDUP_SIMILARITY_THRESHOLD: float = 0.85
    SOFT_CAPACITY_PENALTY: float = 0.25
    HARD_CAPACITY_PENALTY: float = 0.45

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
