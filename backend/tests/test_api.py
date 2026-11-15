"""
Pytest test suite for SushrutaCare AI API.
Run with: pytest backend/tests/ -v
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture
def mock_supabase():
    """Mock Supabase client to avoid real DB calls in tests."""
    with patch("app.database.get_supabase") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
async def async_client(mock_supabase):
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def test_user_data():
    return {
        "email": "test.elder@sushrutacare.com",
        "name": "Test Patient",
        "passcode": "123456",
        "role": "elder",
    }


@pytest.fixture
def mock_registered_user():
    return {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "test.elder@sushrutacare.com",
        "name": "Test Patient",
        "role": "elder",
        "passcode_hash": "$2b$12$placeholder_hash",
        "created_at": "2026-01-01T00:00:00+00:00",
    }


# ── Health Check ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_health_check(async_client):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "SushrutaCare AI"


# ── Auth: Register ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_register_user_success(async_client, mock_supabase, test_user_data, mock_registered_user):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [mock_registered_user]

    response = await async_client.post("/api/v1/auth/register", json=test_user_data)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == test_user_data["email"]


@pytest.mark.asyncio
async def test_register_duplicate_email(async_client, mock_supabase, test_user_data, mock_registered_user):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [mock_registered_user]

    response = await async_client.post("/api/v1/auth/register", json=test_user_data)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_passcode(async_client, mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    payload = {
        "email": "user@test.com",
        "name": "Test",
        "passcode": "abc123",  # non-digit
        "role": "elder",
    }
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


# ── Auth: Login ───────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_login_valid_credentials(async_client, mock_supabase, mock_registered_user):
    from app.security import hash_passcode
    mock_registered_user["passcode_hash"] = hash_passcode("123456")
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [mock_registered_user]

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "test.elder@sushrutacare.com", "passcode": "123456"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


@pytest.mark.asyncio
async def test_login_invalid_credentials(async_client, mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@test.com", "passcode": "000000"},
    )
    assert response.status_code == 401


# ── Medications ───────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_medication_unauthenticated(async_client):
    payload = {
        "name": "Aspirin",
        "dosage": "100mg",
        "frequency": "once daily",
        "dose_times": ["08:00"],
    }
    response = await async_client.post("/api/v1/medications", json=payload)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_medication_authenticated(async_client, mock_supabase, mock_registered_user):
    from app.security import create_access_token
    token = create_access_token({"sub": mock_registered_user["id"], "email": mock_registered_user["email"], "role": "elder"})
    headers = {"Authorization": f"Bearer {token}"}

    mock_medication = {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "user_id": mock_registered_user["id"],
        "name": "Aspirin",
        "dosage": "100mg",
        "frequency": "once daily",
        "dose_times": ["08:00"],
        "instructions": None,
        "prescribing_doctor": None,
        "start_date": None,
        "end_date": None,
        "is_active": True,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [mock_medication]

    response = await async_client.post(
        "/api/v1/medications",
        json={"name": "Aspirin", "dosage": "100mg", "frequency": "once daily", "dose_times": ["08:00"]},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Aspirin"


# ── AI: Prescription Scan ────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_prescription_scan_no_file(async_client, mock_registered_user):
    from app.security import create_access_token
    token = create_access_token({"sub": mock_registered_user["id"], "email": mock_registered_user["email"], "role": "elder"})
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.post("/api/v1/ai/prescription-scan", headers=headers)
    assert response.status_code == 422  # Missing required file field


@pytest.mark.asyncio
async def test_prescription_scan_invalid_type(async_client, mock_registered_user):
    from app.security import create_access_token
    import io
    token = create_access_token({"sub": mock_registered_user["id"], "email": mock_registered_user["email"], "role": "elder"})
    headers = {"Authorization": f"Bearer {token}"}

    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    response = await async_client.post(
        "/api/v1/ai/prescription-scan",
        files={"file": ("prescription.pdf", fake_pdf, "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 400


# ── Error States ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_404_unknown_route(async_client):
    response = await async_client.get("/api/v1/nonexistent-route")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_medication_not_found(async_client, mock_supabase, mock_registered_user):
    from app.security import create_access_token
    token = create_access_token({"sub": mock_registered_user["id"], "email": mock_registered_user["email"], "role": "elder"})
    headers = {"Authorization": f"Bearer {token}"}

    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []

    response = await async_client.delete(
        "/api/v1/medications/550e8400-e29b-41d4-a716-446655440099",
        headers=headers,
    )
    assert response.status_code == 404
