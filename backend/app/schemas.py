from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class TokenRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)


AppRole = Literal[
    "athlete",
    "guardian",
    "coach",
    "assessor",
    "institution-admin",
    "district-authority",
    "state-authority",
    "national-admin",
]


class AuthenticatedUser(ApiModel):
    email: EmailStr
    id: str
    roles: List[AppRole]


class TokenResponse(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: AuthenticatedUser


class Contact(ApiModel):
    email_address: Optional[EmailStr] = None
    full_name: str = Field(min_length=1, max_length=120)
    mobile_number: str = Field(min_length=7, max_length=20)
    relationship: str = Field(min_length=1, max_length=60)


class AthleteAddress(ApiModel):
    district: str = Field(min_length=1, max_length=80)
    line1: str = Field(min_length=1, max_length=160)
    line2: Optional[str] = Field(default=None, max_length=160)
    postal_code: str = Field(min_length=3, max_length=12)
    state: str = Field(min_length=1, max_length=80)
    village_or_city: str = Field(min_length=1, max_length=80)


class AthleteDraft(ApiModel):
    address: AthleteAddress
    age_category: str = Field(min_length=1, max_length=80)
    consent_status: Literal["pending", "granted", "withdrawn"]
    date_of_birth: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    discipline: str = Field(min_length=1, max_length=80)
    email_address: Optional[EmailStr] = None
    emergency_contact: Optional[Contact] = None
    full_name: str = Field(min_length=1, max_length=120)
    gender: Literal["female", "male", "non-binary", "self-describe", "prefer-not-to-say"]
    guardian: Optional[Contact] = None
    height_cm: Optional[float] = Field(default=None, gt=0, le=300)
    institution_name: str = Field(min_length=1, max_length=160)
    mobile_number: str = Field(min_length=7, max_length=20)
    sport: str = Field(min_length=1, max_length=80)
    weight_kg: Optional[float] = Field(default=None, gt=0, le=500)


class AthleteChanges(ApiModel):
    address: Optional[AthleteAddress] = None
    age_category: Optional[str] = Field(default=None, min_length=1, max_length=80)
    consent_status: Optional[Literal["pending", "granted", "withdrawn"]] = None
    date_of_birth: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    discipline: Optional[str] = Field(default=None, min_length=1, max_length=80)
    email_address: Optional[EmailStr] = None
    emergency_contact: Optional[Contact] = None
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    gender: Optional[Literal["female", "male", "non-binary", "self-describe", "prefer-not-to-say"]] = None
    guardian: Optional[Contact] = None
    height_cm: Optional[float] = Field(default=None, gt=0, le=300)
    institution_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    mobile_number: Optional[str] = Field(default=None, min_length=7, max_length=20)
    sport: Optional[str] = Field(default=None, min_length=1, max_length=80)
    weight_kg: Optional[float] = Field(default=None, gt=0, le=500)


class Athlete(AthleteDraft):
    athlete_id: str = Field(pattern=r"^ATH-\d{4}-[A-Z0-9-]{4,64}$")
    created_at: datetime
    id: UUID
    sync_state: Literal["synced"] = "synced"
    updated_at: datetime
    version: int = Field(ge=1)


class AthleteUpdate(ApiModel):
    changes: AthleteChanges
    version: int = Field(ge=1)


class PoseEvidence(ApiModel):
    analyzed_frames: int = Field(ge=1, le=60)
    body_in_frame_rate: float = Field(ge=0, le=1)
    detected_frames: int = Field(ge=0, le=60)
    mean_landmark_visibility: float = Field(ge=0, le=1)
    model: Literal["mediapipe-pose-landmarker-lite"]
    model_version: Literal["1"]


class Measurement(ApiModel):
    label: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=20)
    value: float = Field(ge=0, le=10_000)


class AssessmentEvaluation(ApiModel):
    level: Optional[Literal["Excellent", "Good", "Average", "Needs Improvement", "Not scored"]]
    measurement: Optional[Measurement]
    pose_evidence: Optional[PoseEvidence] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    source: Literal["analysis-unavailable", "coach-validated", "mediapipe-pose"]
    state: Literal["invalid-capture", "requires-coach-review"]
    validation_reasons: List[str] = Field(max_length=12)

    @model_validator(mode="after")
    def validate_coach_performance_score(self):
        score_bands = {
            "Excellent": (85, 100),
            "Good": (70, 84),
            "Average": (50, 69),
            "Needs Improvement": (0, 49),
        }
        if self.level in score_bands:
            if self.score is None or self.measurement is None:
                raise ValueError("Coach-rated evaluations require a measurement and performance score.")
            minimum, maximum = score_bands[self.level]
            if self.score < minimum or self.score > maximum:
                raise ValueError(
                    "%s scores must be whole numbers from %s to %s."
                    % (self.level, minimum, maximum)
                )
        elif self.score is not None:
            raise ValueError("Unscored evaluations cannot include a performance score.")
        return self


class AssessmentAttempt(ApiModel):
    athlete_id: str = Field(min_length=1, max_length=160)
    capture_id: Optional[UUID]
    created_at: datetime
    data_status: Literal["provisional"]
    evaluation: Optional[AssessmentEvaluation] = None
    id: UUID
    last_sync_error: Optional[str] = Field(default=None, max_length=500)
    measurement: Optional[Measurement]
    review_status: Literal["awaiting-coach-review", "accepted", "rejected"]
    source: Literal["camera", "manual", "upload"]
    status: Literal["captured", "completed", "invalid"]
    sync_attempts: int = Field(ge=0, le=100)
    sync_state: Literal["failed", "pending", "synced"]
    test_id: str = Field(min_length=1, max_length=100)
    updated_at: datetime
    version: int = Field(ge=1)