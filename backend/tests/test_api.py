import os
import tempfile
import unittest
from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import AthleteRecord, User
from backend.app.security import hash_password


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.database_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.database_file.close()
        settings = Settings(
            environment="test",
            database_url="sqlite:///" + self.database_file.name.replace("\\", "/"),
            jwt_secret="test-jwt-secret-with-more-than-thirty-two-characters",
            trusted_hosts="testserver,localhost,127.0.0.1",
        )
        self.app = create_app(settings)
        self.client_context = TestClient(self.app)
        self.client = self.client_context.__enter__()
        session = self.app.state.database.session()
        try:
            session.add(User(
                email="coach@example.in",
                password_hash=hash_password("correct-horse-battery-staple"),
                roles_json='["coach"]',
            ))
            session.commit()
        finally:
            session.close()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.app.state.database.engine.dispose()
        os.unlink(self.database_file.name)

    def test_authenticates_and_upserts_an_encrypted_assessment_idempotently(self):
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

    def test_rejects_reused_idempotency_keys_and_stale_versions(self):
        token = self.client.post(
            "/v1/auth/token",
            json={"email": "coach@example.in", "password": "correct-horse-battery-staple"},
        ).json()["accessToken"]
        athlete = self.create_athlete(token)
        attempt = assessment_attempt(athlete["id"])
        headers = {"Authorization": "Bearer " + token, "Idempotency-Key": attempt["id"] + ":v1"}
        self.client.post("/v1/assessment-attempts", json=attempt, headers=headers)

        changed = dict(attempt)
        changed["testId"] = "weight"
        conflict = self.client.post("/v1/assessment-attempts", json=changed, headers=headers)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["code"], "idempotency_key_reused")

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
            self.assertNotIn("Arjun Sharma", stored.encrypted_payload)
        finally:
            session.close()

    def test_rejects_assessments_for_another_coachs_athlete(self):
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
            session.add(User(
                email="coach.two@example.in",
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

    def create_athlete(self, token):
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
    timestamp = datetime.now(timezone.utc).isoformat()
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