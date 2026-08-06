"""FastAPI application factory, HTTP security policy, and authenticated API routes."""

from contextlib import asynccontextmanager
import json
from typing import AsyncGenerator, Generator, List, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .assessment_service import ConflictError, PayloadCipher, ResourceNotFoundError, delete_test_result, get_test_history, require_owned_athlete, save_test_result
from .athlete_service import create_athlete, delete_athlete, get_athlete, list_athletes, synchronize_athlete, update_athlete
from .auth_service import (
    authenticate_user,
    complete_oauth_callback,
    oauth_authorization_url,
    register_coach,
    request_mobile_otp,
    update_last_login,
    verify_email,
    verify_mobile_otp,
)
from .config import Settings
from .database import Database
from .models import User
from .schemas import (
    Athlete,
    AthleteDraft,
    AthleteUpdate,
    AssessmentAttempt,
    AuthenticatedUser,
    CoachSignupRequest,
    MobileOtpRequest,
    MobileOtpVerification,
    TokenRequest,
    TokenResponse,
)
from .security import Principal, create_access_token, get_current_principal, require_permission


def create_app(settings: Settings = None) -> FastAPI:
    """Build a configured API instance with its database, encryption, middleware, and routes."""
    active_settings = settings or Settings()
    active_settings.validate_secrets()
    database = Database(active_settings.database_url)
    cipher = PayloadCipher(active_settings.resolved_data_encryption_key)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        """Ensure mapped tables exist before serving requests in every environment."""
        database.create_schema()
        yield

    app = FastAPI(title="AI Athlete 360 API", version="0.1.0", lifespan=lifespan)
    app.state.settings = active_settings
    app.state.database = database
    app.state.cipher = cipher

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, error: HTTPException):
        """Normalize expected HTTP errors into the public code-and-message response shape."""
        detail = error.detail if isinstance(error.detail, dict) else {}
        code = detail.get("code", "request_failed")
        message = detail.get("message", "The request could not be completed.")
        return JSONResponse(
            status_code=error.status_code,
            content={"code": code, "message": message},
            headers=error.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, __: RequestValidationError):
        """Hide validation internals while consistently identifying invalid API input."""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"code": "validation_failed", "message": "Request validation failed."},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-ID"],
        allow_methods=["DELETE", "GET", "POST", "PUT", "PATCH"],
        allow_origins=active_settings.cors_origin_list,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=active_settings.trusted_host_list)
    if active_settings.environment == "production":
        app.add_middleware(HTTPSRedirectMiddleware)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        """Attach request correlation and browser hardening headers to every response."""
        # Carry one bounded correlation ID across responses so client and server logs can be matched safely.
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid4())
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id[:120]
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        # Athlete and assessment responses can contain sensitive information and must not be browser-cached.
        response.headers["Cache-Control"] = "no-store"
        if active_settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.get("/healthz")
    def healthz():
        """Return the lightweight liveness signal used by platform health checks."""
        return {"status": "ok"}

    @app.get("/", include_in_schema=False)
    def api_root():
        """Send browser visits to the frontend rather than exposing an API-only 404 page."""
        return RedirectResponse(active_settings.app_public_url)

    @app.post("/v1/auth/token", response_model=TokenResponse)
    def create_token(credentials: TokenRequest, session: Session = Depends(database_session(database))):
        """Authenticate a verified active user and return a short-lived bearer token."""
        user = authenticate_user(session, str(credentials.email), credentials.password)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_credentials"})
        if not user.email_verified and not user.mobile_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "verification_required", "message": "Verify your email link or mobile OTP before signing in."},
            )
        update_last_login(session, user)
        return token_response(user, active_settings)

    @app.post("/v1/auth/signup", status_code=status.HTTP_202_ACCEPTED)
    def signup_coach(request: CoachSignupRequest, session: Session = Depends(database_session(database))):
        """Begin coach registration without revealing whether an account already exists."""
        try:
            register_coach(
                session,
                active_settings,
                str(request.email),
                request.password,
                request.mobile_number,
            )
        except RuntimeError as error:
            raise configuration_error(str(error))
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "invalid_mobile_number", "message": str(error)})
        return {"message": "If this email can be registered, a verification link has been sent."}

    @app.get("/v1/auth/verify-email")
    def verify_email_link(token: str, session: Session = Depends(database_session(database))):
        """Consume an email-verification link and report its success or safe failure."""
        try:
            verify_email(session, token)
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_verification_link", "message": str(error)})
        return {"message": "Email verified. You can return to AI Athlete 360 and sign in."}

    @app.post("/v1/auth/mobile-otp", status_code=status.HTTP_202_ACCEPTED)
    def send_mobile_otp(request: MobileOtpRequest, session: Session = Depends(database_session(database))):
        """Request a mobile OTP without exposing whether the account details exist."""
        try:
            development_otp = request_mobile_otp(
                session,
                active_settings,
                str(request.email),
                request.mobile_number,
            )
        except RuntimeError as error:
            raise configuration_error(str(error))
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "invalid_mobile_number", "message": str(error)})
        response = {"message": "If the account details match, a verification code has been sent."}
        if development_otp:
            response["developmentOtp"] = development_otp
        return response

    @app.post("/v1/auth/mobile-otp/verify", response_model=TokenResponse)
    def complete_mobile_otp(request: MobileOtpVerification, session: Session = Depends(database_session(database))):
        """Verify a mobile challenge and issue an authenticated coach session."""
        try:
            access_token, user = verify_mobile_otp(session, active_settings, str(request.email), request.otp)
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_mobile_otp", "message": str(error)})
        return token_response(user, active_settings, access_token)

    @app.get("/v1/auth/google/start")
    def start_google_oauth(session: Session = Depends(database_session(database))):
        """Redirect the browser to Google with a server-tracked OAuth state value."""
        try:
            return RedirectResponse(oauth_authorization_url(session, active_settings, "google"))
        except RuntimeError as error:
            raise configuration_error(str(error))

    @app.get("/v1/auth/google/callback")
    def complete_google_oauth(
        code: str,
        state: str,
        session: Session = Depends(database_session(database)),
    ):
        """Complete the Google callback and redirect the frontend with the new access token."""
        return complete_oauth_redirect(session, active_settings, "google", code, state)

    @app.get("/v1/auth/government/start")
    def start_government_sso(session: Session = Depends(database_session(database))):
        """Redirect the browser to the configured government SSO provider with protected state."""
        try:
            return RedirectResponse(oauth_authorization_url(session, active_settings, "government"))
        except RuntimeError as error:
            raise configuration_error(str(error))

    @app.get("/v1/auth/government/callback")
    def complete_government_sso(
        code: str,
        state: str,
        session: Session = Depends(database_session(database)),
    ):
        """Complete the government SSO callback and redirect the frontend with a session token."""
        return complete_oauth_redirect(session, active_settings, "government", code, state)

    @app.get("/v1/auth/me", response_model=AuthenticatedUser)
    def current_user(principal: Principal = Depends(get_current_principal), session: Session = Depends(database_session(database))):
        """Return the currently authenticated user's non-sensitive identity details."""
        user = session.get(User, principal.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "authentication_required"})
        return authenticated_user(user)

    @app.post("/v1/assessment-attempts", response_model=AssessmentAttempt, status_code=status.HTTP_201_CREATED)
    def save_assessment(
        attempt: AssessmentAttempt,
        response: Response,
        request: Request,
        idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=180),
        principal: Principal = Depends(require_permission("assessment:perform")),
        session: Session = Depends(database_session(database)),
    ):
        """Create or update an owned encrypted assessment with request replay protection."""
        try:
            saved, created = save_test_result(
                session,
                cipher,
                principal,
                attempt,
                idempotency_key,
                request.headers.get("X-Correlation-ID", "missing-correlation-id")[:120],
            )
        except ConflictError as error:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": error.code, "message": error.message})
        except ResourceNotFoundError as error:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": error.code, "message": error.message})
        # A same-version replay is a successful read of the prior write; a new revision is created.
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return AssessmentAttempt.model_validate(saved)

    @app.post("/v1/athletes", response_model=Athlete, status_code=status.HTTP_201_CREATED)
    def save_athlete(
        draft: AthleteDraft,
        response: Response,
        request: Request,
        idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=180),
        principal: Principal = Depends(require_permission("athlete:register")),
        session: Session = Depends(database_session(database)),
    ):
        """Create an encrypted athlete record after consent, authorization, and idempotency checks."""
        if draft.consent_status != "granted":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "consent_required"})
        try:
            saved, created = create_athlete(
                session,
                cipher,
                principal,
                draft,
                idempotency_key,
                request.headers.get("X-Correlation-ID", "missing-correlation-id")[:120],
            )
        except ConflictError as error:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": error.code, "message": error.message})
        # Preserve HTTP idempotency semantics for a repeated create request.
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Athlete.model_validate(saved)

    @app.get("/v1/athletes", response_model=List[Athlete])
    def list_owned_athletes(
        principal: Principal = Depends(require_permission("athlete:read-assigned")),
        session: Session = Depends(database_session(database)),
    ):
        """List athlete profiles assigned to the authenticated principal."""
        return [Athlete.model_validate(item) for item in list_athletes(session, cipher, principal)]

    @app.get("/v1/athletes/{athlete_id}", response_model=Athlete)
    def get_owned_athlete(
        athlete_id: str,
        principal: Principal = Depends(require_permission("athlete:read-assigned")),
        session: Session = Depends(database_session(database)),
    ):
        """Return one owned athlete profile without revealing another coach's assignment."""
        athlete = get_athlete(session, cipher, principal, athlete_id)
        if not athlete:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "athlete_not_found"})
        return Athlete.model_validate(athlete)

    @app.patch("/v1/athletes/{athlete_id}", response_model=Athlete)
    def patch_owned_athlete(
        athlete_id: str,
        update: AthleteUpdate,
        request: Request,
        idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=180),
        expected_version: int = Header(..., alias="If-Match", ge=1),
        principal: Principal = Depends(require_permission("athlete:register")),
        session: Session = Depends(database_session(database)),
    ):
        """Apply a versioned, idempotent patch to an owned encrypted athlete profile."""
        try:
            athlete = update_athlete(
                session,
                cipher,
                principal,
                athlete_id,
                update,
                expected_version,
                idempotency_key,
                request.headers.get("X-Correlation-ID", "missing-correlation-id")[:120],
            )
        except ConflictError as error:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": error.code, "message": error.message})
        if not athlete:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "athlete_not_found"})
        return Athlete.model_validate(athlete)

    @app.delete("/v1/athletes/{athlete_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_owned_athlete(
        athlete_id: str,
        request: Request,
        principal: Principal = Depends(require_permission("athlete:register")),
        session: Session = Depends(database_session(database)),
    ):
        """Permanently delete one owned athlete together with its persisted assessment history."""
        deleted = delete_athlete(
            session,
            principal,
            athlete_id,
            request.headers.get("X-Correlation-ID", "missing-correlation-id")[:120],
        )
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "athlete_not_found"})
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.put("/v1/athletes/{athlete_id}/sync", response_model=Athlete, status_code=status.HTTP_201_CREATED)
    def synchronize_owned_athlete(
        athlete_id: str,
        athlete: Athlete,
        response: Response,
        request: Request,
        idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=180),
        principal: Principal = Depends(require_permission("athlete:register")),
        session: Session = Depends(database_session(database)),
    ):
        """Synchronize an offline athlete revision while preserving its stable identity."""
        # The path and encrypted payload must identify the same athlete before synchronization.
        if str(athlete.id) != athlete_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "athlete_id_mismatch"})
        try:
            saved, created = synchronize_athlete(
                session,
                cipher,
                principal,
                athlete,
                idempotency_key,
                request.headers.get("X-Correlation-ID", "missing-correlation-id")[:120],
            )
        except ConflictError as error:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": error.code, "message": error.message})
        if not saved:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "athlete_not_found"})
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Athlete.model_validate(saved)

    @app.get("/v1/athletes/{athlete_id}/assessment-attempts", response_model=List[AssessmentAttempt])
    def list_assessments(
        athlete_id: str,
        principal: Principal = Depends(require_permission("athlete:read-assigned")),
        session: Session = Depends(database_session(database)),
    ):
        """List decrypted assessment attempts only after verifying athlete ownership."""
        try:
            require_owned_athlete(session, principal, athlete_id)
        except ResourceNotFoundError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": error.code, "message": error.message})
        return [
            AssessmentAttempt.model_validate(item)
            for item in get_test_history(session, cipher, athlete_id)
        ]

    @app.delete(
        "/v1/athletes/{athlete_id}/assessment-attempts/{attempt_id}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    def delete_assessment(
        athlete_id: str,
        attempt_id: str,
        request: Request,
        principal: Principal = Depends(require_permission("assessment:perform")),
        session: Session = Depends(database_session(database)),
    ):
        """Permanently delete one assessment attempt belonging to the caller's athlete."""
        deleted = delete_test_result(
            session,
            principal,
            athlete_id,
            attempt_id,
            request.headers.get("X-Correlation-ID", "missing-correlation-id")[:120],
        )
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "assessment_not_found"})
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


