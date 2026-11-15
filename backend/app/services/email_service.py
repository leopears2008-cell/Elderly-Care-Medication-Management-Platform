import logging
import smtplib
import ssl
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import urlencode, quote

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.settings = get_settings()

    def _send_email(self, to_email: str, subject: str, html_body: str) -> bool:
        msg = MIMEMultipart("alternative")
        msg["From"] = self.settings.gmail_sender
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        context = ssl.create_default_context()
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
                server.login(self.settings.gmail_sender, self.settings.gmail_app_password)
                server.sendmail(self.settings.gmail_sender, to_email, msg.as_string())
            logger.info(f"Email sent to {to_email}: {subject}")
            return True
        except smtplib.SMTPException as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    def send_medication_reminder(
        self,
        to_email: str,
        patient_name: str,
        medication_name: str,
        dose_time: str,
        dosage: str = "",
        instructions: str = "",
    ) -> bool:
        subject = f"💊 Medication Reminder: {medication_name} at {dose_time}"
        html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: auto; background: #ffffff; border-radius: 12px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }}
    .header {{ background: #1a5276; color: white; padding: 24px; text-align: center; }}
    .header h1 {{ margin: 0; font-size: 24px; }}
    .body {{ padding: 32px; }}
    .med-card {{ background: #eaf4fb; border-left: 6px solid #1a5276; border-radius: 8px;
                 padding: 20px; margin: 20px 0; }}
    .med-name {{ font-size: 22px; font-weight: bold; color: #1a5276; margin: 0 0 8px; }}
    .detail {{ font-size: 16px; color: #333; margin: 6px 0; }}
    .time-badge {{ display: inline-block; background: #e74c3c; color: white;
                   padding: 8px 20px; border-radius: 20px; font-size: 18px;
                   font-weight: bold; margin: 12px 0; }}
    .footer {{ background: #f8f9fa; padding: 16px; text-align: center;
               font-size: 12px; color: #888; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏥 SushrutaCare AI</h1>
      <p style="margin:4px 0 0; opacity:0.9;">Medication Reminder</p>
    </div>
    <div class="body">
      <p style="font-size:18px;">Dear <strong>{patient_name}</strong>,</p>
      <p style="font-size:16px; color:#555;">It's time to take your medication:</p>
      <div class="med-card">
        <p class="med-name">💊 {medication_name}</p>
        {f'<p class="detail"><strong>Dosage:</strong> {dosage}</p>' if dosage else ''}
        <div class="time-badge">⏰ {dose_time}</div>
        {f'<p class="detail"><strong>Instructions:</strong> {instructions}</p>' if instructions else ''}
      </div>
      <p style="font-size:14px; color:#777;">
        Please take your medication as prescribed. If you have any concerns,
        contact your healthcare provider.
      </p>
    </div>
    <div class="footer">
      <p>SushrutaCare AI — Caring for your health, every day.</p>
      <p>This is an automated reminder. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>"""
        return self._send_email(to_email, subject, html)

    def send_appointment_reminder(
        self,
        to_email: str,
        patient_name: str,
        doctor_name: str,
        appointment_dt: datetime,
        location: str = "",
        notes: str = "",
    ) -> bool:
        formatted_dt = appointment_dt.strftime("%A, %B %d, %Y at %I:%M %p")
        subject = f"📅 Appointment Reminder: Dr. {doctor_name} on {appointment_dt.strftime('%b %d')}"
        html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: auto; background: #fff; border-radius: 12px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }}
    .header {{ background: #1e8449; color: white; padding: 24px; text-align: center; }}
    .body {{ padding: 32px; }}
    .appt-card {{ background: #eafaf1; border-left: 6px solid #1e8449; border-radius: 8px;
                  padding: 20px; margin: 20px 0; }}
    .detail {{ font-size: 16px; color: #333; margin: 8px 0; }}
    .footer {{ background: #f8f9fa; padding: 16px; text-align: center;
               font-size: 12px; color: #888; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏥 SushrutaCare AI</h1>
      <p style="margin:4px 0 0; opacity:0.9;">Appointment Reminder</p>
    </div>
    <div class="body">
      <p style="font-size:18px;">Dear <strong>{patient_name}</strong>,</p>
      <p style="font-size:16px; color:#555;">You have an upcoming doctor's appointment:</p>
      <div class="appt-card">
        <p class="detail">👨‍⚕️ <strong>Doctor:</strong> Dr. {doctor_name}</p>
        <p class="detail">📅 <strong>Date & Time:</strong> {formatted_dt}</p>
        {f'<p class="detail">📍 <strong>Location:</strong> {location}</p>' if location else ''}
        {f'<p class="detail">📝 <strong>Notes:</strong> {notes}</p>' if notes else ''}
      </div>
    </div>
    <div class="footer">
      <p>SushrutaCare AI — Caring for your health, every day.</p>
    </div>
  </div>
</body>
</html>"""
        return self._send_email(to_email, subject, html)

    def generate_gcal_link(
        self,
        title: str,
        start_dt: datetime,
        end_dt: datetime,
        description: str = "",
        location: str = "",
    ) -> str:
        fmt = "%Y%m%dT%H%M%SZ"
        params = {
            "action": "TEMPLATE",
            "text": title,
            "dates": f"{start_dt.strftime(fmt)}/{end_dt.strftime(fmt)}",
            "details": description,
            "location": location,
        }
        return "https://calendar.google.com/calendar/render?" + urlencode(params)


def check_and_send_reminders():
    """Cron job: check medications due in next 30 min and send email reminders."""
    from datetime import datetime, timezone, timedelta
    from app.database import get_supabase

    logger.info("Running medication reminder check...")
    supabase = get_supabase()
    email_svc = EmailService()

    now = datetime.now(timezone.utc)
    window_end = now + timedelta(minutes=30)

    try:
        meds = (
            supabase.table("medications")
            .select("*, users(email, name)")
            .eq("is_active", True)
            .execute()
        )
        for med in (meds.data or []):
            user = med.get("users") or {}
            to_email = user.get("email")
            patient_name = user.get("name", "Patient")
            if not to_email:
                continue

            for dose_time_str in (med.get("dose_times") or []):
                try:
                    hour, minute = map(int, dose_time_str.split(":"))
                    dose_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if now <= dose_dt <= window_end:
                        email_svc.send_medication_reminder(
                            to_email=to_email,
                            patient_name=patient_name,
                            medication_name=med["name"],
                            dose_time=dose_time_str,
                            dosage=med.get("dosage", ""),
                            instructions=med.get("instructions", ""),
                        )
                except (ValueError, AttributeError) as e:
                    logger.warning(f"Invalid dose_time '{dose_time_str}': {e}")
    except Exception as e:
        logger.error(f"Reminder job error: {e}", exc_info=True)
