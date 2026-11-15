from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase
from app.schemas import (
    AdherenceLog,
    AdherenceResponse,
    AdherenceStats,
    MedicationCreate,
    MedicationResponse,
    MedicationUpdate,
)
from app.security import get_current_user

router = APIRouter(prefix="/medications", tags=["Medications"])


@router.get("", response_model=List[MedicationResponse])
async def list_medications(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("medications")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("", response_model=MedicationResponse, status_code=status.HTTP_201_CREATED)
async def create_medication(
    body: MedicationCreate, current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    payload = body.model_dump()
    payload["user_id"] = current_user["user_id"]
    # Convert date objects to ISO strings
    for field in ("start_date", "end_date"):
        if payload.get(field):
            payload[field] = payload[field].isoformat()

    result = supabase.table("medications").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create medication")
    return result.data[0]


@router.put("/{medication_id}", response_model=MedicationResponse)
async def update_medication(
    medication_id: UUID,
    body: MedicationUpdate,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    # Verify ownership
    existing = (
        supabase.table("medications")
        .select("id")
        .eq("id", str(medication_id))
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Medication not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for field in ("start_date", "end_date"):
        if updates.get(field):
            updates[field] = updates[field].isoformat()

    result = (
        supabase.table("medications").update(updates).eq("id", str(medication_id)).execute()
    )
    return result.data[0]


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(
    medication_id: UUID, current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    existing = (
        supabase.table("medications")
        .select("id")
        .eq("id", str(medication_id))
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Medication not found")

    supabase.table("medications").update({"is_active": False}).eq(
        "id", str(medication_id)
    ).execute()


@router.post("/adherence/{medication_id}", response_model=AdherenceResponse, status_code=201)
async def log_adherence(
    medication_id: UUID,
    body: AdherenceLog,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    payload = {
        "medication_id": str(medication_id),
        "user_id": current_user["user_id"],
        "scheduled_time": body.scheduled_time.isoformat(),
        "taken_at": datetime.now(timezone.utc).isoformat() if body.status == "taken" else None,
        "status": body.status,
        "notes": body.notes,
    }
    result = supabase.table("adherence_logs").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to log adherence")
    return result.data[0]


@router.get("/adherence/{medication_id}", response_model=AdherenceStats)
async def get_adherence(
    medication_id: UUID, current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    med_result = (
        supabase.table("medications")
        .select("*")
        .eq("id", str(medication_id))
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not med_result.data:
        raise HTTPException(status_code=404, detail="Medication not found")

    logs_result = (
        supabase.table("adherence_logs")
        .select("*")
        .eq("medication_id", str(medication_id))
        .order("scheduled_time", desc=True)
        .execute()
    )
    logs = logs_result.data or []
    taken = sum(1 for l in logs if l["status"] == "taken")
    missed = sum(1 for l in logs if l["status"] == "missed")
    total = taken + missed
    pct = round((taken / total) * 100, 1) if total > 0 else 0.0

    return AdherenceStats(
        medication_id=medication_id,
        medication_name=med_result.data[0]["name"],
        total_doses=total,
        taken=taken,
        missed=missed,
        adherence_percent=pct,
        logs=logs,
    )
