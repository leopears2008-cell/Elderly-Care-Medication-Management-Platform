import json
import logging
from typing import List
from app.config import settings
from app.schemas import AIPrescriptionParseResponse

logger = logging.getLogger(__name__)


def parse_prescription_and_check_interactions(
    raw_text: str, existing_medications: List[str]
) -> AIPrescriptionParseResponse:
    """
    Uses Google Gemini 2.5 Flash with Structured JSON Schema to parse doctor notes
    into an elder-friendly schedule and flag potential polypharmacy conflicts.
    Includes a deterministic fallback if the API key is missing or quota is reached.
    """
    # Fast path for missing or mock/test API keys (avoids failing network calls in CI)
    if (
        not settings.GEMINI_API_KEY
        or settings.GEMINI_API_KEY.startswith("test-")
        or settings.GEMINI_API_KEY == "replace-with-gemini-key"
    ):
        return _deterministic_fallback(raw_text, existing_medications)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        prompt = (
            f"Prescription input: '{raw_text}'. "
            f"Current active medications: {existing_medications}. "
            "Extract the medication name, dosage, 24-hour HH:MM time, a warm 1-sentence instruction "
            "written directly for an elderly person, and any interaction or timing warning."
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "medication_name": {"type": "STRING"},
                        "dosage": {"type": "STRING"},
                        "scheduled_time": {"type": "STRING"},
                        "elder_friendly_summary": {"type": "STRING"},
                        "interaction_warning": {"type": "STRING", "nullable": True},
                    },
                    "required": [
                        "medication_name",
                        "dosage",
                        "scheduled_time",
                        "elder_friendly_summary",
                    ],
                },
            ),
        )
        data = json.loads(response.text)
        return AIPrescriptionParseResponse(
            medication_name=data["medication_name"],
            dosage=data["dosage"],
            scheduled_time=data["scheduled_time"] if ":" in data["scheduled_time"] else "08:00",
            elder_friendly_summary=data["elder_friendly_summary"],
            interaction_warning=data.get("interaction_warning"),
            ai_source="gemini-2.5-flash",
        )
    except Exception as exc:
        logger.warning("Gemini API fallback triggered: %s", exc)
        return _deterministic_fallback(raw_text, existing_medications)


def _deterministic_fallback(
    raw_text: str, existing_medications: List[str]
) -> AIPrescriptionParseResponse:
    tokens = raw_text.strip().split()
    med_name = tokens[0].capitalize() if tokens else "Prescribed Medication"
    dosage = next((t for t in tokens if "mg" in t.lower() or "ml" in t.lower()), "1 Tablet")
    time_str = "20:00" if "night" in raw_text.lower() or "dinner" in raw_text.lower() else "08:00"
    warning = None
    if any(med.lower() == med_name.lower() for med in existing_medications):
        warning = f"Duplicate medication alert: {med_name} is already in the active schedule."

    return AIPrescriptionParseResponse(
        medication_name=med_name,
        dosage=dosage,
        scheduled_time=time_str,
        elder_friendly_summary=f"Please take {dosage} of {med_name} at {time_str} with water.",
        interaction_warning=warning,
        ai_source="deterministic-fallback",
    )
