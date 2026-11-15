/**
 * Client-Side Google Gemini Assistant Integration
 * SushrutaCare AI — Multimodal prescription label interpreter & adverse interaction warning generator.
 */

export interface InteractionCheckResult {
  has_interaction: boolean;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';
  adverse_drug_conflicts: string[];
  foods_to_avoid: string[];
  elder_friendly_guidance: string;
  ai_source: string;
}

export interface SideEffectsResult {
  medication_name: string;
  common_sensations: string[];
  when_to_alert_caregiver: string;
  senior_safety_tip: string;
}

export async function checkInteractionsWithGemini(
  medicationName: string,
  existingMeds: string[],
  apiBase: string,
  token?: string
): Promise<InteractionCheckResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/api/v1/ai/interaction-check`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      medication_name: medicationName,
      existing_medications: existingMeds,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to analyze interactions via Gemini');
  }
  return res.json();
}
