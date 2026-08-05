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
    request_payload = draft.model_dump(mode="json", by_alias=True)
    request_hash = payload_hash(request_payload)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    repeated = session.get(AthleteIdempotencyRecord, scoped_key)
    if repeated:
        if repeated.request_hash != request_hash:
            raise ConflictError("idempotency_key_reused", "This idempotency key was already used with different athlete data.")
        stored = session.get(AthleteRecordModel, repeated.athlete_id)
        if not stored:
            raise RuntimeError("The idempotency record has no athlete payload.")
        return cipher.decrypt(stored.encrypted_payload), False

    athlete_id = str(uuid4())
    timestamp = utc_timestamp()
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
    session.commit()
    return payload, True


def get_athlete(
    session: Session,
    cipher: PayloadCipher,
    principal: Principal,
    athlete_id: str,
) -> Optional[Dict[str, Any]]:
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
    request_payload = update.model_dump(mode="json", by_alias=True, exclude_unset=True)
    request_hash = payload_hash(request_payload)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    repeated = session.get(AthleteIdempotencyRecord, scoped_key)
    if repeated:
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
        raise ConflictError("athlete_version_conflict", "The athlete profile has a newer server version.")

    current = cipher.decrypt(stored.encrypted_payload)
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
    payload = athlete.model_dump(mode="json", by_alias=True)
    request_hash = payload_hash(payload)
    athlete_id = str(athlete.id)
    scoped_key = "%s:%s" % (principal.user_id, idempotency_key)
    repeated = session.get(AthleteIdempotencyRecord, scoped_key)
    if repeated:
        if repeated.request_hash != request_hash or repeated.athlete_id != athlete_id:
            raise ConflictError("idempotency_key_reused", "This idempotency key was already used with a different athlete revision.")
        stored = session.get(AthleteRecordModel, athlete_id)
        if not stored or stored.owner_id != principal.user_id:
            return None, False
        return cipher.decrypt(stored.encrypted_payload), False

    stored = session.get(AthleteRecordModel, athlete_id)
    created = stored is None
    if stored:
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
    return "ATH-%s-%s" % (datetime.now(timezone.utc).year, identifier.replace("-", "").upper()[:12])


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")