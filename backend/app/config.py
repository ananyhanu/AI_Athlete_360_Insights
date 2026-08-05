import base64
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AA360_", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./ai-athlete-360.db"
    jwt_access_token_minutes: int = 30
    jwt_secret: str = ""
    data_encryption_key: str = ""
    cors_origins: str = "http://localhost:3000"
    trusted_hosts: str = "localhost,127.0.0.1"

    def validate_secrets(self) -> None:
        if self.environment != "production":
            return
        if len(self.jwt_secret) < 32:
            raise RuntimeError("AA360_JWT_SECRET must be at least 32 characters in production.")
        if not self.data_encryption_key:
            raise RuntimeError("AA360_DATA_ENCRYPTION_KEY is required in production.")

    @property
    def resolved_jwt_secret(self) -> str:
        return self.jwt_secret or "development-only-jwt-secret-do-not-deploy-2026"

    @property
    def resolved_data_encryption_key(self) -> str:
        if self.data_encryption_key:
            return self.data_encryption_key
        return base64.urlsafe_b64encode(b"ai-athlete-360-development-key!!").decode("ascii")

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def trusted_host_list(self) -> List[str]:
        return [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]