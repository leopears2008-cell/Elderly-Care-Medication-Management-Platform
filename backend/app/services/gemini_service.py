import json
import logging
from typing import Optional

import google.generativeai as genai
from google.generativeai.types import HarmBlockThreshold, HarmCategory

from app.config import get_settings

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self):
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
            safety_settings={
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            },
        )

    async def scan_prescription(self, image_bytes: bytes, mime_type: str) -> dict:
        """Extract medication information from a prescription image."""
        import asyncio

        prompt = """Analyze this prescription image and extract all medication information.
Return a JSON object with this exact structure:
{
  "medications": [
    {
      "name": "medication name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. twice daily",
      "dose_times": ["08:00", "20:00"],
      "instructions": "e.g. take with food",
      "prescribing_doctor": "doctor name if visible",
      "duration": "e.g. 7 days"
    }
  ],
  "raw_text": "verbatim text found on prescription",
  "confidence": 0.95
}
If no medications are found, return {"medications": [], "raw_text": "", "confidence": 0.0}
Respond ONLY with valid JSON."""

        image_part = {"mime_type": mime_type, "data": image_bytes}

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content([prompt, image_part]),
            )
            text = response.text.strip()
            # Strip markdown code fences if present
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Gemini returned invalid JSON for prescription scan: {e}")
            return {"medications": [], "raw_text": "", "confidence": 0.0}
        except Exception as e:
            logger.error(f"Gemini prescription scan error: {e}")
            raise

    async def check_drug_interactions(self, medications: list[str]) -> dict:
        """Check for drug interactions between medications."""
        import asyncio

        meds_list = ", ".join(medications)
        prompt = f"""You are a clinical pharmacology expert. Analyze potential drug interactions between: {meds_list}

Return a JSON object with this exact structure:
{{
  "interactions": [
    {{
      "drug_a": "medication name",
      "drug_b": "medication name",
      "severity": "none|mild|moderate|severe",
      "description": "detailed explanation of the interaction",
      "mechanism": "pharmacological mechanism",
      "clinical_significance": "clinical impact description"
    }}
  ],
  "severity": "none|mild|moderate|severe",
  "recommendations": [
    "specific actionable recommendation"
  ],
  "disclaimer": "This is AI-generated information. Always consult a pharmacist or doctor."
}}

severity should be the highest severity found across all interactions.
Respond ONLY with valid JSON."""

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(prompt),
            )
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Gemini returned invalid JSON for drug interactions: {e}")
            return {
                "interactions": [],
                "severity": "unknown",
                "recommendations": ["Unable to analyze interactions. Please consult a pharmacist."],
                "disclaimer": "This is AI-generated information. Always consult a pharmacist or doctor.",
            }
        except Exception as e:
            logger.error(f"Gemini drug interaction error: {e}")
            raise
