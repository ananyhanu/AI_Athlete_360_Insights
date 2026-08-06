"""End-to-end API tests for authentication, encrypted records, ownership, and idempotency."""

import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import AssessmentAttemptRecord, AthleteRecord, User
from backend.app.security import hash_password


class ApiTest(unittest.TestCase):
    """Exercise FastAPI endpoints against a disposable SQLite database per test."""

    def test_normalizes_managed_postgres_urls_to_the_psycopg_driver(self):
        """Allow managed hosts to supply their standard PostgreSQL connection URL."""
        settings = Settings(database_url="postgresql://user:password@db.example.com:5432/aiathlete")

        self.assertEqual(
            settings.database_url,
            "postgresql+psycopg://user:password@db.example.com:5432/aiathlete",
        )

    def test_accepts_the_vercel_marketplace_postgres_environment_variable(self):
        """Use Neon's Vercel-provided connection string without a duplicate setting."""
        with patch.dict(
            os.environ,
            {"POSTGRES_URL": "postgresql://user:password@db.example.com:5432/aiathlete"},
            clear=True,
        ):
            settings = Settings()

        self.assertEqual(
            settings.database_url,
            "postgresql+psycopg://user:password@db.example.com:5432/aiathlete",
        )

    def setUp(self):
        """Create an isolated application, client, and verified coach account for one test."""
        # A real temporary SQLite file allows the test client and SQLAlchemy to share durable state.
        self.database_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.database_file.close()
        # Console delivery keeps verification flows testable without external email or SMS services.
        settings = Settings(
            environment="test",
            database_url="sqlite:///" + self.database_file.name.replace("\\", "/"),
            jwt_secret="test-jwt-secret-with-more-than-thirty-two-characters",
            trusted_hosts="testserver,localhost,127.0.0.1",
            email_delivery_mode="console",
            mobile_otp_delivery_mode="console",
        )
        self.app = create_app(settings)
        self.client_context = TestClient(self.app)
        self.client = self.client_context.__enter__()
        session = self.app.state.database.session()
        try:
            # Seed a verified coach so protected resource tests can obtain a bearer token immediately.
            session.add(User(
                email="coach@example.in",
                email_verified=True,
                password_hash=hash_password("correct-horse-battery-staple"),
                roles_json='["coach"]',
            ))
            session.commit()
        finally:
            session.close()

    def tearDown(self):
        """Close client and engine resources, then remove the temporary database file."""
        self.client_context.__exit__(None, None, None)
        self.app.state.database.engine.dispose()
        os.unlink(self.database_file.name)

    def test_authenticates_and_upserts_an_encrypted_assessment_idempotently(self):
        """Verify sign-in, idempotent assessment replay, and correlation-ID propagation."""
        token_response = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        )
        self.assertEqual(token_response.status_code, 200)
        token = token_response.json()["accessToken"]
        self.assertEqual(token_response.json()["user"]["email"], "coach@example.in")
        self.assertEqual(token_response.json()["user"]["roles"], ["coach"])
        athlete = self.create_athlete(token)
        attempt = assessment_attempt(athlete["id"])
        headers = {
            "Authorization": "Bearer " + token,
            "Idempotency-Key": attempt["id"] + ":v1",
            "X-Correlation-ID": "test-correlation-001",
        }

        created = self.client.post("/v1/assessment-attempts", json=attempt, headers=headers)
        repeated = self.client.post("/v1/assessment-attempts", json=attempt, headers=headers)

        self.assertEqual(created.status_code, 201)
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(created.json()["id"], attempt["id"])
        self.assertEqual(created.headers["X-Correlation-ID"], "test-correlation-001")
        session = self.app.state.database.session()
        try:
            self.assertIsNone(session.get(User, "missing"))
        finally:
            session.close()

    def test_successful_login_updates_last_login(self):
        """Persist a login timestamp only after a verified user supplies a valid password."""
        response = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        )

        self.assertEqual(response.status_code, 200)
        session = self.app.state.database.session()
        try:
            user = session.scalar(select(User).where(User.email == "coach@example.in"))
            self.assertIsNotNone(user)
            self.assertIsNotNone(user.last_login)
            self.assertTrue(user.username)
        finally:
            session.close()

    def test_rejects_reused_idempotency_keys_and_stale_versions(self):
        """Reject an idempotency key with changed data and an older assessment revision."""
        token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        athlete = self.create_athlete(token)
        attempt = assessment_attempt(athlete["id"])
        headers = {"Authorization": "Bearer " + token, "Idempotency-Key": attempt["id"] + ":v1"}
        self.client.post("/v1/assessment-attempts", json=attempt, headers=headers)

        # Transform one field while retaining the request key to simulate an unsafe replay.
        changed = dict(attempt)
        changed["testId"] = "weight"
        conflict = self.client.post("/v1/assessment-attempts", json=changed, headers=headers)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["code"], "idempotency_key_reused")

        # Advance the version before replaying the original revision to simulate a stale offline client.
        updated = dict(attempt)
        updated["reviewStatus"] = "accepted"
        updated["version"] = 2
        updated["updatedAt"] = datetime.now(timezone.utc).isoformat()
        accepted = self.client.post(
            "/v1/assessment-attempts",
            json=updated,
            headers={"Authorization": "Bearer " + token, "Idempotency-Key": attempt["id"] + ":v2"},
        )
        stale = self.client.post(
            "/v1/assessment-attempts",
            json=attempt,
            headers={"Authorization": "Bearer " + token, "Idempotency-Key": attempt["id"] + ":stale"},
        )

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["code"], "assessment_version_conflict")

    def test_rejects_a_performance_score_outside_its_coach_rating_band(self):
        """Ensure API validation rejects a score that conflicts with its declared coach level."""
        token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        athlete = self.create_athlete(token)
        attempt = assessment_attempt(athlete["id"])
        attempt["evaluation"] = {
            "level": "Good",
            "measurement": attempt["measurement"],
            "poseEvidence": None,
            "score": 90,
            "source": "coach-validated",
            "state": "requires-coach-review",
            "validationReasons": ["Coach validation."],
        }

        rejected = self.client.post(
            "/v1/assessment-attempts",
            json=attempt,
            headers={
                "Authorization": "Bearer " + token,
                "Idempotency-Key": attempt["id"] + ":v1",
            },
        )

        self.assertEqual(rejected.status_code, 422)
        self.assertEqual(rejected.json()["code"], "validation_failed")

    def test_creates_lists_and_versions_encrypted_athletes(self):
        """Create, list, patch, and verify encryption of an athlete profile at rest."""
        token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        headers = {"Authorization": "Bearer " + token, "Idempotency-Key": "athlete-create-001"}

        created = self.client.post("/v1/athletes", json=athlete_draft(), headers=headers)
        self.assertEqual(created.status_code, 201)
        athlete = created.json()
        self.assertEqual(athlete["syncState"], "synced")
        self.assertTrue(athlete["athleteId"].startswith("ATH-"))

        listed = self.client.get("/v1/athletes", headers={"Authorization": "Bearer " + token})
        updated = self.client.patch(
            "/v1/athletes/" + athlete["id"],
            json={"changes": {"sport": "Swimming"}, "version": 1},
            headers={
                "Authorization": "Bearer " + token,
                "Idempotency-Key": "athlete-update-001",
                "If-Match": "1",
            },
        )

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["sport"], "Swimming")
        self.assertEqual(updated.json()["version"], 2)

        session = self.app.state.database.session()
        try:
            stored = session.get(AthleteRecord, athlete["id"])
            self.assertIsNotNone(stored)
            # Names must not appear in the database column because the whole profile is encrypted.
            self.assertNotIn("Arjun Sharma", stored.encrypted_payload)
        finally:
            session.close()

    def test_deletes_persisted_assessments_and_cascades_on_athlete_delete(self):
        """Ensure delete endpoints remove durable assessment rows and athlete-owned history."""
        token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        athlete = self.create_athlete(token)
        attempt = assessment_attempt(athlete["id"])
        created = self.client.post(
            "/v1/assessment-attempts",
            json=attempt,
            headers={"Authorization": "Bearer " + token, "Idempotency-Key": attempt["id"] + ":v1"},
        )
        self.assertEqual(created.status_code, 201)

        session = self.app.state.database.session()
        try:
            stored = session.get(AssessmentAttemptRecord, attempt["id"])
            self.assertIsNotNone(stored)
            self.assertEqual(stored.test_id, "height")
            self.assertEqual(stored.measurement_value, 176)
        finally:
            session.close()

        deleted_attempt = self.client.delete(
            f"/v1/athletes/{athlete['id']}/assessment-attempts/{attempt['id']}",
            headers={"Authorization": "Bearer " + token},
        )
        self.assertEqual(deleted_attempt.status_code, 204)
        self.assertEqual(
            self.client.get(
                f"/v1/athletes/{athlete['id']}/assessment-attempts",
                headers={"Authorization": "Bearer " + token},
            ).json(),
            [],
        )

        second_attempt = assessment_attempt(athlete["id"])
        self.client.post(
            "/v1/assessment-attempts",
            json=second_attempt,
            headers={"Authorization": "Bearer " + token, "Idempotency-Key": second_attempt["id"] + ":v1"},
        )
        deleted_athlete = self.client.delete(
            "/v1/athletes/" + athlete["id"],
            headers={"Authorization": "Bearer " + token},
        )
        self.assertEqual(deleted_athlete.status_code, 204)

        session = self.app.state.database.session()
        try:
            self.assertIsNone(session.get(AthleteRecord, athlete["id"]))
            self.assertIsNone(session.get(AssessmentAttemptRecord, second_attempt["id"]))
        finally:
            session.close()

    def test_rejects_assessments_for_another_coachs_athlete(self):
        """Confirm cross-coach assessment access returns a non-disclosing not-found response."""
        first_token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        athlete = self.create_athlete(first_token)
        created = self.client.post(
            "/v1/assessment-attempts",
            json=assessment_attempt(athlete["id"]),
            headers={
                "Authorization": "Bearer " + first_token,
                "Idempotency-Key": "first-coach-assessment-001",
            },
        )
        self.assertEqual(created.status_code, 201)
        session = self.app.state.database.session()
        try:
            # Add a separate verified coach to prove authorization is owner-scoped, not role-scoped alone.
            session.add(User(
                email="coach.two@example.in",
                email_verified=True,
                password_hash=hash_password("another-correct-horse-battery"),
                roles_json='["coach"]',
            ))
            session.commit()
        finally:
            session.close()

        second_token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach.two@example.in", "password": "another-correct-horse-battery"},
        ).json()["accessToken"]
        denied = self.client.post(
            "/v1/assessment-attempts",
            json=assessment_attempt(athlete["id"]),
            headers={
                "Authorization": "Bearer " + second_token,
                "Idempotency-Key": "cross-coach-assessment-001",
            },
        )

        self.assertEqual(denied.status_code, 404)
        self.assertEqual(denied.json()["code"], "athlete_not_found")
        listed = self.client.get(
            "/v1/athletes/" + athlete["id"] + "/assessment-attempts",
            headers={"Authorization": "Bearer " + second_token},
        )
        self.assertEqual(listed.status_code, 404)
        self.assertEqual(listed.json()["code"], "athlete_not_found")

    def test_synchronizes_a_local_athlete_without_replacing_its_identifier(self):
        """Verify offline synchronization preserves the local UUID and public athlete identifier."""
        token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        athlete = syncable_athlete()
        headers = {
            "Authorization": "Bearer " + token,
            "Idempotency-Key": athlete["id"] + ":v1",
        }

        created = self.client.put("/v1/athletes/" + athlete["id"] + "/sync", json=athlete, headers=headers)
        repeated = self.client.put("/v1/athletes/" + athlete["id"] + "/sync", json=athlete, headers=headers)

        self.assertEqual(created.status_code, 201)
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(created.json()["id"], athlete["id"])
        self.assertEqual(created.json()["athleteId"], athlete["athleteId"])

    def test_email_verified_signup_can_sign_in(self):
        """Verify email challenge consumption gates password sign-in until verification completes."""
        with patch("backend.app.auth_service.send_email_verification") as send_verification:
            registered = self.client.post(
                "/v1/auth/signup",
                json={
                    "email": "new.coach@example.in",
                    "mobileNumber": "+919876543210",
                    "password": "new-correct-horse-battery-staple",
                },
            )

        self.assertEqual(registered.status_code, 202)
        # The mocked delivery call exposes the otherwise private one-time verification token.
        verification_token = send_verification.call_args.args[2]
        self.assertNotEqual(verification_token, "new.coach@example.in")
        denied = self.client.post(
            "/v1/auth/token",
            json={"email": "new.coach@example.in", "password": "new-correct-horse-battery-staple"},
        )
        verified = self.client.get("/v1/auth/verify-email", params={"token": verification_token})
        signed_in = self.client.post(
            "/v1/auth/token",
            json={"email": "new.coach@example.in", "password": "new-correct-horse-battery-staple"},
        )

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.json()["code"], "verification_required")
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(signed_in.json()["user"]["roles"], ["coach"])

    def test_mobile_otp_verification_returns_a_session(self):
        """Verify a mobile OTP marks the account verified and returns a bearer session."""
        with patch("backend.app.auth_service.send_email_verification"):
            self.client.post(
                "/v1/auth/signup",
                json={
                    "email": "otp.coach@example.in",
                    "mobileNumber": "+919876543211",
                    "password": "otp-correct-horse-battery-staple",
                },
            )
        with patch("backend.app.auth_service.send_mobile_otp") as send_otp:
            requested = self.client.post(
                "/v1/auth/mobile-otp",
                json={"email": "otp.coach@example.in", "mobileNumber": "+919876543211"},
            )

        self.assertEqual(requested.status_code, 202)
        self.assertNotIn("developmentOtp", requested.json())
        otp = send_otp.call_args.args[2]
        verified = self.client.post(
            "/v1/auth/mobile-otp/verify",
            json={"email": "otp.coach@example.in", "otp": otp},
        )

        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.json()["user"]["email"], "otp.coach@example.in")

    def test_unconfigured_external_providers_return_configuration_errors(self):
        """Verify OAuth start routes fail safely when deployment secrets are absent."""
        google = self.client.get("/v1/auth/google/start", follow_redirects=False)
        government = self.client.get("/v1/auth/government/start", follow_redirects=False)

        self.assertEqual(google.status_code, 503)
        self.assertEqual(google.json()["code"], "google_sso_not_configured")
        self.assertEqual(government.status_code, 503)
        self.assertEqual(government.json()["code"], "government_sso_not_configured")

    def create_athlete(self, token):
        """Create a unique athlete through the API for tests that need an owned resource."""
        response = self.client.post(
            "/v1/athletes",
            json=athlete_draft(),
            headers={
                "Authorization": "Bearer " + token,
                "Idempotency-Key": "athlete-for-assessment-" + str(uuid4()),
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.json()


def assessment_attempt(athlete_id):
    """Build a valid minimal manual-height assessment payload for API test scenarios."""
    timestamp = datetime.now(timezone.utc).isoformat()
    return {
        "athleteId": athlete_id,
        "captureId": None,
        "createdAt": timestamp,
        "dataStatus": "provisional",
        "evaluation": None,
        "id": str(uuid4()),
        "lastSyncError": None,
        "measurement": {"label": "Height", "unit": "cm", "value": 176},
        "reviewStatus": "awaiting-coach-review",
        "source": "manual",
        "status": "completed",
        "syncAttempts": 0,
        "syncState": "pending",
        "testId": "height",
        "updatedAt": timestamp,
        "version": 1,
    }


def athlete_draft():
    """Build a valid consented athlete-registration payload for API test scenarios."""
    return {
        "address": {
            "district": "Pune",
            "line1": "12 Shivaji Nagar",
            "line2": None,
            "postalCode": "411005",
            "state": "Maharashtra",
            "villageOrCity": "Pune",
        },
        "ageCategory": "Under 18",
        "consentStatus": "granted",
        "dateOfBirth": "2009-03-12",
        "discipline": "100m Sprint",
        "emailAddress": "arjun.sharma@example.in",
        "emergencyContact": {
            "emailAddress": "sanjay.sharma@example.in",
            "fullName": "Sanjay Sharma",
            "mobileNumber": "+919876543210",
            "relationship": "Parent",
        },
        "fullName": "Arjun Sharma",
        "gender": "male",
        "guardian": None,
        "heightCm": 172,
        "institutionName": "Shivaji Sports Academy",
        "mobileNumber": "+919820041827",
        "sport": "Athletics",
        "weightKg": 61,
    }


def syncable_athlete():
    """Transform the registration fixture into a complete client-originated sync payload."""
    timestamp = datetime.now(timezone.utc).isoformat()
    # The generated UUID supplies both the immutable record ID and the visible athlete-ID suffix.
    identifier = str(uuid4())
    return {
        **athlete_draft(),
        "athleteId": "ATH-2026-" + identifier.replace("-", "").upper()[:12],
        "createdAt": timestamp,
        "id": identifier,
        "syncState": "synced",
        "updatedAt": timestamp,
        "version": 1,
    }