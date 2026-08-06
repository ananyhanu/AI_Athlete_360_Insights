"""ORM records that hold encrypted payloads and authentication metadata."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from .database import Base


def utc_now() -> datetime:
    """Return an aware UTC timestamp for database defaults and expiry comparisons."""
    return datetime.now(timezone.utc)


class User(Base):
    """Credential, verification, role, and active-state record for an authenticated user."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: "user-" + str(uuid4()),
    )
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mobile_number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    mobile_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(512), nullable=False)
    password_hash = synonym("hashed_password")
    roles_json: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    athletes: Mapped[list["AthleteRecord"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )


class AuthChallenge(Base):
    """One-time hashed secret used for email, mobile OTP, or OAuth state verification."""

    __tablename__ = "auth_challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    purpose: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    target: Mapped[str | None] = mapped_column(String(254), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssessmentAttemptRecord(Base):
    """Encrypted assessment payload plus the metadata required for conflict detection."""

    __tablename__ = "assessment_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    athlete_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("athletes.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    test_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    measurement_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    measurement_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_status: Mapped[str] = mapped_column(String(40), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    encrypted_payload: Mapped[str] = mapped_column(Text, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    athlete: Mapped["AthleteRecord"] = relationship(back_populates="assessments")


class AthleteRecord(Base):
    """Encrypted athlete profile owned by one user and protected by a version counter."""

    __tablename__ = "athletes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    athlete_id: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    date_of_birth: Mapped[str] = mapped_column(String(10), nullable=False)
    gender: Mapped[str] = mapped_column(String(32), nullable=False)
    sport: Mapped[str] = mapped_column(String(80), nullable=False)
    discipline: Mapped[str] = mapped_column(String(80), nullable=False)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    encrypted_payload: Mapped[str] = mapped_column(Text, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    owner: Mapped[User] = relationship(back_populates="athletes")
    assessments: Mapped[list[AssessmentAttemptRecord]] = relationship(
        back_populates="athlete",
        cascade="all, delete-orphan",
    )


class AthleteIdempotencyRecord(Base):
    """Maps a coach-scoped athlete request key to its completed athlete write."""

    __tablename__ = "athlete_idempotency_records"

    key: Mapped[str] = mapped_column(String(256), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    athlete_id: Mapped[str] = mapped_column(String(36), ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class IdempotencyRecord(Base):
    """Maps a coach-scoped assessment request key to its completed assessment write."""

    __tablename__ = "idempotency_records"

    key: Mapped[str] = mapped_column(String(256), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempt_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessment_attempts.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditEvent(Base):
    """Append-only audit metadata for sensitive write operations."""

    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(160), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(120), nullable=False)
    details_json: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)