"""Encrypted assessment persistence, ownership checks, idempotency, and audit helpers."""

import hashlib
import json
from typing import Any, Dict, List, Tuple

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .database import commit_transaction
from .models import AssessmentAttemptRecord, AthleteRecord, AuditEvent, IdempotencyRecord
from .schemas import AssessmentAttempt
from .security import Principal


class ConflictError(Exception):
    """Expected client-write conflict with a stable API error code and safe message."""

    def __init__(self, code: str, message: str):
        """Preserve machine-readable conflict code alongside the user-safe explanation."""
        self.code = code
        self.message = message
        super().__init__(message)


class ResourceNotFoundError(Exception):
    """Expected missing or inaccessible resource error without exposing ownership details."""

    def __init__(self, code: str, message: str):
        """Preserve a stable API error code and a safe client-facing message."""
        self.code = code
        self.message = message
        super().__init__(message)


class PayloadCipher:
    """Encrypt and decrypt canonical JSON payloads before they reach database storage."""

    def __init__(self, key: str):
        """Initialize Fernet with the validated URL-safe base64 application key."""
        self.fernet = Fernet(key.encode("ascii"))

    def encrypt(self, payload: Dict[str, Any]) -> str:
        """Canonicalize, UTF-8 encode, and encrypt a structured payload for persistence."""
        return self.fernet.encrypt(canonical_json(payload).encode("utf-8")).decode("ascii")

    def decrypt(self, payload: str) -> Dict[str, Any]:
        """Decrypt and parse a stored payload, hiding cryptographic failure details from callers."""
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
    """Create or version-update an owned assessment with replay-safe idempotency semantics."""
    # Authorize before reading or creating any assessment data for the athlete.
    require_owned_athlete(session, principal, attempt.athlete_id)

    # Canonical request data gives encryption, hashing, and idempotency a stable representation.
    payload = attempt.model_dump(mode="json", by_alias=True)
    request_hash = payload_hash(payload)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    existing_request = session.get(IdempotencyRecord, scoped_key)
    if existing_request:
        # A reused key may replay the same request, but never alter a prior write.
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
        # Versions implement optimistic concurrency across local devices and retrying clients.
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
            commit_transaction(session, stored)
            return cipher.decrypt(stored.encrypted_payload), False

        stored.athlete_id = attempt.athlete_id
        stored.encrypted_payload = cipher.encrypt(payload)
        stored.payload_hash = request_hash
        stored.version = attempt.version
        apply_assessment_columns(stored, attempt)
    else:
        stored = AssessmentAttemptRecord(
            id=attempt_id,
            athlete_id=attempt.athlete_id,
            **assessment_columns(attempt),
            encrypted_payload=cipher.encrypt(payload),
            payload_hash=request_hash,
            version=attempt.version,
        )
        session.add(stored)
        session.flush()

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
    # Commit the encrypted payload, idempotency mapping, and audit event as one database transaction.
    commit_transaction(session, stored)
    return payload, created


def require_owned_athlete(session: Session, principal: Principal, athlete_id: str) -> None:
    """Ensure the athlete belongs to the principal without disclosing cross-coach ownership."""
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
    """Decrypt all assessment attempts for one already-authorized athlete, newest first."""
    records = (
        session.query(AssessmentAttemptRecord)
        .filter(AssessmentAttemptRecord.athlete_id == athlete_id)
        .order_by(AssessmentAttemptRecord.updated_at.desc())
        .all()
    )
    return [cipher.decrypt(record.encrypted_payload) for record in records]


def payload_hash(payload: Dict[str, Any]) -> str:
    """Return a SHA-256 digest used to compare canonical payload revisions."""
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def canonical_json(payload: Dict[str, Any]) -> str:
    """Serialize structured data deterministically for encryption, hashes, and audit details."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def assessment_columns(attempt: AssessmentAttempt) -> Dict[str, Any]:
    """Extract queryable assessment fields while retaining the full encrypted payload."""
    return {
        "test_id": attempt.test_id,
        "measurement_value": attempt.measurement.value if attempt.measurement else None,
        "measurement_unit": attempt.measurement.unit if attempt.measurement else None,
        "score": attempt.evaluation.score if attempt.evaluation else None,
        "review_status": attempt.review_status,
        "performed_at": attempt.created_at,
    }


def apply_assessment_columns(stored: AssessmentAttemptRecord, attempt: AssessmentAttempt) -> None:
    """Keep assessment reporting columns consistent with the encrypted payload revision."""
    for column, value in assessment_columns(attempt).items():
        setattr(stored, column, value)


def save_test_result(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    attempt: AssessmentAttempt,
    idempotency_key: str,
    correlation_id: str,
) -> Tuple[Dict[str, Any], bool]:
    """Save a new or versioned assessment result using the public CRUD vocabulary."""
    return upsert_assessment(session, cipher, principal, attempt, idempotency_key, correlation_id)


def get_test_history(
    session: Session,
    cipher: PayloadCipher,
    athlete_id: str,
) -> List[Dict[str, Any]]:
    """Return permanent assessment history after the caller has validated athlete ownership."""
    return list_assessments_for_athlete(session, cipher, athlete_id)


def update_test_result(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    attempt: AssessmentAttempt,
    idempotency_key: str,
    correlation_id: str,
) -> Tuple[Dict[str, Any], bool]:
    """Persist a newer version of an assessment result using optimistic concurrency."""
    return upsert_assessment(session, cipher, principal, attempt, idempotency_key, correlation_id)


def delete_test_result(
    session: Session,
    principal: Principal,
    athlete_id: str,
    attempt_id: str,
    correlation_id: str,
) -> bool:
    """Permanently delete one assessment only when its athlete belongs to the caller."""
    stored = session.scalar(
        select(AssessmentAttemptRecord)
        .join(AssessmentAttemptRecord.athlete)
        .where(
            AssessmentAttemptRecord.id == attempt_id,
            AssessmentAttemptRecord.athlete_id == athlete_id,
            AthleteRecord.owner_id == principal.user_id,
        )
    )
    if not stored:
        return False
    session.execute(delete(IdempotencyRecord).where(IdempotencyRecord.attempt_id == attempt_id))
    session.add(AuditEvent(
        actor_id=principal.user_id,
        action="assessment.deleted",
        resource_id=attempt_id,
        correlation_id=correlation_id,
        details_json=canonical_json({"athleteId": athlete_id, "version": stored.version}),
    ))
    session.delete(stored)
    commit_transaction(session)
    return True