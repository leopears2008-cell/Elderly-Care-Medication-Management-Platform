from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Care Circle & Autonomy Types ──────────────────────────────────────────────
RoleType = Literal["ELDER", "CARETAKER", "FAMILY"]
AdherenceStatus = Literal["PENDING", "TAKEN", "SNOOZED", "MISSED"]


class ProfileCreateRequest(BaseModel):
    elder_name: str = Field(..., min_length=2, max_length=120)
    age: int = Field(..., ge=40, le=130)
    blood_group: Optional[str] = Field(default="O+", max_length=10)
    passcode: str = Field(..., pattern=r"^\d{6}$", description="Exact 6-digit numeric passcode")
    caregiver_emails: List[EmailStr] = Field(..., min_length=1)
    preferred_language: str = Field(default="en-IN")


class PasscodeLoginRequest(BaseModel):
    profile_id: str
    passcode: str = Field(..., pattern=r"^\d{6}$")
    role: RoleType


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    profile_id: str
    elder_name: str
    role: RoleType


class MedicationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    dosage: str = Field(..., min_length=1, max_length=80)
    scheduled_time: str = Field(..., pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    instructions: str = Field(..., min_length=3, max_length=500)
    stock_remaining: int = Field(default=30, ge=0, le=1000)


class AdherenceUpdateRequest(BaseModel):
    status: AdherenceStatus
    elder_note: Optional[str] = Field(default=None, max_length=300)


class AppointmentCreateRequest(BaseModel):
    doctor_name: str = Field(..., min_length=2, max_length=120)
    specialty: str = Field(..., min_length=2, max_length=100)
    appointment_time: datetime
    location: str = Field(..., min_length=3, max_length=300)
    notes: Optional[str] = Field(default=None, max_length=500)


class AIPrescriptionParseRequest(BaseModel):
    raw_prescription_text: str = Field(..., min_length=5, max_length=2000)
    existing_medications: List[str] = Field(default_factory=list)


class AIPrescriptionParseResponse(BaseModel):
    medication_name: str
    dosage: str
    scheduled_time: str
    elder_friendly_summary: str
    interaction_warning: Optional[str] = None
    ai_source: Literal["gemini-2.5-flash", "deterministic-fallback"]


# ── Classic User Auth Models ──────────────────────────────────────────────────
class UserCreate(BaseModel):
    model_config = {"strict": True}

    email: EmailStr
    name: str = Field(..., min_length=1, max_length=120)
    passcode: str = Field(..., min_length=4, max_length=12, description="4-12 digit PIN")
    role: str = Field(default="elder", pattern="^(elder|caretaker|family)$")

    @field_validator("passcode")
    @classmethod
    def passcode_digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("Passcode must contain digits only")
        return v


class UserLogin(BaseModel):
    model_config = {"strict": True}

    email: EmailStr
    passcode: str = Field(..., min_length=4, max_length=12)


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Medications ───────────────────────────────────────────────────────────────
class MedicationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    dosage: str = Field(..., min_length=1, max_length=100)
    frequency: str = Field(..., description="e.g. 'twice daily', 'every 8 hours'")
    dose_times: List[str] = Field(..., description="List of HH:MM strings e.g. ['08:00','20:00']")
    instructions: Optional[str] = Field(None, max_length=500)
    prescribing_doctor: Optional[str] = Field(None, max_length=200)
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @field_validator("dose_times")
    @classmethod
    def validate_dose_times(cls, v: List[str]) -> List[str]:
        import re
        pattern = re.compile(r"^\d{2}:\d{2}$")
        for t in v:
            if not pattern.match(t):
                raise ValueError(f"Invalid time format '{t}'. Use HH:MM")
        return v


class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    dosage: Optional[str] = Field(None, max_length=100)
    frequency: Optional[str] = None
    dose_times: Optional[List[str]] = None
    instructions: Optional[str] = Field(None, max_length=500)
    prescribing_doctor: Optional[str] = Field(None, max_length=200)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: Optional[bool] = None


class MedicationResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    dosage: str
    frequency: str
    dose_times: List[str]
    instructions: Optional[str]
    prescribing_doctor: Optional[str]
    start_date: Optional[date]
    end_date: Optional[date]
    is_active: bool
    created_at: datetime
    adherence_percent: Optional[float] = None


# ── Adherence ─────────────────────────────────────────────────────────────────
class AdherenceLog(BaseModel):
    medication_id: UUID
    scheduled_time: datetime
    status: str = Field(..., pattern="^(taken|missed|snoozed)$")
    notes: Optional[str] = Field(None, max_length=300)


class AdherenceResponse(BaseModel):
    id: UUID
    medication_id: UUID
    user_id: UUID
    scheduled_time: datetime
    taken_at: Optional[datetime]
    status: str
    notes: Optional[str]


class AdherenceStats(BaseModel):
    medication_id: UUID
    medication_name: str
    total_doses: int
    taken: int
    missed: int
    adherence_percent: float
    logs: List[AdherenceResponse]


# ── Appointments ──────────────────────────────────────────────────────────────
class AppointmentCreate(BaseModel):
    doctor_name: str = Field(..., min_length=1, max_length=200)
    specialty: Optional[str] = Field(None, max_length=100)
    appointment_dt: datetime
    duration_minutes: int = Field(default=30, ge=5, le=480)
    location: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=500)


class AppointmentUpdate(BaseModel):
    doctor_name: Optional[str] = Field(None, max_length=200)
    specialty: Optional[str] = Field(None, max_length=100)
    appointment_dt: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    location: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=500)


class AppointmentResponse(BaseModel):
    id: UUID
    user_id: UUID
    doctor_name: str
    specialty: Optional[str]
    appointment_dt: datetime
    duration_minutes: int
    location: Optional[str]
    notes: Optional[str]
    reminder_sent: bool
    created_at: datetime
    calendar_link: Optional[str] = None


# ── AI ────────────────────────────────────────────────────────────────────────
class PrescriptionScanResponse(BaseModel):
    medications: List[dict]
    raw_text: Optional[str] = None
    confidence: Optional[float] = None


class DrugInteractionRequest(BaseModel):
    medications: List[str] = Field(..., min_length=2, description="At least 2 medication names")


class DrugInteractionResponse(BaseModel):
    interactions: List[dict]
    severity: str = Field(..., description="none | mild | moderate | severe")
    recommendations: List[str]
    disclaimer: str = "This is AI-generated information. Always consult a pharmacist or doctor."
