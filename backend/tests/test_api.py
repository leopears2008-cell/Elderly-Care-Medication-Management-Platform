from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


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
