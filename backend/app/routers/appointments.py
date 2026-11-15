from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase
from app.schemas import AppointmentCreate, AppointmentResponse, AppointmentUpdate
from app.security import get_current_user
from app.services.email_service import EmailService

router = APIRouter(prefix="/appointments", tags=["Appointments"])
email_service = EmailService()


@router.get("", response_model=List[AppointmentResponse])
async def list_appointments(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("appointments")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("appointment_dt", desc=False)
        .execute()
    )
    return result.data or []


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    body: AppointmentCreate, current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    payload = body.model_dump()
    payload["user_id"] = current_user["user_id"]
    payload["appointment_dt"] = payload["appointment_dt"].isoformat()

    result = supabase.table("appointments").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create appointment")
    return result.data[0]


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: UUID,
    body: AppointmentUpdate,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    existing = (
        supabase.table("appointments")
        .select("id")
        .eq("id", str(appointment_id))
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Appointment not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "appointment_dt" in updates:
        updates["appointment_dt"] = updates["appointment_dt"].isoformat()

    result = (
        supabase.table("appointments").update(updates).eq("id", str(appointment_id)).execute()
    )
    return result.data[0]


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_appointment(
    appointment_id: UUID, current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    existing = (
        supabase.table("appointments")
        .select("id")
        .eq("id", str(appointment_id))
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Appointment not found")

    supabase.table("appointments").delete().eq("id", str(appointment_id)).execute()


@router.post("/{appointment_id}/calendar-link")
async def get_calendar_link(
    appointment_id: UUID, current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    result = (
        supabase.table("appointments")
        .select("*")
        .eq("id", str(appointment_id))
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt = result.data[0]
    from datetime import datetime, timedelta

    start_dt = datetime.fromisoformat(appt["appointment_dt"])
    end_dt = start_dt + timedelta(minutes=appt.get("duration_minutes", 30))

    link = email_service.generate_gcal_link(
        title=f"Doctor Appointment - {appt['doctor_name']}",
        start_dt=start_dt,
        end_dt=end_dt,
        description=appt.get("notes") or "",
        location=appt.get("location") or "",
    )
    return {"calendar_link": link}
