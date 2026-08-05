import json
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, List

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy import select

from .config import Settings
from .models import User

password_hasher = PasswordHasher(time_cost=3, memory_cost=65_536, parallelism=4, hash_len=32, salt_len=16)
bearer_scheme = HTTPBearer(auto_error=False)

permissions_by_role: Dict[str, List[str]] = {
    "athlete": ["athlete:read-self", "athlete:update-self", "report:read-self"],
    "guardian": ["athlete:read-linked", "report:read-linked"],
    "coach": [
        "athlete:read-assigned",
        "athlete:register",
        "assessment:perform",
        "assessment:review",
        "assessment:schedule",
        "report:generate",
        "report:read-assigned",
    ],
    "assessor": ["athlete:read-assigned", "athlete:register", "assessment:perform", "report:generate"],
    "institution-admin": [
        "athlete:read-assigned",
        "athlete:register",
        "assessment:review",
        "assessment:schedule",
        "report:generate",
        "report:read-assigned",
        "analytics:read-institution",
        "data:export",
        "users:manage",
    ],
    "district-authority": ["analytics:read-district"],
    "state-authority": ["analytics:read-state"],
    "national-admin": ["analytics:read-national", "data:export", "integration:manage", "users:manage"],
}


class Principal:
    def __init__(self, user_id: str, roles: List[str]):
        self.user_id = user_id
        self.roles = roles


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def create_access_token(user: User, settings: Settings) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_minutes)
    return jwt.encode(
        {"sub": user.id, "roles": json.loads(user.roles_json), "exp": expires_at},
        settings.resolved_jwt_secret,
        algorithm="HS256",
    )


def get_current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Principal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()

    settings: Settings = request.app.state.settings
    try:
        payload = jwt.decode(credentials.credentials, settings.resolved_jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not isinstance(user_id, str):
            raise InvalidTokenError("Missing subject")
    except InvalidTokenError:
        raise unauthorized()

    session = request.app.state.database.session()
    try:
        user = session.scalar(select(User).where(User.id == user_id))
        if not user or not user.is_active:
            raise unauthorized()
        return Principal(user.id, json.loads(user.roles_json))
    finally:
        session.close()


def require_permission(permission: str) -> Callable[[Principal], Principal]:
    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        permissions = {
            value for role in principal.roles for value in permissions_by_role.get(role, [])
        }
        if permission not in permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "forbidden"})
        return principal

    return dependency


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "authentication_required"},
        headers={"WWW-Authenticate": "Bearer"},
    )