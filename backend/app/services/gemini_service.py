import asyncio
import json
import logging
from typing import List, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self):
        self.settings = get_settings()
        self._client = None
        self._legacy_model = None
        self._init_client()

    def _init_client(self):
        # Prefer new google-genai SDK
        try:
            from google import genai
            self._client = genai.Client(api_key=self.settings.gemini_api_key)
            logger.info("Using google-genai SDK client")
            return
        except ImportError:
            pass

        # Fallback to legacy google-generativeai SDK
        try:
            import google.generativeai as legacy_genai
            from google.generativeai.types import HarmBlockThreshold, HarmCategory

            legacy_genai.configure(api_key=self.settings.gemini_api_key)
            self._legacy_model = legacy_genai.GenerativeModel(
                model_name="gemini-2.5-flash",
                generation_config=legacy_genai.GenerationConfig(
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
            logger.info("Using legacy google-generativeai SDK model")
        except ImportError:
            logger.warning("No Google GenAI SDK available. Gemini requests will return mock/fallback responses.")

    async def scan_prescription(self, image_bytes: bytes, mime_type: str) -> dict:
        """Extract medication information from a prescription image."""
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

        try:
            loop = asyncio.get_event_loop()

            if self._client is not None:
                from google.genai import types

                part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
                config = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                )
                response = await loop.run_in_executor(
                    None,
                    lambda: self._client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=[prompt, part],
                        config=config,
                    ),
                )
                raw_response = response.text
            elif self._legacy_model is not None:
                image_part = {"mime_type": mime_type, "data": image_bytes}
                response = await loop.run_in_executor(
                    None,
                    lambda: self._legacy_model.generate_content([prompt, image_part]),
                )
                raw_response = response.text
            else:
                return {
                    "medications": [],
                    "raw_text": "AI SDK not configured",
                    "confidence": 0.0,
                }

            text = raw_response.strip()
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

    async def check_drug_interactions(self, medications: List[str]) -> dict:
        """Check for drug interactions between medications."""
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

            if self._client is not None:
                from google.genai import types

                config = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                )
                response = await loop.run_in_executor(
                    None,
                    lambda: self._client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=prompt,
                        config=config,
                    ),
                )
                raw_response = response.text
            elif self._legacy_model is not None:
                response = await loop.run_in_executor(
                    None,
                    lambda: self._legacy_model.generate_content(prompt),
                )
                raw_response = response.text
            else:
                return {
                    "interactions": [],
                    "severity": "none",
                    "recommendations": ["AI SDK not configured."],
                    "disclaimer": "This is AI-generated information. Always consult a pharmacist or doctor.",
                }

            text = raw_response.strip()
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
