"""
Google Calendar Service — SushrutaCare AI
Generates synchronized calendar templates and deep-links for senior doctor appointments
and daily medication reminder routines.
"""

import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Optional


class GoogleCalendarService:
    @staticmethod
    def generate_appointment_link(
        elder_name: str,
        doctor_name: str,
        specialty: str,
        appointment_time: datetime,
        location: str,
        notes: Optional[str] = None,
        duration_minutes: int = 45,
    ) -> str:
        """
        Builds a one-click Google Calendar add link for an elderly doctor appointment.
        """
        start_str = appointment_time.strftime("%Y%m%dT%H%M%SZ")
        end_time = appointment_time + timedelta(minutes=duration_minutes)
        end_str = end_time.strftime("%Y%m%dT%H%M%SZ")

        details_parts = [
            f"Scheduled Doctor Visit for {elder_name}",
            f"Doctor: Dr. {doctor_name} ({specialty})",
        ]
        if notes:
            details_parts.append(f"Caregiver Notes: {notes}")
        details_parts.append("\nManaged by SushrutaCare AI Elderly Platform")

        params = {
            "action": "TEMPLATE",
            "text": f"🏥 [SushrutaCare] Dr. {doctor_name} - {elder_name}",
            "dates": f"{start_str}/{end_str}",
            "details": "\n".join(details_parts),
            "location": location,
        }
        return f"https://calendar.google.com/calendar/render?{urllib.parse.urlencode(params)}"

    @staticmethod
    def generate_medication_routine_link(
        elder_name: str,
        medication_name: str,
        dosage: str,
        scheduled_time_str: str,
        instructions: str,
    ) -> str:
        """
        Generates a recurring Google Calendar reminder template for a senior medication dose.
        """
        hour, minute = map(int, scheduled_time_str.split(":"))
        today = datetime.now()
        dose_start = today.replace(hour=hour, minute=minute, second=0, microsecond=0)
        dose_end = dose_start + timedelta(minutes=15)

        params = {
            "action": "TEMPLATE",
            "text": f"💊 Take {medication_name} ({dosage}) - {elder_name}",
            "dates": f"{dose_start.strftime('%Y%m%dT%H%M%SZ')}/{dose_end.strftime('%Y%m%dT%H%M%SZ')}",
            "details": f"Medication: {medication_name}\nDosage: {dosage}\nInstructions: {instructions}\n\nPlease take on time.",
            "recur": "RRULE:FREQ=DAILY",
        }
        return f"https://calendar.google.com/calendar/render?{urllib.parse.urlencode(params)}"
