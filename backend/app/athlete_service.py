"""Encrypted athlete-profile persistence with ownership, versioning, sync, and audit rules."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .assessment_service import ConflictError, PayloadCipher, canonical_json, payload_hash
from .models import AthleteIdempotencyRecord, AthleteRecord as AthleteRecordModel, AuditEvent
from .schemas import Athlete, AthleteDraft, AthleteUpdate
from .security import Principal


def create_athlete(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    draft: AthleteDraft,
    idempotency_key: str,
    correlation_id: str,
) -> Tuple[Dict[str, Any], bool]:
    """Create an owned encrypted athlete profile and make duplicate retries replay safely."""
    # Validate the externally supplied draft before adding server-owned identity metadata.
    request_payload = draft.model_dump(mode="json", by_alias=True)
    request_hash = payload_hash(request_payload)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    repeated = session.get(AthleteIdempotencyRecord, scoped_key)
    if repeated:
        # Only an identical request is allowed to reuse a completed idempotency key.
        if repeated.request_hash != request_hash:
            raise ConflictError("idempotency_key_reused", "This idempotency key was already used with different athlete data.")
        stored = session.get(AthleteRecordModel, repeated.athlete_id)
        if not stored:
            raise RuntimeError("The idempotency record has no athlete payload.")
        return cipher.decrypt(stored.encrypted_payload), False

    athlete_id = str(uuid4())
    timestamp = utc_timestamp()
    # Transform the registration draft into the persisted API shape with server-generated fields.
    payload = Athlete.model_validate({
        **request_payload,
        "athleteId": athlete_identifier(athlete_id),
        "createdAt": timestamp,
        "id": athlete_id,
        "syncState": "synced",
        "updatedAt": timestamp,
        "version": 1,
    }).model_dump(mode="json", by_alias=True)
    stored = AthleteRecordModel(
        id=athlete_id,
        owner_id=principal.user_id,
        athlete_id=payload["athleteId"],
        encrypted_payload=cipher.encrypt(payload),
        payload_hash=payload_hash(payload),
        version=1,
    )
    session.add(stored)
    session.add(AthleteIdempotencyRecord(
        key=scoped_key,
        actor_id=principal.user_id,
        request_hash=request_hash,
        athlete_id=athlete_id,
    ))
    session.add(AuditEvent(
        actor_id=principal.user_id,
        action="athlete.created",
        resource_id=athlete_id,
        correlation_id=correlation_id,
        details_json=canonical_json({"version": 1}),
    ))
    # Commit profile ciphertext, replay mapping, and audit event together.
    session.commit()
    return payload, True


def get_athlete(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    athlete_id: str,
) -> Optional[Dict[str, Any]]:
    """Return one owned decrypted athlete profile or none when it is absent or inaccessible."""
    stored = session.scalar(
        select(AthleteRecordModel).where(
            AthleteRecordModel.id == athlete_id,
            AthleteRecordModel.owner_id == principal.user_id,
        )
    )
    return cipher.decrypt(stored.encrypted_payload) if stored else None


def list_athletes(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
) -> List[Dict[str, Any]]:
    """Return decrypted athlete profiles owned by the principal, newest updated first."""
    records = session.scalars(
        select(AthleteRecordModel)
        .where(AthleteRecordModel.owner_id == principal.user_id)
        .order_by(AthleteRecordModel.updated_at.desc())
    ).all()
    return [cipher.decrypt(record.encrypted_payload) for record in records]


def update_athlete(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    athlete_id: str,
    update: AthleteUpdate,
    expected_version: int,
    idempotency_key: str,
    correlation_id: str,
) -> Optional[Dict[str, Any]]:
    """Merge a versioned profile patch, encrypt the new revision, and record an audit event."""
    request_payload = update.model_dump(mode="json", by_alias=True, exclude_unset=True)
    request_hash = payload_hash(request_payload)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    repeated = session.get(AthleteIdempotencyRecord, scoped_key)
    if repeated:
        # Replays bypass mutation after proving the endpoint and payload match the original request.
        if repeated.request_hash != request_hash or repeated.athlete_id != athlete_id:
            raise ConflictError("idempotency_key_reused", "This idempotency key was already used with a different athlete revision.")
        stored = session.get(AthleteRecordModel, athlete_id)
        if not stored:
            raise RuntimeError("The idempotency record has no athlete payload.")
        return cipher.decrypt(stored.encrypted_payload)

    stored = session.scalar(
        select(AthleteRecordModel).where(
            AthleteRecordModel.id == athlete_id,
            AthleteRecordModel.owner_id == principal.user_id,
        )
    )
    if not stored:
        return None
    if expected_version != stored.version or update.version != stored.version:
        # Require both HTTP and request-body versions to prevent stale clients from overwriting changes.
        raise ConflictError("athlete_version_conflict", "The athlete profile has a newer server version.")

    current = cipher.decrypt(stored.encrypted_payload)
    # Excluding unset values means omitted fields retain their current encrypted payload values.
    changes = update.changes.model_dump(mode="json", by_alias=True, exclude_unset=True)
    payload = Athlete.model_validate({
        **current,
        **changes,
        "syncState": "synced",
        "updatedAt": utc_timestamp(),
        "version": stored.version + 1,
    }).model_dump(mode="json", by_alias=True)
    stored.encrypted_payload = cipher.encrypt(payload)
    stored.payload_hash = payload_hash(payload)
    stored.version += 1
    session.add(AthleteIdempotencyRecord(
        key=scoped_key,
        actor_id=principal.user_id,
        request_hash=request_hash,
        athlete_id=athlete_id,
    ))
    session.add(AuditEvent(
        actor_id=principal.user_id,
        action="athlete.updated",
        resource_id=athlete_id,
        correlation_id=correlation_id,
        details_json=canonical_json({"version": stored.version}),
    ))
    session.commit()
    return payload


def synchronize_athlete(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    athlete: Athlete,
    idempotency_key: str,
    correlation_id: str,
) -> Tuple[Optional[Dict[str, Any]], bool]:
    """Apply an offline athlete revision while preserving its local ID and public athlete identifier."""
    payload = athlete.model_dump(mode="json", by_alias=True)
    request_hash = payload_hash(payload)
    athlete_id = str(athlete.id)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    repeated = session.get(AthleteIdempotencyRecord, scoped_key)
    if repeated:
        # A retry returns the committed server representation without applying a second mutation.
        if repeated.request_hash != request_hash or repeated.athlete_id != athlete_id:
            raise ConflictError("idempotency_key_reused", "This idempotency key was already used with a different athlete revision.")
        stored = session.get(AthleteRecordModel, athlete_id)
        if not stored or stored.owner_id != principal.user_id:
            return None, False
        return cipher.decrypt(stored.encrypted_payload), False

    stored = session.get(AthleteRecordModel, athlete_id)
    created = stored is None
    if stored:
        # An existing record must remain owned by the caller and keep its stable athlete identifier.
        if stored.owner_id != principal.user_id:
            return None, False
        if stored.athlete_id != athlete.athlete_id:
            raise ConflictError("athlete_identity_conflict", "The athlete identifier cannot be changed during synchronization.")
        if athlete.version < stored.version:
            raise ConflictError("athlete_version_conflict", "The athlete profile has a newer server version.")
        if athlete.version == stored.version and stored.payload_hash != request_hash:
            raise ConflictError("athlete_version_conflict", "The athlete profile version already exists with different data.")
        if athlete.version == stored.version:
            session.add(AthleteIdempotencyRecord(
                key=scoped_key,
                actor_id=principal.user_id,
                request_hash=request_hash,
                athlete_id=athlete_id,
            ))
            session.commit()
            return cipher.decrypt(stored.encrypted_payload), False
        stored.encrypted_payload = cipher.encrypt(payload)
        stored.payload_hash = request_hash
        stored.version = athlete.version
    else:
        stored = AthleteRecordModel(
            id=athlete_id,
            owner_id=principal.user_id,
            athlete_id=athlete.athlete_id,
            encrypted_payload=cipher.encrypt(payload),
            payload_hash=request_hash,
            version=athlete.version,
        )
        session.add(stored)

    session.add(AthleteIdempotencyRecord(
        key=scoped_key,
        actor_id=principal.user_id,
        request_hash=request_hash,
        athlete_id=athlete_id,
    ))
    session.add(AuditEvent(
        actor_id=principal.user_id,
        action="athlete.synchronized",
        resource_id=athlete_id,
        correlation_id=correlation_id,
        details_json=canonical_json({"created": created, "version": athlete.version}),
    ))
    session.commit()
    return payload, created


def athlete_identifier(identifier: str) -> str:
    """Create a readable athlete ID from the current year and a UUID-derived suffix."""
    return "ATH-%s-%s" % (datetime.now(timezone.utc).year, identifier.replace("-", "").upper()[:12])


def utc_timestamp() -> str:
    """Return an ISO-8601 UTC timestamp serialized with the conventional Z suffix."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")