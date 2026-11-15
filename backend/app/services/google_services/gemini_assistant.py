"""
Google Gemini 2.5 Flash AI Assistant — SushrutaCare AI
Powers multimodal prescription OCR, adverse drug & food interaction guard,
and warm senior-friendly side effect explanations using the official google-genai SDK.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from app.config import settings

logger = logging.getLogger(__name__)


class GeminiMedicationAssistant:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model_name = "gemini-2.5-flash"

    def _is_live_key_available(self) -> bool:
        return bool(
            self.api_key
            and not self.api_key.startswith("test-")
            and self.api_key != "replace-with-gemini-key"
        )

    def parse_prescription(
        self, raw_text: str, existing_medications: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Parses raw prescription text or doctor notes into structured medication details.
        """
        existing_medications = existing_medications or []
        if not self._is_live_key_available():
            return self._fallback_prescription_parse(raw_text, existing_medications)

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            prompt = (
                f"Prescription input: '{raw_text}'. "
                f"Current active medications: {existing_medications}. "
                "Extract the medication name, dosage (e.g. 500mg), scheduled time in 24-hr HH:MM, "
                "a warm 1-sentence instruction written directly for an elderly person, and any interaction warning."
            )
            response = client.models.generate_content(
                model=self.model_name,
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
            time_str = data.get("scheduled_time", "08:00")
            if ":" not in time_str:
                time_str = "08:00"

            return {
                "medication_name": data["medication_name"],
                "dosage": data["dosage"],
                "scheduled_time": time_str,
                "elder_friendly_summary": data["elder_friendly_summary"],
                "interaction_warning": data.get("interaction_warning"),
                "ai_source": "gemini-2.5-flash",
            }
        except Exception as exc:
            logger.warning("Gemini prescription parse failed, using fallback: %s", exc)
            return self._fallback_prescription_parse(raw_text, existing_medications)

    def check_food_and_drug_interactions(
        self, medication_name: str, existing_medications: List[str]
    ) -> Dict[str, Any]:
        """
        Evaluates potential adverse drug-to-drug and food-to-drug interactions (e.g., Grapefruit with Statins,
        Dairy with Antibiotics, Vitamin K with Warfarin) specifically tailored for senior safety.
        """
        if not self._is_live_key_available():
            return self._fallback_interaction_check(medication_name, existing_medications)

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            prompt = (
                f"Medication to check: {medication_name}. Current regimen: {existing_medications}. "
                "Identify any adverse drug-drug interactions or dangerous food-drug interactions "
                "common in elderly care (e.g. grapefruit, dairy, high potassium foods, NSAIDs with blood thinners). "
                "Provide an elderly-safe verdict and concrete food cautions."
            )
            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "has_interaction": {"type": "BOOLEAN"},
                            "severity": {"type": "STRING"},
                            "adverse_drug_conflicts": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "foods_to_avoid": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "elder_friendly_guidance": {"type": "STRING"},
                        },
                        "required": [
                            "has_interaction",
                            "severity",
                            "adverse_drug_conflicts",
                            "foods_to_avoid",
                            "elder_friendly_guidance",
                        ],
                    },
                ),
            )
            data = json.loads(response.text)
            data["ai_source"] = "gemini-2.5-flash"
            return data
        except Exception as exc:
            logger.warning("Gemini interaction check failed, using fallback: %s", exc)
            return self._fallback_interaction_check(medication_name, existing_medications)

    def explain_side_effects_for_seniors(self, medication_name: str) -> Dict[str, Any]:
        """
        Explains side effects in reassuring, simple language with advice on when to call family/doctor.
        """
        if not self._is_live_key_available():
            return {
                "medication_name": medication_name,
                "common_sensations": ["Mild drowsiness", "Dry mouth"],
                "when_to_alert_caregiver": "If you feel dizzy or notice sudden shortness of breath, let your family know right away.",
                "senior_safety_tip": "Drink a full glass of warm water when taking this medicine.",
                "ai_source": "deterministic-fallback",
            }

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            prompt = (
                f"Explain the side effects of {medication_name} for an elderly person. "
                "Use a warm, non-frightening tone, list 2-3 common sensations, clear guidance on when to alert family, "
                "and 1 practical senior comfort tip."
            )
            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
            data = json.loads(response.text)
            data["ai_source"] = "gemini-2.5-flash"
            return data
        except Exception as exc:
            logger.warning("Gemini side effects explanation failed: %s", exc)
            return {
                "medication_name": medication_name,
                "common_sensations": ["Mild sleepiness", "Slight tummy fullness"],
                "when_to_alert_caregiver": "If dizziness occurs, sit down and call your caregiver.",
                "senior_safety_tip": "Take at the same time each day with meals unless advised otherwise.",
                "ai_source": "deterministic-fallback",
            }

    def _fallback_prescription_parse(
        self, raw_text: str, existing_medications: List[str]
    ) -> Dict[str, Any]:
        tokens = raw_text.strip().split()
        med_name = tokens[0].capitalize() if tokens else "Prescribed Medication"
        dosage = next((t for t in tokens if "mg" in t.lower() or "ml" in t.lower()), "1 Tablet")
        time_str = "20:00" if "night" in raw_text.lower() or "dinner" in raw_text.lower() else "08:00"
        warning = None
        if any(med.lower() == med_name.lower() for med in existing_medications):
            warning = f"Duplicate medication alert: {med_name} is already in your schedule."

        return {
            "medication_name": med_name,
            "dosage": dosage,
            "scheduled_time": time_str,
            "elder_friendly_summary": f"Please take {dosage} of {med_name} at {time_str} with water.",
            "interaction_warning": warning,
            "ai_source": "deterministic-fallback",
        }

    def _fallback_interaction_check(
        self, medication_name: str, existing_medications: List[str]
    ) -> Dict[str, Any]:
        name_lower = medication_name.lower()
        foods = []
        conflicts = []
        guidance = "Take with water as prescribed."

        if "statin" in name_lower or "atorvastatin" in name_lower:
            foods.append("Grapefruit or grapefruit juice (can increase drug absorption dangerously)")
            guidance = "Avoid grapefruit juice while taking this cholesterol medicine."
        if "warfarin" in name_lower or "aspirin" in name_lower:
            foods.append("Excess spinach, kale, or cranberry juice")
            guidance = "Keep your greens intake consistent so blood thinning stays balanced."
        if "metformin" in name_lower:
            foods.append("Excess alcohol or skipping meals")
            guidance = "Always take with or right after your meal to protect your stomach."

        for med in existing_medications:
            if ("warfarin" in name_lower and "aspirin" in med.lower()) or (
                "aspirin" in name_lower and "warfarin" in med.lower()
            ):
                conflicts.append(f"High bleeding risk combining {medication_name} and {med}")

        return {
            "has_interaction": bool(foods or conflicts),
            "severity": "HIGH" if conflicts else "MODERATE" if foods else "NONE",
            "adverse_drug_conflicts": conflicts,
            "foods_to_avoid": foods,
            "elder_friendly_guidance": guidance,
            "ai_source": "deterministic-fallback",
        }
