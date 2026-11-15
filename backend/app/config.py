from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SUPABASE_URL: str = "https://example.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY: str = "replace-with-service-role-key"
    JWT_SECRET_KEY: str = "change-this-32-char-secret-key-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    GEMINI_API_KEY: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_APP_PASSWORD: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,https://frontend-two-opal-22.vercel.app"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Lowercase property aliases for backward compatibility across modules
    @property
    def supabase_url(self) -> str:
        return self.SUPABASE_URL

    @property
    def supabase_key(self) -> str:
        return self.SUPABASE_SERVICE_ROLE_KEY

    @property
    def jwt_secret_key(self) -> str:
        return self.JWT_SECRET_KEY

    @property
    def jwt_algorithm(self) -> str:
        return self.JWT_ALGORITHM

    @property
    def access_token_expire_minutes(self) -> int:
        return self.ACCESS_TOKEN_EXPIRE_MINUTES

    @property
    def gemini_api_key(self) -> str:
        return self.GEMINI_API_KEY

    @property
    def gmail_sender(self) -> str:
        return self.SMTP_USER

    @property
    def gmail_app_password(self) -> str:
        return self.SMTP_APP_PASSWORD

    @property
    def frontend_url(self) -> str:
        return self.ALLOWED_ORIGINS


settings = Settings()


@lru_cache()
def get_settings() -> Settings:
    return settings