def database_session(database: Database):
    """Create a FastAPI dependency that owns and closes one request database session."""
    def dependency() -> Generator[Session, None, None]:
        """Yield the request-scoped session and close it even when route handling fails."""
        session = database.session()
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return dependency


# ASGI servers import this module-level instance; tests call create_app with isolated settings instead.
app = create_app()


def authenticated_user(user: User) -> AuthenticatedUser:
    """Transform an ORM user into the non-sensitive identity sent to the frontend."""
    return AuthenticatedUser(id=user.id, email=user.email, roles=json.loads(user.roles_json))


def token_response(user: User, settings: Settings, access_token: str | None = None) -> TokenResponse:
    """Build a token response, reusing an already-issued OTP or OAuth token when provided."""
    return TokenResponse(
        access_token=access_token or create_access_token(user, settings),
        user=authenticated_user(user),
    )


def configuration_error(code: str) -> HTTPException:
    """Convert missing external-provider configuration into a retryable service response."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"code": code, "message": "This sign-in provider is not configured for this deployment."},
    )


def complete_oauth_redirect(
    session: Session,
    settings: Settings,
    provider: Literal["google", "government"],
    code: str,
    state: str,
):
    """Finish OAuth and redirect to the SPA callback route with either a token or safe error code."""
    try:
        access_token, _ = complete_oauth_callback(session, settings, provider, code, state)
        # Fragments are not sent as HTTP requests to the SPA host, reducing token exposure in server logs.
        return RedirectResponse(f"{settings.app_public_url.rstrip('/')}/auth/callback#access_token={access_token}")
    except (RuntimeError, ValueError) as error:
        return RedirectResponse(
            f"{settings.app_public_url.rstrip('/')}/auth/callback#error={str(error)}"
        )