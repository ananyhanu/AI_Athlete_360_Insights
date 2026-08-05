import hashlib
import json
from typing import Any, Dict, List, Tuple

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AssessmentAttemptRecord, AthleteRecord, AuditEvent, IdempotencyRecord
from .schemas import AssessmentAttempt
from .security import Principal


class ConflictError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class ResourceNotFoundError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class PayloadCipher:
    def __init__(self, key: str):
        self.fernet = Fernet(key.encode("ascii"))

    def encrypt(self, payload: Dict[str, Any]) -> str:
        return self.fernet.encrypt(canonical_json(payload).encode("utf-8")).decode("ascii")

    def decrypt(self, payload: str) -> Dict[str, Any]:
        try:
            return json.loads(self.fernet.decrypt(payload.encode("ascii")).decode("utf-8"))
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RuntimeError("Stored assessment payload could not be decrypted.") from error


def upsert_assessment(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    attempt: AssessmentAttempt,
    idempotency_key: str,
    correlation_id: str,
) -> Tuple[Dict[str, Any], bool]:
    require_owned_athlete(session, principal, attempt.athlete_id)

    payload = attempt.model_dump(mode="json", by_alias=True)
    request_hash = payload_hash(payload)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    existing_request = session.get(IdempotencyRecord, scoped_key)
    if existing_request:
        if existing_request.request_hash != request_hash:
            raise ConflictError(
                "idempotency_key_reused",
                "This idempotency key was already used with a different assessment revision.",
            )
        stored = session.get(AssessmentAttemptRecord, existing_request.attempt_id)
        if not stored:
            raise RuntimeError("The idempotency record has no assessment payload.")
        return cipher.decrypt(stored.encrypted_payload), False

    attempt_id = str(attempt.id)
    stored = session.get(AssessmentAttemptRecord, attempt_id)
    created = stored is None
    if stored:
        if attempt.version < stored.version:
            raise ConflictError(
                "assessment_version_conflict",
                "The assessment attempt has a newer server version.",
            )
        if attempt.version == stored.version and stored.payload_hash != request_hash:
            raise ConflictError(
                "assessment_version_conflict",
                "The assessment attempt version already exists with different data.",
            )
        if attempt.version == stored.version:
            session.add(IdempotencyRecord(
                key=scoped_key,
                actor_id=principal.user_id,
                request_hash=request_hash,
                attempt_id=attempt_id,
            ))
            session.commit()
            return cipher.decrypt(stored.encrypted_payload), False

        stored.athlete_id = attempt.athlete_id
        stored.encrypted_payload = cipher.encrypt(payload)
        stored.payload_hash = request_hash
        stored.version = attempt.version
    else:
        stored = AssessmentAttemptRecord(
            id=attempt_id,
            athlete_id=attempt.athlete_id,
            encrypted_payload=cipher.encrypt(payload),
            payload_hash=request_hash,
            version=attempt.version,
        )
        session.add(stored)

    session.add(IdempotencyRecord(
        key=scoped_key,
        actor_id=principal.user_id,
        request_hash=request_hash,
        attempt_id=attempt_id,
    ))
    session.add(AuditEvent(
        actor_id=principal.user_id,
        action="assessment.upserted",
        resource_id=attempt_id,
        correlation_id=correlation_id,
        details_json=canonical_json({"created": created, "version": attempt.version}),
    ))
    session.commit()
    return payload, created


def require_owned_athlete(session: Session, principal: Principal, athlete_id: str) -> None:
    owned_athlete = session.scalar(
        select(AthleteRecord.id).where(
            AthleteRecord.id == athlete_id,
            AthleteRecord.owner_id == principal.user_id,
        )
    )
    if not owned_athlete:
        raise ResourceNotFoundError(
            "athlete_not_found",
            "The athlete is not available to the authenticated user.",
        )


def list_assessments_for_athlete(
    session: Session,
    cipher: PayloadCipher,
    athlete_id: str,
) -> List[Dict[str, Any]]:
    records = (
        session.query(AssessmentAttemptRecord)
        .filter(AssessmentAttemptRecord.athlete_id == athlete_id)
        .order_by(AssessmentAttemptRecord.updated_at.desc())
        .all()
    )
    return [cipher.decrypt(record.encrypted_payload) for record in records]


def payload_hash(payload: Dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def canonical_json(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)