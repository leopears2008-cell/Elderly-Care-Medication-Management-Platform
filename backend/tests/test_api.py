from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_and_health_endpoints():
    root_res = client.get("/")
    assert root_res.status_code == 200
    assert root_res.json()["message"] == "Backend is running"

    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "ok"


def test_full_elder_care_circle_lifecycle():
    # 1. Create Elder Profile with 6-digit passcode
    create_res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Lakshmi Narayanan",
            "age": 74,
            "blood_group": "B+",
            "passcode": "654321",
            "caregiver_emails": ["son@example.com"],
            "preferred_language": "ta-IN",
        },
    )
    assert create_res.status_code == 201
    profile_id = create_res.json()["profile_id"]

    # 2. Authenticate as CARETAKER using passcode
    auth_res = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "654321", "role": "CARETAKER"},
    )
    assert auth_res.status_code == 200
    caretaker_token = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {caretaker_token}"}

    # 3. Scan Prescription via AI endpoint
    ai_res = client.post(
        "/api/v1/ai/scan-prescription",
        headers=headers,
        json={
            "raw_prescription_text": "Metformin 500mg night after dinner",
            "existing_medications": [],
        },
    )
    assert ai_res.status_code == 200
    parsed = ai_res.json()
    assert parsed["medication_name"] != ""

    # 4. Add Medication Schedule
    med_res = client.post(
        "/api/v1/medications",
        headers=headers,
        json={
            "name": parsed["medication_name"],
            "dosage": parsed["dosage"],
            "scheduled_time": parsed["scheduled_time"],
            "instructions": parsed["elder_friendly_summary"],
            "stock_remaining": 30,
        },
    )
    assert med_res.status_code == 201
    log_id = med_res.json()["today_adherence_log"]["id"]

    # 5. Elder marks dose as SNOOZED with autonomy context note
    patch_res = client.patch(
        f"/api/v1/adherence/{log_id}",
        headers=headers,
        json={"status": "SNOOZED", "elder_note": "Eating dinner 20 mins late"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "SNOOZED"


def test_rbac_blocks_family_viewer_from_editing_medications():
    create_res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Ramaswamy K",
            "age": 79,
            "blood_group": "O+",
            "passcode": "112233",
            "caregiver_emails": ["daughter@example.com"],
        },
    )
    profile_id = create_res.json()["profile_id"]

    family_auth = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "112233", "role": "FAMILY"},
    )
    family_token = family_auth.json()["access_token"]

    forbidden_res = client.post(
        "/api/v1/medications",
        headers={"Authorization": f"Bearer {family_token}"},
        json={
            "name": "Aspirin",
            "dosage": "75mg",
            "scheduled_time": "09:00",
            "instructions": "Take after breakfast",
            "stock_remaining": 15,
        },
    )
    assert forbidden_res.status_code == 403


def test_brute_force_passcode_lockout():
    create_res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Meenakshi S",
            "age": 70,
            "blood_group": "A+",
            "passcode": "998877",
            "caregiver_emails": ["care@example.com"],
        },
    )
    profile_id = create_res.json()["profile_id"]

    for _ in range(5):
        bad_res = client.post(
            "/api/v1/auth/passcode",
            json={"profile_id": profile_id, "passcode": "000000", "role": "ELDER"},
        )
        assert bad_res.status_code == 401

    locked_res = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "998877", "role": "ELDER"},
    )
    assert locked_res.status_code == 429


def test_emergency_sos_trigger_and_places():
    # 1. Create Profile
    res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Karpagam Ammal",
            "age": 82,
            "blood_group": "AB+",
            "passcode": "334455",
            "caregiver_emails": ["caregiver@example.com"],
        },
    )
    assert res.status_code == 201
    profile_id = res.json()["profile_id"]

    # 2. Login
    auth_res = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "334455", "role": "ELDER"},
    )
    token = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Trigger SOS
    sos_res = client.post(
        "/api/v1/sos",
        headers=headers,
        json={
            "emergency_type": "FALL_DETECTED",
            "note": "Fell near bathroom, pain in knee",
            "current_latitude": 13.0827,
            "current_longitude": 80.2707,
        },
    )
    assert sos_res.status_code == 201
    sos_data = sos_res.json()
    assert sos_data["status"] == "TRIGGERED"
    assert sos_data["caregivers_notified_count"] == 1
    assert "https://www.google.com/maps/dir/" in sos_data["emergency_directions_url"]

    # 4. Get SOS history
    hist_res = client.get("/api/v1/sos", headers=headers)
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1

    # 5. Get Emergency places
    places_res = client.get("/api/v1/emergency/places?lat=13.0827&lng=80.2707", headers=headers)
    assert places_res.status_code == 200
    places = places_res.json()
    assert "pharmacy" in places["nearby_pharmacies_url"]
    assert "hospital" in places["nearby_hospitals_url"]


