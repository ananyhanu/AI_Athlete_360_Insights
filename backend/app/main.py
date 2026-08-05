from contextlib import asynccontextmanager
import json
from typing import AsyncGenerator, Generator, List
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .assessment_service import ConflictError, PayloadCipher, ResourceNotFoundError, list_assessments_for_athlete, require_owned_athlete, upsert_assessment
from .athlete_service import create_athlete, get_athlete, list_athletes, synchronize_athlete, update_athlete
from .config import Settings
from .database import Database
from .models import User
from .schemas import Athlete, AthleteDraft, AthleteUpdate, AssessmentAttempt, AuthenticatedUser, TokenRequest, TokenResponse
from .security import Principal, create_access_token, get_current_principal, require_permission, verify_password


def create_app(settings: Settings = None) -> FastAPI:
    active_settings = settings or Settings()
    active_settings.validate_secrets()
    database = Database(active_settings.database_url)
    cipher = PayloadCipher(active_settings.resolved_data_encryption_key)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        if active_settings.environment != "production":
            database.create_schema()
        yield

    app = FastAPI(title="AI Athlete 360 API", version="0.1.0", lifespan=lifespan)
    app.state.settings = active_settings
    app.state.database = database
    app.state.cipher = cipher

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, error: HTTPException):
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
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"code": "validation_failed", "message": "Request validation failed."},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-ID"],
        allow_methods=["GET", "POST", "PUT", "PATCH"],
        allow_origins=active_settings.cors_origin_list,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=active_settings.trusted_host_list)
    if active_settings.environment == "production":
        app.add_middleware(HTTPSRedirectMiddleware)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid4())
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id[:120]
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        if active_settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.post("/v1/auth/token", response_model=TokenResponse)
    def create_token(credentials: TokenRequest, session: Session = Depends(database_session(database))):
        user = session.scalar(select(User).where(User.email == str(credentials.email).lower()))
        if not user or not user.is_active or not verify_password(credentials.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "invalid_credentials"})
        return TokenResponse(
            access_token=create_access_token(user, active_settings),
            user=AuthenticatedUser(id=user.id, email=user.email, roles=json.loads(user.roles_json)),
        )

    @app.post("/v1/assessment-attempts", response_model=AssessmentAttempt, status_code=status.HTTP_201_CREATED)
    def save_assessment(
        attempt: AssessmentAttempt,
        response: Response,
        request: Request,
        idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=180),
        principal: Principal = Depends(require_permission("assessment:perform")),
        session: Session = Depends(database_session(database)),
    ):
        try:
            saved, created = upsert_assessment(
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
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Athlete.model_validate(saved)

    @app.get("/v1/athletes", response_model=List[Athlete])
    def list_owned_athletes(
        principal: Principal = Depends(require_permission("athlete:read-assigned")),
        session: Session = Depends(database_session(database)),
    ):
        return [Athlete.model_validate(item) for item in list_athletes(session, cipher, principal)]

    @app.get("/v1/athletes/{athlete_id}", response_model=Athlete)
    def get_owned_athlete(
        athlete_id: str,
        principal: Principal = Depends(require_permission("athlete:read-assigned")),
        session: Session = Depends(database_session(database)),
    ):
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
        try:
            require_owned_athlete(session, principal, athlete_id)
        except ResourceNotFoundError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": error.code, "message": error.message})
        return [
            AssessmentAttempt.model_validate(item)
            for item in list_assessments_for_athlete(session, cipher, athlete_id)
        ]

    return app


def database_session(database: Database):
    def dependency() -> Generator[Session, None, None]:
        session = database.session()
        try:
            yield session
        finally:
            session.close()

    return dependency


app = create_app()