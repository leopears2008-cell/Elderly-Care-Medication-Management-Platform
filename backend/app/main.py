from datetime import datetime, timezone
from typing import Dict, List, Optional
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
    EmergencyPlacesResponse,
    InteractionCheckRequest,
    InteractionCheckResponse,
    MedicationCreateRequest,
    PasscodeLoginRequest,
    ProfileCreateRequest,
    RefillAlertResponse,
    SideEffectsRequest,
    SideEffectsResponse,
    SOSAlertRequest,
    SOSAlertResponse,
    VitalsLogRequest,
    VitalsLogResponse,
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
from app.services.google_services import (
    FirebaseCareSync,
    GeminiMedicationAssistant,
    GoogleCalendarService,
    GoogleMapsEmergencyService,
)

app = FastAPI(
    title="SushrutaCare AI — Elderly Care & Medication Platform",
    version="1.0.0",
    description="Passcode-secured Care Circle API with Google Gemini 2.5 Flash, Firebase, Google Calendar & Google Maps.",
)

cors_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
if "https://frontend-two-opal-22.vercel.app" not in cors_origins:
    cors_origins.append("https://frontend-two-opal-22.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store mirrored with Supabase adapter so local & CI tests run with zero external flakiness
PROFILES_STORE: Dict[str, dict] = {}
MEDICATIONS_STORE: Dict[str, List[dict]] = {}
ADHERENCE_STORE: Dict[str, dict] = {}
APPOINTMENTS_STORE: Dict[str, List[dict]] = {}
VITALS_STORE: Dict[str, List[dict]] = {}
SOS_STORE: Dict[str, List[dict]] = {}

# Google Services Instances
gemini_assistant = GeminiMedicationAssistant()
firebase_sync = FirebaseCareSync()
maps_service = GoogleMapsEmergencyService()
calendar_service = GoogleCalendarService()


@app.get("/")
def home() -> dict:
    return {"message": "Backend is running"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "sushrutacare-api"}


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
    VITALS_STORE[profile_id] = []
    SOS_STORE[profile_id] = []
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
    
    # Sync with Firebase Firestore Care Sync
    firebase_sync.sync_adherence_to_firestore(
        profile_id=session["profile_id"],
        dose_id=log_id,
        status=payload.status,
        elder_note=payload.elder_note,
    )

    if payload.status in ("MISSED", "SNOOZED"):
        # Send FCM push notification to caregivers
        firebase_sync.send_missed_dose_fcm_push(
            fcm_tokens=["caregiver-device-token-sample"],
            elder_name=profile["elder_name"],
            medication_name=log_item["medication_name"],
            dosage=log_item["dosage"],
        )

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
    gcal_url = calendar_service.generate_appointment_link(
        elder_name=profile["elder_name"],
        doctor_name=payload.doctor_name,
        specialty=payload.specialty,
        appointment_time=payload.appointment_time,
        location=payload.location,
        notes=payload.notes,
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


@app.post("/api/v1/sos", response_model=SOSAlertResponse, status_code=status.HTTP_201_CREATED)
def trigger_emergency_sos(
    payload: SOSAlertRequest, session: dict = Depends(get_current_session)
) -> SOSAlertResponse:
    profile_id = session["profile_id"]
    profile = PROFILES_STORE[profile_id]
    alert_id = str(uuid4())
    now_str = datetime.now(timezone.utc).isoformat()

    directions_url = maps_service.get_emergency_directions_url(
        destination_hospital="Nearest Emergency Hospital",
        origin_lat=payload.current_latitude,
        origin_lng=payload.current_longitude,
    )

    # Dispatches Firebase FCM push alert
    firebase_sync.send_emergency_sos_push(
        fcm_tokens=["caregiver-emergency-fcm-token"],
        elder_name=profile["elder_name"],
        alert_message=payload.note or f"Immediate assistance requested: {payload.emergency_type}",
        vitals={"emergency_type": payload.emergency_type},
    )

    # Dispatches high-urgency care circle emails
    send_care_circle_email(
        recipients=profile["caregiver_emails"],
        subject=f"🚨 [URGENT SOS ALERT] {profile['elder_name']} needs immediate help!",
        body=(
            f"EMERGENCY SOS triggered by {profile['elder_name']} at {now_str}.\n"
            f"Type: {payload.emergency_type}\n"
            f"Note: {payload.note or 'No extra notes provided.'}\n"
            f"Hospital Directions: {directions_url}\n"
            f"Please contact emergency services (112 / 911) or check immediately!"
        ),
    )

    alert_record = {
        "alert_id": alert_id,
        "profile_id": profile_id,
        "elder_name": profile["elder_name"],
        "emergency_type": payload.emergency_type,
        "note": payload.note,
        "triggered_at": now_str,
        "caregivers_notified_count": len(profile["caregiver_emails"]),
        "emergency_directions_url": directions_url,
        "status": "TRIGGERED",
    }
    SOS_STORE.setdefault(profile_id, []).append(alert_record)
    return SOSAlertResponse(**alert_record)


@app.get("/api/v1/sos", response_model=List[SOSAlertResponse])
def get_sos_history(session: dict = Depends(get_current_session)) -> List[SOSAlertResponse]:
    profile_id = session["profile_id"]
    return [SOSAlertResponse(**a) for a in SOS_STORE.get(profile_id, [])]


@app.post("/api/v1/vitals", response_model=VitalsLogResponse, status_code=status.HTTP_201_CREATED)
def log_elder_vitals(
    payload: VitalsLogRequest, session: dict = Depends(get_current_session)
) -> VitalsLogResponse:
    profile_id = session["profile_id"]
    vitals_id = str(uuid4())
    now_str = datetime.now(timezone.utc).isoformat()

    # Formulate senior status assessment
    assessments = []
    if payload.systolic_bp is not None:
        if payload.systolic_bp > 140:
            assessments.append("High Systolic BP (>140)")
        elif payload.systolic_bp < 90:
            assessments.append("Low Systolic BP (<90)")
    if payload.oxygen_saturation_spo2 is not None:
        if payload.oxygen_saturation_spo2 < 92:
            assessments.append("Low SpO2 (<92%)")
    if payload.heart_rate is not None:
        if payload.heart_rate > 100:
            assessments.append("Elevated Pulse (>100 bpm)")
        elif payload.heart_rate < 50:
            assessments.append("Low Pulse (<50 bpm)")
    if payload.blood_glucose_mg_dl is not None:
        if payload.blood_glucose_mg_dl > 180:
            assessments.append("High Blood Sugar (>180 mg/dL)")
        elif payload.blood_glucose_mg_dl < 70:
            assessments.append("Low Blood Sugar (<70 mg/dL)")

    status_str = " | ".join(assessments) if assessments else "All Measured Vitals Within Normal Senior Range"

    record = {
        "id": vitals_id,
        "profile_id": profile_id,
        "systolic_bp": payload.systolic_bp,
        "diastolic_bp": payload.diastolic_bp,
        "heart_rate": payload.heart_rate,
        "blood_glucose_mg_dl": payload.blood_glucose_mg_dl,
        "oxygen_saturation_spo2": payload.oxygen_saturation_spo2,
        "elder_note": payload.elder_note,
        "logged_at": now_str,
        "status_assessment": status_str,
    }
    VITALS_STORE.setdefault(profile_id, []).append(record)
    return VitalsLogResponse(**record)


@app.get("/api/v1/vitals", response_model=List[VitalsLogResponse])
def get_vitals_history(session: dict = Depends(get_current_session)) -> List[VitalsLogResponse]:
    profile_id = session["profile_id"]
    return [VitalsLogResponse(**v) for v in reversed(VITALS_STORE.get(profile_id, []))]


@app.get("/api/v1/medications/refills", response_model=List[RefillAlertResponse])
def get_medication_refill_status(
    session: dict = Depends(get_current_session),
) -> List[RefillAlertResponse]:
    profile_id = session["profile_id"]
    meds = MEDICATIONS_STORE.get(profile_id, [])
    refills = []
    for med in meds:
        stock = med.get("stock_remaining", 0)
        is_low = stock <= 5
        urgency = "CRITICAL_EMPTY" if stock == 0 else ("LOW_STOCK" if is_low else "NORMAL")
        refills.append(
            RefillAlertResponse(
                medication_id=med["id"],
                name=med["name"],
                dosage=med["dosage"],
                stock_remaining=stock,
                is_low_stock=is_low,
                days_left_approx=stock,
                refill_urgency=urgency,
            )
        )
    return refills


@app.post("/api/v1/ai/interaction-check", response_model=InteractionCheckResponse)
def check_interactions_ai(
    payload: InteractionCheckRequest, session: dict = Depends(get_current_session)
) -> InteractionCheckResponse:
    res = gemini_assistant.check_food_and_drug_interactions(
        medication_name=payload.medication_name,
        existing_medications=payload.existing_medications,
    )
    return InteractionCheckResponse(
        has_interaction=res["has_interaction"],
        severity=res["severity"],
        adverse_drug_conflicts=res["adverse_drug_conflicts"],
        foods_to_avoid=res["foods_to_avoid"],
        elder_friendly_guidance=res["elder_friendly_guidance"],
        ai_source=res.get("ai_source", "gemini-2.5-flash"),
    )


@app.post("/api/v1/ai/side-effects", response_model=SideEffectsResponse)
def explain_side_effects_ai(
    payload: SideEffectsRequest, session: dict = Depends(get_current_session)
) -> SideEffectsResponse:
    res = gemini_assistant.explain_side_effects_for_seniors(medication_name=payload.medication_name)
    return SideEffectsResponse(
        medication_name=res["medication_name"],
        common_sensations=res["common_sensations"],
        when_to_alert_caregiver=res["when_to_alert_caregiver"],
        senior_safety_tip=res["senior_safety_tip"],
        ai_source=res.get("ai_source", "gemini-2.5-flash"),
    )


@app.get("/api/v1/emergency/places", response_model=EmergencyPlacesResponse)
def get_emergency_places(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    session: dict = Depends(get_current_session),
) -> EmergencyPlacesResponse:
    return EmergencyPlacesResponse(
        nearby_pharmacies_url=maps_service.find_nearby_pharmacies_url(lat, lng),
        nearby_hospitals_url=maps_service.find_nearby_hospitals_url(lat, lng),
        emergency_directions_url=maps_service.get_emergency_directions_url("Nearest Emergency Hospital", lat, lng),
        emergency_hotline="112 / 911",
    )


@app.get("/api/v1/dashboard")
def get_care_dashboard(session: dict = Depends(get_current_session)) -> dict:
    profile_id = session["profile_id"]
    profile = PROFILES_STORE[profile_id]
    logs = [log for log in ADHERENCE_STORE.values() if log["profile_id"] == profile_id]
    taken_count = sum(1 for log in logs if log["status"] == "TAKEN")
    adherence_rate = round((taken_count / len(logs)) * 100, 1) if logs else 100.0

    meds = MEDICATIONS_STORE.get(profile_id, [])
    low_stock_meds = [m for m in meds if m.get("stock_remaining", 0) <= 5]
    latest_vitals = VITALS_STORE.get(profile_id, [])[-1] if VITALS_STORE.get(profile_id) else None
    active_sos = [a for a in SOS_STORE.get(profile_id, []) if a.get("status") == "TRIGGERED"]

    return {
        "elder_name": profile["elder_name"],
        "age": profile["age"],
        "blood_group": profile["blood_group"],
        "active_role": session["role"],
        "adherence_rate_percent": adherence_rate,
        "today_doses": logs,
        "appointments": APPOINTMENTS_STORE.get(profile_id, []),
        "low_stock_refill_alerts": low_stock_meds,
        "latest_vitals": latest_vitals,
        "active_sos_alerts": active_sos,
    }


@app.post("/api/v1/ai/scan-prescription", response_model=AIPrescriptionParseResponse)
def scan_prescription_ai(
    payload: AIPrescriptionParseRequest, session: dict = Depends(get_current_session)
) -> AIPrescriptionParseResponse:
    return parse_prescription_and_check_interactions(
        raw_text=payload.raw_prescription_text,
        existing_medications=payload.existing_medications,
    )
