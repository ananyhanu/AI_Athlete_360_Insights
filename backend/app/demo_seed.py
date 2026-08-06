"""Create a verified local demo coach, athlete, and completed assessment battery."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from .assessment_service import PayloadCipher, list_assessments_for_athlete, upsert_assessment
from .athlete_service import create_athlete
from .auth_service import get_user_by_email
from .config import Settings
from .database import Database, commit_transaction
from .models import AthleteRecord, User
from .schemas import AssessmentAttempt, AthleteDraft
from .security import Principal, hash_password


DEMO_EMAIL = "demo.coach@aiathlete360.com"
DEMO_PASSWORD = "AthleteDemo!2026"
DEMO_MOBILE = "+919000000001"
DEMO_ATHLETE_NAME = "Aarav Patel"

TEST_RESULTS = (
    ("height", "Height", "cm", 174.0),
    ("weight", "Weight", "kg", 64.0),
    ("sit-and-reach", "Sit & Reach", "cm", 32.0),
    ("vertical-jump", "Standing Vertical Jump", "cm", 46.0),
    ("broad-jump", "Standing Broad Jump", "m", 2.35),
    ("medicine-ball-throw", "Medicine Ball Throw", "m", 8.4),
    ("30m-sprint", "30m Sprint", "s", 4.6),
    ("4x10-shuttle-run", "4x10 Shuttle Run", "s", 11.8),
    ("sit-ups", "Sit-Ups", "reps", 38.0),
    ("endurance-run", "Endurance Run", "min", 6.2),
)


def main() -> None:
    """Seed durable demo records and print the local sign-in details."""
    settings = Settings()
    database = Database(settings.database_url)
    database.create_schema()
    cipher = PayloadCipher(settings.resolved_data_encryption_key)
    session = database.session()

    try:
        user = get_user_by_email(session, DEMO_EMAIL)
        if not user:
            user = session.scalar(select(User).where(User.username == "demo.coach"))
        if not user:
            user = User(
                email=DEMO_EMAIL,
                username="demo.coach",
                mobile_number=DEMO_MOBILE,
                email_verified=True,
                mobile_verified=True,
                hashed_password=hash_password(DEMO_PASSWORD),
                roles_json='["coach"]',
                is_active=True,
            )
            session.add(user)
            commit_transaction(session, user)
        else:
            user.email = DEMO_EMAIL
            user.username = "demo.coach"
            user.mobile_number = DEMO_MOBILE
            user.email_verified = True
            user.mobile_verified = True
            user.hashed_password = hash_password(DEMO_PASSWORD)
            user.roles_json = '["coach"]'
            user.is_active = True
            commit_transaction(session, user)

        principal = Principal(user.id, ["coach"])
        athlete = session.scalar(
            select(AthleteRecord).where(
                AthleteRecord.owner_id == user.id,
                AthleteRecord.full_name == DEMO_ATHLETE_NAME,
            )
        )
        if athlete:
            athlete_id = athlete.id
        else:
            draft = AthleteDraft.model_validate(
                {
                    "address": {
                        "district": "Pune",
                        "line1": "42 Sports Complex Road",
                        "line2": None,
                        "postal_code": "411001",
                        "state": "Maharashtra",
                        "village_or_city": "Pune",
                    },
                    "age_category": "Age 12 and above",
                    "consent_status": "granted",
                    "date_of_birth": "2008-05-18",
                    "discipline": "400m Sprint",
                    "email_address": "aarav.patel@example.com",
                    "emergency_contact": None,
                    "full_name": DEMO_ATHLETE_NAME,
                    "gender": "male",
                    "guardian": None,
                    "height_cm": 174.0,
                    "institution_name": "Pune Athletics Academy",
                    "mobile_number": "+919000000002",
                    "sport": "Athletics",
                    "weight_kg": 64.0,
                }
            )
            created, _ = create_athlete(
                session,
                cipher,
                principal,
                draft,
                "demo-athlete-create-v1",
                "demo-seed",
            )
            athlete_id = str(created["id"])

        existing_test_ids = {
            attempt["testId"]
            for attempt in list_assessments_for_athlete(session, cipher, athlete_id)
        }
        for test_id, label, unit, value in TEST_RESULTS:
            if test_id in existing_test_ids:
                continue
            timestamp = datetime.now(timezone.utc)
            attempt = AssessmentAttempt.model_validate(
                {
                    "athlete_id": athlete_id,
                    "capture_id": None,
                    "created_at": timestamp,
                    "data_status": "provisional",
                    "evaluation": {
                        "level": "Good",
                        "measurement": {"label": label, "unit": unit, "value": value},
                        "pose_evidence": None,
                        "score": 75,
                        "source": "coach-validated",
                        "state": "requires-coach-review",
                        "validation_reasons": ["Local demo result verified by the demo coach."],
                    },
                    "id": uuid4(),
                    "last_sync_error": None,
                    "measurement": {"label": label, "unit": unit, "value": value},
                    "review_status": "accepted",
                    "source": "manual",
                    "status": "completed",
                    "sync_attempts": 0,
                    "sync_state": "synced",
                    "test_id": test_id,
                    "updated_at": timestamp,
                    "version": 1,
                }
            )
            upsert_assessment(
                session,
                cipher,
                principal,
                attempt,
                f"demo-{test_id}-{attempt.id}",
                "demo-seed",
            )
    finally:
        session.close()

    print("Demo account ready")
    print(f"Email: {DEMO_EMAIL}")
    print(f"Password: {DEMO_PASSWORD}")
    print(f"Athlete: {DEMO_ATHLETE_NAME}")
    print(f"Tests completed: {len(TEST_RESULTS)}")


if __name__ == "__main__":
    main()