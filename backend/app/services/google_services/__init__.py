"""
Google Services Modular Package — SushrutaCare AI
Integrates Google Gemini 2.5 Flash, Firebase (Firestore & FCM), Google Calendar, and Google Maps.
"""

from .gemini_assistant import GeminiMedicationAssistant
from .calendar_service import GoogleCalendarService
from .maps_service import GoogleMapsEmergencyService
from .firebase_sync import FirebaseCareSync

__all__ = [
    "GeminiMedicationAssistant",
    "GoogleCalendarService",
    "GoogleMapsEmergencyService",
    "FirebaseCareSync",
]