def test_vitals_logging_and_assessment():
    res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Subramanian V",
            "age": 76,
            "blood_group": "O-",
            "passcode": "778899",
            "caregiver_emails": ["doctor_son@example.com"],
        },
    )
    profile_id = res.json()["profile_id"]

    auth_res = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "778899", "role": "CARETAKER"},
    )
    token = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Log normal vitals
    vitals_res = client.post(
        "/api/v1/vitals",
        headers=headers,
        json={
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "heart_rate": 72,
            "blood_glucose_mg_dl": 105.0,
            "oxygen_saturation_spo2": 98,
            "elder_note": "Morning reading after mild walk",
        },
    )
    assert vitals_res.status_code == 201
    assert "Normal" in vitals_res.json()["status_assessment"]

    # Log elevated vitals
    elev_res = client.post(
        "/api/v1/vitals",
        headers=headers,
        json={
            "systolic_bp": 155,
            "diastolic_bp": 95,
            "oxygen_saturation_spo2": 90,
        },
    )
    assert elev_res.status_code == 201
    elev_data = elev_res.json()
    assert "High Systolic BP" in elev_data["status_assessment"]
    assert "Low SpO2" in elev_data["status_assessment"]

    # History
    history_res = client.get("/api/v1/vitals", headers=headers)
    assert history_res.status_code == 200
    assert len(history_res.json()) == 2


def test_ai_interaction_check_and_side_effects():
    res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Shantha G",
            "age": 71,
            "blood_group": "A+",
            "passcode": "445566",
            "caregiver_emails": ["caregiver2@example.com"],
        },
    )
    profile_id = res.json()["profile_id"]

    auth_res = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "445566", "role": "ELDER"},
    )
    token = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Interaction Check
    inter_res = client.post(
        "/api/v1/ai/interaction-check",
        headers=headers,
        json={
            "medication_name": "Atorvastatin",
            "existing_medications": ["Amlodipine", "Metformin"],
        },
    )
    assert inter_res.status_code == 200
    inter_data = inter_res.json()
    assert "foods_to_avoid" in inter_data
    assert "elder_friendly_guidance" in inter_data

    # Side Effects Explanation
    side_res = client.post(
        "/api/v1/ai/side-effects",
        headers=headers,
        json={"medication_name": "Metformin"},
    )
    assert side_res.status_code == 200
    side_data = side_res.json()
    assert "common_sensations" in side_data
    assert "when_to_alert_caregiver" in side_data


def test_medication_refill_tracking():
    res = client.post(
        "/api/v1/profiles",
        json={
            "elder_name": "Govindarajulu N",
            "age": 80,
            "blood_group": "B-",
            "passcode": "556677",
            "caregiver_emails": ["daughter_nurse@example.com"],
        },
    )
    profile_id = res.json()["profile_id"]

    auth_res = client.post(
        "/api/v1/auth/passcode",
        json={"profile_id": profile_id, "passcode": "556677", "role": "CARETAKER"},
    )
    token = auth_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Add medicine with 3 pills left
    med_res = client.post(
        "/api/v1/medications",
        headers=headers,
        json={
            "name": "Thyroxine",
            "dosage": "50mcg",
            "scheduled_time": "06:30",
            "instructions": "Empty stomach morning",
            "stock_remaining": 3,
        },
    )
    assert med_res.status_code == 201

    # Check refills endpoint
    refill_res = client.get("/api/v1/medications/refills", headers=headers)
    assert refill_res.status_code == 200
    refills = refill_res.json()
    assert len(refills) == 1
    assert refills[0]["is_low_stock"] is True
    assert refills[0]["refill_urgency"] == "LOW_STOCK"
