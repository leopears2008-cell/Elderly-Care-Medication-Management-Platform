import smtplib
import urllib.parse
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import List
from app.config import settings


def build_google_calendar_url(
    elder_name: str, doctor_name: str, specialty: str, appt_time: datetime, location: str
) -> str:
    start_str = appt_time.strftime("%Y%m%dT%H%M%SZ")
    end_str = (appt_time + timedelta(minutes=45)).strftime("%Y%m%dT%H%M%SZ")
    params = {
        "action": "TEMPLATE",
        "text": f"[SushrutaCare] {elder_name} - Dr. {doctor_name} ({specialty})",
        "dates": f"{start_str}/{end_str}",
        "details": f"Scheduled elderly care visit for {elder_name} with Dr. {doctor_name}.",
        "location": location,
    }
    return f"https://calendar.google.com/calendar/render?{urllib.parse.urlencode(params)}"


def send_care_circle_email(recipients: List[str], subject: str, body: str) -> bool:
    if not settings.SMTP_USER or not settings.SMTP_APP_PASSWORD:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_APP_PASSWORD)
        server.send_message(msg)
    return True
