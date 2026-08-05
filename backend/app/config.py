"""Runtime configuration loaded from AA360-prefixed environment variables."""

import base64
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings with safe development defaults and production checks."""

    # Pydantic reads local development values from .env while ignoring unrelated variables.
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AA360_", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./ai-athlete-360.db"
    jwt_access_token_minutes: int = 30
    jwt_secret: str = ""
    data_encryption_key: str = ""
    cors_origins: str = "http://localhost:3000"
    trusted_hosts: str = "localhost,127.0.0.1"
    api_public_url: str = "http://localhost:8080"
    app_public_url: str = "http://localhost:3000"
    email_delivery_mode: Literal["disabled", "console", "smtp"] = "disabled"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    mobile_otp_delivery_mode: Literal["disabled", "console", "twilio"] = "disabled"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    government_sso_authorization_url: str = ""
    government_sso_token_url: str = ""
    government_sso_userinfo_url: str = ""
    government_sso_client_id: str = ""
    government_sso_client_secret: str = ""
    government_sso_scope: str = "openid email profile"

    def validate_secrets(self) -> None:
        """Reject missing or weak secrets before a production process accepts requests."""
        if self.environment != "production":
            return
        if len(self.jwt_secret) < 32:
            raise RuntimeError("AA360_JWT_SECRET must be at least 32 characters in production.")
        if not self.data_encryption_key:
            raise RuntimeError("AA360_DATA_ENCRYPTION_KEY is required in production.")

    @property
    def resolved_jwt_secret(self) -> str:
        """Return the configured JWT signing secret or the development-only fallback."""
        return self.jwt_secret or "development-only-jwt-secret-do-not-deploy-2026"

    @property
    def resolved_data_encryption_key(self) -> str:
        """Return the configured Fernet key or the deterministic local-development key."""
        if self.data_encryption_key:
            return self.data_encryption_key
        # The fallback is intentionally public and is blocked by validate_secrets in production.
        return base64.urlsafe_b64encode(b"ai-athlete-360-development-key!!").decode("ascii")

    @property
    def cors_origin_list(self) -> List[str]:
        """Convert the comma-delimited origin setting into middleware-ready values."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def trusted_host_list(self) -> List[str]:
        """Convert the comma-delimited host setting into middleware-ready values."""
        return [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]

    def oauth_callback_url(self, provider: Literal["google", "government"]) -> str:
        """Build the registered API callback URL for the selected identity provider."""
        return f"{self.api_public_url.rstrip('/')}/v1/auth/{provider}/callback"