const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false
): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeader(),
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail ?? detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'elder' | 'caretaker' | 'family';
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  dosage: string;
  frequency: string;
  dose_times: string[];
  instructions?: string;
  prescribing_doctor?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
  adherence_percent?: number;
}

export interface AdherenceLog {
  id: string;
  medication_id: string;
  status: 'taken' | 'missed';
  scheduled_time: string;
  taken_at?: string;
  notes?: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  doctor_name: string;
  specialty?: string;
  appointment_dt: string;
  duration_minutes: number;
  location?: string;
  notes?: string;
  reminder_sent: boolean;
  created_at: string;
  calendar_link?: string;
}

export interface DrugInteraction {
  drug_a: string;
  drug_b: string;
  severity: string;
  description: string;
  mechanism: string;
  clinical_significance: string;
}

export interface DrugInteractionResponse {
  interactions: DrugInteraction[];
  severity: string;
  recommendations: string[];
  disclaimer: string;
}

export interface PrescriptionScanResult {
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    dose_times: string[];
    instructions?: string;
    prescribing_doctor?: string;
  }>;
  raw_text?: string;
  confidence?: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; name: string; passcode: string; role: string }) =>
    request<AuthResponse>('POST', '/api/v1/auth/register', data),

  login: (email: string, passcode: string) =>
    request<AuthResponse>('POST', '/api/v1/auth/login', { email, passcode }),

  me: () => request<User>('GET', '/api/v1/auth/me'),
};

// ── Medications ───────────────────────────────────────────────────────────────
export const medicationsApi = {
  list: () => request<Medication[]>('GET', '/api/v1/medications'),

  create: (data: Omit<Medication, 'id' | 'user_id' | 'created_at' | 'is_active' | 'adherence_percent'>) =>
    request<Medication>('POST', '/api/v1/medications', data),

  update: (id: string, data: Partial<Medication>) =>
    request<Medication>('PUT', `/api/v1/medications/${id}`, data),

  delete: (id: string) => request<void>('DELETE', `/api/v1/medications/${id}`),

  logAdherence: (medicationId: string, status: 'taken' | 'missed', scheduledTime: string) =>
    request<AdherenceLog>('POST', `/api/v1/medications/adherence/${medicationId}`, {
      medication_id: medicationId,
      status,
      scheduled_time: scheduledTime,
    }),

  getAdherence: (medicationId: string) =>
    request<{ logs: AdherenceLog[]; adherence_percent: number }>('GET', `/api/v1/medications/adherence/${medicationId}`),
};

// ── Appointments ──────────────────────────────────────────────────────────────
export const appointmentsApi = {
  list: () => request<Appointment[]>('GET', '/api/v1/appointments'),

  create: (data: Omit<Appointment, 'id' | 'user_id' | 'created_at' | 'reminder_sent'>) =>
    request<Appointment>('POST', '/api/v1/appointments', data),

  update: (id: string, data: Partial<Appointment>) =>
    request<Appointment>('PUT', `/api/v1/appointments/${id}`, data),

  delete: (id: string) => request<void>('DELETE', `/api/v1/appointments/${id}`),

  getCalendarLink: (id: string) =>
    request<{ calendar_link: string }>('POST', `/api/v1/appointments/${id}/calendar-link`),
};

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiApi = {
  scanPrescription: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<PrescriptionScanResult>('POST', '/api/v1/ai/prescription-scan', form, true);
  },

  checkDrugInteractions: (medications: string[]) =>
    request<DrugInteractionResponse>('POST', '/api/v1/ai/drug-interaction', { medications }),
};
