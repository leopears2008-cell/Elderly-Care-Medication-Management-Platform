from datetime import datetime, timezone
from typing import Dict, List
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.schemas import (
    AdherenceUpdateRequest,
    AIPrescriptionParseRequest,
    AIPrescriptionParseResponse,
    AppointmentCreateRequest,
    AuthTokenResponse,
    MedicationCreateRequest,
    PasscodeLoginRequest,
    ProfileCreateRequest,
)
from app.security import (
    clear_failed_attempts,
    create_session_jwt,
    enforce_rate_limit,
    get_current_session,
    hash_passcode,
    register_failed_attempt,
    verify_passcode,
)
from app.services.email_service import build_google_calendar_url, send_care_circle_email
from app.services.gemini_service import parse_prescription_and_check_interactions

app = FastAPI(
    title="SushrutaCare AI — Elderly Care & Medication Platform",
    version="1.0.0",
    description="Passcode-secured Care Circle API with Google Gemini 2.5 Flash & Gmail alerts.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store mirrored with Supabase adapter so local & CI tests run with zero external flakiness
PROFILES_STORE: Dict[str, dict] = {}
MEDICATIONS_STORE: Dict[str, List[dict]] = {}
ADHERENCE_STORE: Dict[str, dict] = {}
APPOINTMENTS_STORE: Dict[str, List[dict]] = {}


@app.get("/health")
def health_check() -> dict:
    return {"status": "healthy", "service": "sushrutacare-api"}


@app.post("/api/v1/profiles", status_code=status.HTTP_201_CREATED)
def create_elder_profile(payload: ProfileCreateRequest) -> dict:
    profile_id = str(uuid4())
    PROFILES_STORE[profile_id] = {
        "id": profile_id,
        "elder_name": payload.elder_name,
        "age": payload.age,
        "blood_group": payload.blood_group,
        "passcode_hash": hash_passcode(payload.passcode),
        "caregiver_emails": [str(e) for e in payload.caregiver_emails],
        "preferred_language": payload.preferred_language,
    }
    MEDICATIONS_STORE[profile_id] = []
    APPOINTMENTS_STORE[profile_id] = []
    return {
        "profile_id": profile_id,
        "elder_name": payload.elder_name,
        "message": "Care Circle created. Share the profile ID and 6-digit passcode with family.",
    }


@app.post("/api/v1/auth/passcode", response_model=AuthTokenResponse)
def login_with_passcode(payload: PasscodeLoginRequest) -> AuthTokenResponse:
    enforce_rate_limit(payload.profile_id)
    profile = PROFILES_STORE.get(payload.profile_id)
    if not profile or not verify_passcode(payload.passcode, profile["passcode_hash"]):
        register_failed_attempt(payload.profile_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid profile ID or 6-digit Care Passcode.",
        )

    clear_failed_attempts(payload.profile_id)
    token = create_session_jwt(profile["id"], payload.role, profile["elder_name"])
    return AuthTokenResponse(
        access_token=token,
        profile_id=profile["id"],
        elder_name=profile["elder_name"],
        role=payload.role,
    )


@app.post("/api/v1/medications", status_code=status.HTTP_201_CREATED)
def add_medication(
    payload: MedicationCreateRequest, session: dict = Depends(get_current_session)
) -> dict:
    if session["role"] == "FAMILY":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Family viewer role cannot modify medication schedules.",
        )
    profile_id = session["profile_id"]
    med_id = str(uuid4())
    log_id = str(uuid4())

    med_record = {
        "id": med_id,
        "profile_id": profile_id,
        "name": payload.name,
        "dosage": payload.dosage,
        "scheduled_time": payload.scheduled_time,
        "instructions": payload.instructions,
        "stock_remaining": payload.stock_remaining,
    }
    MEDICATIONS_STORE.setdefault(profile_id, []).append(med_record)

    log_record = {
        "id": log_id,
        "profile_id": profile_id,
        "medication_id": med_id,
        "medication_name": payload.name,
        "dosage": payload.dosage,
        "scheduled_time": payload.scheduled_time,
        "instructions": payload.instructions,
        "status": "PENDING",
        "elder_note": None,
        "reminder_sent": False,
        "actioned_at": None,
    }
    ADHERENCE_STORE[log_id] = log_record
    return {"medication": med_record, "today_adherence_log": log_record}


@app.patch("/api/v1/adherence/{log_id}")
def update_adherence_status(
    log_id: str, payload: AdherenceUpdateRequest, session: dict = Depends(get_current_session)
) -> dict:
    log_item = ADHERENCE_STORE.get(log_id)
    if not log_item or log_item["profile_id"] != session["profile_id"]:
        raise HTTPException(status_code=404, detail="Adherence log not found in your Care Circle.")

    log_item["status"] = payload.status
    log_item["elder_note"] = payload.elder_note
    log_item["updated_by_role"] = session["role"]
    log_item["actioned_at"] = datetime.now(timezone.utc).isoformat()

    profile = PROFILES_STORE[session["profile_id"]]
    if payload.status in ("MISSED", "SNOOZED"):
        send_care_circle_email(
            recipients=profile["caregiver_emails"],
            subject=f"[SushrutaCare Alert] {profile['elder_name']} dose {payload.status}",
            body=(
                f"{profile['elder_name']} marked {log_item['medication_name']} ({log_item['dosage']}) "
                f"as {payload.status}.\nElder Note: {payload.elder_note or 'No note provided.'}"
            ),
        )
    return log_item


@app.post("/api/v1/appointments", status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreateRequest, session: dict = Depends(get_current_session)
) -> dict:
    profile_id = session["profile_id"]
    profile = PROFILES_STORE[profile_id]
    gcal_url = build_google_calendar_url(
        elder_name=profile["elder_name"],
        doctor_name=payload.doctor_name,
        specialty=payload.specialty,
        appt_time=payload.appointment_time,
        location=payload.location,
    )
    appt = {
        "id": str(uuid4()),
        "profile_id": profile_id,
        "doctor_name": payload.doctor_name,
        "specialty": payload.specialty,
        "appointment_time": payload.appointment_time.isoformat(),
        "location": payload.location,
        "notes": payload.notes,
        "google_calendar_url": gcal_url,
    }
    APPOINTMENTS_STORE.setdefault(profile_id, []).append(appt)
    return appt


@app.get("/api/v1/dashboard")
def get_care_dashboard(session: dict = Depends(get_current_session)) -> dict:
    profile_id = session["profile_id"]
    profile = PROFILES_STORE[profile_id]
    logs = [log for log in ADHERENCE_STORE.values() if log["profile_id"] == profile_id]
    taken_count = sum(1 for log in logs if log["status"] == "TAKEN")
    adherence_rate = round((taken_count / len(logs)) * 100, 1) if logs else 100.0

    return {
        "elder_name": profile["elder_name"],
        "age": profile["age"],
        "blood_group": profile["blood_group"],
        "active_role": session["role"],
        "adherence_rate_percent": adherence_rate,
        "today_doses": logs,
        "appointments": APPOINTMENTS_STORE.get(profile_id, []),
    }


@app.post("/api/v1/ai/scan-prescription", response_model=AIPrescriptionParseResponse)
def scan_prescription_ai(
    payload: AIPrescriptionParseRequest, session: dict = Depends(get_current_session)
) -> AIPrescriptionParseResponse:
    return parse_prescription_and_check_interactions(
        raw_text=payload.raw_prescription_text,
        existing_medications=payload.existing_medications,
    )
