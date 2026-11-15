'use client';

import React, { useState } from 'react';
import {
  GoogleMapsService,
  GoogleCalendarClient,
  checkInteractionsWithGemini,
  InteractionCheckResult,
} from '@/services/google';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DoseLog {
  id: string;
  medication_id?: string;
  medication_name: string;
  dosage: string;
  scheduled_time: string;
  instructions: string;
  status: 'PENDING' | 'TAKEN' | 'SNOOZED' | 'MISSED';
  elder_note?: string | null;
  stock_remaining?: number;
}

interface Appointment {
  id: string;
  doctor_name: string;
  specialty: string;
  appointment_time: string;
  location: string;
  notes?: string;
  google_calendar_url?: string;
}

interface VitalsLog {
  id: string;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  blood_glucose_mg_dl?: number;
  oxygen_saturation_spo2?: number;
  elder_note?: string;
  logged_at: string;
  status_assessment: string;
}

interface RefillAlert {
  medication_id: string;
  name: string;
  dosage: string;
  stock_remaining: number;
  is_low_stock: boolean;
  days_left_approx: number;
  refill_urgency: 'NORMAL' | 'LOW_STOCK' | 'CRITICAL_EMPTY';
}

export default function SushrutaCareApp() {
  const [token, setToken] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [role, setRole] = useState<'ELDER' | 'CARETAKER' | 'FAMILY'>('ELDER');
  const [elderName, setElderName] = useState<string>('');
  const [adherenceRate, setAdherenceRate] = useState<number>(100);
  const [doses, setDoses] = useState<DoseLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vitalsList, setVitalsList] = useState<VitalsLog[]>([]);
  const [refills, setRefills] = useState<RefillAlert[]>([]);
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Accessibility toggle: Standard vs Senior AAA High-Contrast Mode
  const [highContrastA11y, setHighContrastA11y] = useState<boolean>(false);

  // Setup / Auth states
  const [newElderName, setNewElderName] = useState('');
  const [newElderAge, setNewElderAge] = useState(74);
  const [newCareEmail, setNewCareEmail] = useState('');
  const [newPasscode, setNewPasscode] = useState('');

  // AI & Interaction states
  const [rxInput, setRxInput] = useState('');
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [interactionResult, setInteractionResult] = useState<InteractionCheckResult | null>(null);
  const [medToCheck, setMedToCheck] = useState('');

  // Vitals form states
  const [systolic, setSystolic] = useState<string>('120');
  const [diastolic, setDiastolic] = useState<string>('80');
  const [pulse, setPulse] = useState<string>('72');
  const [spo2, setSpo2] = useState<string>('98');
  const [glucose, setGlucose] = useState<string>('100');

  // Emergency SOS state
  const [sosActive, setSosActive] = useState<boolean>(false);
  const [sosHospitalUrl, setSosHospitalUrl] = useState<string>('');

  const speakAloud = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const fetchDashboard = async (jwtToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/dashboard`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data = await res.json();
      setElderName(data.elder_name);
      setAdherenceRate(data.adherence_rate_percent);
      setDoses(data.today_doses || []);
      setAppointments(data.appointments || []);

      // Fetch Vitals History
      const vRes = await fetch(`${API_BASE}/api/v1/vitals`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (vRes.ok) {
        setVitalsList(await vRes.json());
      }

      // Fetch Refills
      const rRes = await fetch(`${API_BASE}/api/v1/medications/refills`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (rRes.ok) {
        setRefills(await rRes.json());
      }
    } catch (err: any) {
      setErrorBanner(err.message);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorBanner('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elder_name: newElderName,
          age: Number(newElderAge),
          blood_group: 'O+',
          passcode: newPasscode,
          caregiver_emails: [newCareEmail],
          preferred_language: 'en-IN',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not create profile');
      setProfileId(data.profile_id);
      setPasscode(newPasscode);
      const msg = `Care Circle created! Profile ID: ${data.profile_id}`;
      setStatusBanner(msg);
      speakAloud('Care Circle created successfully. You can now log in.');
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasscodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorBanner('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, passcode, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Invalid passcode or profile ID');
      setToken(data.access_token);
      await fetchDashboard(data.access_token);
      const welcome = `Welcome to SushrutaCare, ${data.elder_name}. You are in ${data.role} mode.`;
      setStatusBanner(welcome);
      speakAloud(welcome);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDoseAction = async (
    logId: string,
    status: 'TAKEN' | 'SNOOZED',
    elderNote?: string
  ) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/adherence/${logId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, elder_note: elderNote }),
      });
      if (!res.ok) throw new Error('Could not update dose');
      await fetchDashboard(token);
      const feedback =
        status === 'TAKEN'
          ? 'Medication marked as taken!'
          : 'Dose delayed by 30 minutes. Your care circle has been notified.';
      setStatusBanner(feedback);
      speakAloud(feedback);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGeminiSmartAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setErrorBanner('');
    try {
      const scanRes = await fetch(`${API_BASE}/api/v1/ai/scan-prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          raw_prescription_text: rxInput,
          existing_medications: doses.map((d) => d.medication_name),
        }),
      });
      const parsed = await scanRes.json();
      if (!scanRes.ok) throw new Error(parsed.detail || 'AI parse failed');
      setAiWarning(parsed.interaction_warning);

      const addRes = await fetch(`${API_BASE}/api/v1/medications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: parsed.medication_name,
          dosage: parsed.dosage,
          scheduled_time: parsed.scheduled_time,
          instructions: parsed.elder_friendly_summary,
          stock_remaining: 30,
        }),
      });
      if (!addRes.ok) throw new Error('Failed to save parsed medication');
      setRxInput('');
      await fetchDashboard(token);
      const msg = `Gemini scheduled ${parsed.medication_name} (${parsed.dosage}) at ${parsed.scheduled_time}`;
      setStatusBanner(msg);
      speakAloud(msg);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInteractionCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !medToCheck.trim()) return;
    setLoading(true);
    setErrorBanner('');
    try {
      const activeMeds = doses.map((d) => d.medication_name);
      const res = await checkInteractionsWithGemini(medToCheck, activeMeds, API_BASE, token);
      setInteractionResult(res);
      speakAloud(res.elder_friendly_guidance);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setErrorBanner('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/vitals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          systolic_bp: systolic ? parseInt(systolic, 10) : undefined,
          diastolic_bp: diastolic ? parseInt(diastolic, 10) : undefined,
          heart_rate: pulse ? parseInt(pulse, 10) : undefined,
          oxygen_saturation_spo2: spo2 ? parseInt(spo2, 10) : undefined,
          blood_glucose_mg_dl: glucose ? parseFloat(glucose) : undefined,
          elder_note: 'Logged via SushrutaCare Senior Portal',
        }),
      });
      if (!res.ok) throw new Error('Failed to log vitals');
      const data = await res.json();
      await fetchDashboard(token);
      const feedback = `Vitals logged. Assessment: ${data.status_assessment}`;
      setStatusBanner(feedback);
      speakAloud(feedback);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSOS = async () => {
    if (!token) return;
    const confirmSOS = window.confirm(
      'Are you sure you want to trigger the EMERGENCY SOS? This sends immediate alerts to your caregivers and locates emergency hospitals.'
    );
    if (!confirmSOS) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/sos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          emergency_type: 'SENIOR_SOS_TRIGGERED',
          note: 'One-touch SOS button pressed by elder in application',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Emergency SOS dispatch failed');
      setSosActive(true);
      setSosHospitalUrl(data.emergency_directions_url);
      const alertMsg = 'EMERGENCY SOS DISPATCHED! Care circle has been alerted via email and push notification.';
      setStatusBanner(alertMsg);
      speakAloud('Emergency SOS dispatched. Your care circle is alerted.');
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group doses into Time Buckets: Morning, Afternoon, Evening/Night
  const morningDoses = doses.filter((d) => {
    const hour = parseInt(d.scheduled_time.split(':')[0], 10);
    return hour >= 5 && hour < 12;
  });
  const afternoonDoses = doses.filter((d) => {
    const hour = parseInt(d.scheduled_time.split(':')[0], 10);
    return hour >= 12 && hour < 17;
  });
  const eveningDoses = doses.filter((d) => {
    const hour = parseInt(d.scheduled_time.split(':')[0], 10);
    return hour >= 17 || hour < 5;
  });

  return (
    <main
      className={`min-h-screen p-4 md:p-8 transition-colors ${
        highContrastA11y
          ? 'bg-black text-yellow-300 font-sans'
          : 'bg-slate-50 text-slate-950 font-sans'
      }`}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Navigation & Header */}
        <header
          className={`rounded-2xl border-4 p-6 shadow-md ${
            highContrastA11y
              ? 'border-yellow-300 bg-neutral-900 text-yellow-300'
              : 'border-slate-900 bg-white text-slate-950'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                SushrutaCare AI — Elderly Care & Medication Platform
              </h1>
              <p className="mt-2 text-lg font-medium opacity-90">
                Senior-Autonomous Health Circle powered by Google Gemini, Firebase & Maps.
              </p>
            </div>

            {/* Accessibility Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextState = !highContrastA11y;
                setHighContrastA11y(nextState);
                speakAloud(nextState ? 'High contrast accessibility mode on' : 'Standard display mode');
              }}
              aria-label="Toggle Senior High-Contrast Mode"
              className={`min-h-[56px] rounded-xl border-4 px-5 py-3 text-lg font-extrabold transition-all ${
                highContrastA11y
                  ? 'border-black bg-yellow-300 text-black hover:bg-yellow-400'
                  : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              👁️ {highContrastA11y ? 'Standard Display' : 'Senior AAA High-Contrast'}
            </button>
          </div>
        </header>

        {/* Live Status Announcements */}
        <div aria-live="polite" className="space-y-2">
          {statusBanner && (
            <div
              className={`rounded-xl border-4 p-4 text-xl font-extrabold ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900 text-yellow-300'
                  : 'border-emerald-800 bg-emerald-100 text-emerald-950'
              }`}
            >
              ✓ {statusBanner}
            </div>
          )}
          {errorBanner && (
            <div
              role="alert"
              className="rounded-xl border-4 border-red-700 bg-red-100 p-4 text-xl font-extrabold text-red-950"
            >
              ⚠️ {errorBanner}
            </div>
          )}
        </div>

        {/* ONE-TAP EMERGENCY SOS BUTTON (Visible whenever logged in) */}
        {token && (
          <section
            aria-label="Emergency SOS Action"
            className="rounded-2xl border-4 border-red-600 bg-red-50 p-6 shadow-lg"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-red-900">
                  🚨 One-Tap Emergency Care & SOS
                </h2>
                <p className="text-lg font-bold text-red-800">
                  Instantly alerts all caregivers via email, pushes notification & opens hospital routing.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleTriggerSOS}
                  disabled={loading}
                  className="min-h-[64px] min-w-[200px] rounded-2xl bg-red-700 px-6 py-3 text-2xl font-black text-white shadow-md hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-400"
                >
                  🚨 TRIGGER SOS
                </button>

                <a
                  href={GoogleMapsService.getNearbyHospitalsUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[64px] items-center rounded-2xl border-4 border-red-800 bg-white px-5 py-3 text-lg font-extrabold text-red-900 hover:bg-red-100"
                >
                  🏥 Nearby Hospitals
                </a>

                <a
                  href={GoogleMapsService.getNearbyPharmaciesUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[64px] items-center rounded-2xl border-4 border-slate-800 bg-white px-5 py-3 text-lg font-extrabold text-slate-900 hover:bg-slate-100"
                >
                  💊 24/7 Pharmacies
                </a>
              </div>
            </div>

            {sosActive && sosHospitalUrl && (
              <div className="mt-4 rounded-xl border-2 border-red-900 bg-red-200 p-4">
                <p className="text-xl font-black text-red-950">
                  Directions dispatched to Caregiver:{' '}
                  <a
                    href={sosHospitalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-red-900 hover:text-black"
                  >
                    Open Google Maps Emergency Routing →
                  </a>
                </p>
              </div>
            )}
          </section>
        )}

        {!token ? (
          /* Step 1 & 2: Setup or Passcode Gate */
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <form
              onSubmit={handleCreateProfile}
              className={`space-y-4 rounded-2xl border-4 p-6 ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900'
                  : 'border-slate-900 bg-white'
              }`}
            >
              <h2 className="text-2xl font-bold">1. Create Care Circle</h2>
              <div>
                <label htmlFor="elder-name" className="block text-lg font-bold">
                  Elder Full Name
                </label>
                <input
                  id="elder-name"
                  required
                  value={newElderName}
                  onChange={(e) => setNewElderName(e.target.value)}
                  className="mt-1 min-h-[56px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-lg text-black font-semibold"
                  placeholder="e.g. S. Ramanathan"
                />
              </div>
              <div>
                <label htmlFor="care-email" className="block text-lg font-bold">
                  Caretaker Alert Email
                </label>
                <input
                  id="care-email"
                  type="email"
                  required
                  value={newCareEmail}
                  onChange={(e) => setNewCareEmail(e.target.value)}
                  className="mt-1 min-h-[56px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-lg text-black font-semibold"
                  placeholder="caregiver@family.org"
                />
              </div>
              <div>
                <label htmlFor="setup-passcode" className="block text-lg font-bold">
                  Set 6-Digit Care Passcode
                </label>
                <input
                  id="setup-passcode"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  className="mt-1 min-h-[56px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-2xl font-bold tracking-widest text-black"
                  placeholder="123456"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[56px] w-full rounded-xl bg-slate-900 px-6 py-3 text-xl font-extrabold text-white hover:bg-slate-800"
              >
                Create Circle
              </button>
            </form>

            <form
              onSubmit={handlePasscodeLogin}
              className={`space-y-4 rounded-2xl border-4 p-6 ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900'
                  : 'border-slate-900 bg-white'
              }`}
            >
              <h2 className="text-2xl font-bold">2. Care Circle Passcode Login</h2>
              <div>
                <label htmlFor="login-profile-id" className="block text-lg font-bold">
                  Profile ID
                </label>
                <input
                  id="login-profile-id"
                  required
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="mt-1 min-h-[56px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-lg text-black font-semibold"
                />
              </div>
              <div>
                <label htmlFor="login-passcode" className="block text-lg font-bold">
                  6-Digit Passcode
                </label>
                <input
                  id="login-passcode"
                  type="password"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="mt-1 min-h-[56px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-2xl font-bold tracking-widest text-black"
                />
              </div>
              <div>
                <label htmlFor="login-role" className="block text-lg font-bold">
                  Select Role
                </label>
                <select
                  id="login-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 min-h-[56px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-lg font-bold text-black"
                >
                  <option value="ELDER">Elderly Individual (High-Contrast Autonomy)</option>
                  <option value="CARETAKER">Caretaker (Full Manager & Vitals Tracker)</option>
                  <option value="FAMILY">Family Member (Adherence Viewer)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[56px] w-full rounded-xl bg-emerald-800 px-6 py-3 text-xl font-extrabold text-white hover:bg-emerald-900"
              >
                Unlock Care Circle
              </button>
            </form>
          </div>
        ) : (
          /* Active Care Profile Dashboard */
          <div className="space-y-6">
            {/* Header / Care Circle Info */}
            <section
              className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border-4 p-6 ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900'
                  : 'border-slate-900 bg-amber-100'
              }`}
            >
              <div>
                <h2 className="text-2xl font-black">
                  Care Profile: {elderName} ({role} Mode)
                </h2>
                <p className="text-xl font-bold">
                  Overall Medication Adherence: {adherenceRate}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToken(null)}
                className="min-h-[56px] rounded-xl border-2 border-slate-900 bg-white px-5 py-2 text-lg font-bold text-slate-900"
              >
                Switch Role / Logout
              </button>
            </section>

            {/* Low-Stock Refill Alerts Banner */}
            {refills.some((r) => r.is_low_stock) && (
              <section className="rounded-2xl border-4 border-amber-600 bg-amber-50 p-6">
                <h3 className="text-2xl font-black text-amber-950">
                  ⚠️ Medication Refill Reminders
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {refills
                    .filter((r) => r.is_low_stock)
                    .map((r) => (
                      <div
                        key={r.medication_id}
                        className="rounded-xl border-2 border-amber-800 bg-white p-4"
                      >
                        <p className="text-xl font-extrabold text-slate-950">
                          {r.name} ({r.dosage})
                        </p>
                        <p className="text-lg font-bold text-red-700">
                          Stock Left: {r.stock_remaining} pills (~{r.days_left_approx} days)
                        </p>
                        <a
                          href={GoogleMapsService.getNearbyPharmaciesUrl()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block font-extrabold text-blue-700 underline"
                        >
                          Locate Pharmacy for Refill →
                        </a>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Google Gemini 2.5 Flash Prescription Scanner (ELDER & CARETAKER) */}
            {role !== 'FAMILY' && (
              <form
                onSubmit={handleGeminiSmartAdd}
                className={`space-y-4 rounded-2xl border-4 p-6 ${
                  highContrastA11y
                    ? 'border-yellow-300 bg-neutral-900'
                    : 'border-slate-900 bg-white'
                }`}
              >
                <h3 className="text-2xl font-black">
                  ✨ Google Gemini 2.5 Flash — Prescription Scanner & Routine Builder
                </h3>
                <label htmlFor="rx-input" className="block text-lg font-bold">
                  Paste Doctor&apos;s Prescription or Doctor Notes:
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="rx-input"
                    required
                    value={rxInput}
                    onChange={(e) => setRxInput(e.target.value)}
                    placeholder="e.g. Atorvastatin 20mg night after dinner"
                    className="min-h-[56px] flex-1 rounded-xl border-2 border-slate-900 bg-white px-4 text-lg font-medium text-black"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[56px] rounded-xl bg-blue-800 px-6 py-3 text-xl font-bold text-white hover:bg-blue-900"
                  >
                    AI Scan & Schedule
                  </button>
                </div>
                {aiWarning && (
                  <p role="alert" className="rounded-xl bg-amber-200 p-4 text-lg font-bold text-black">
                    ⚠️ {aiWarning}
                  </p>
                )}
              </form>
            )}

            {/* Senior Adverse Drug & Food Interaction Guard */}
            <section
              className={`space-y-4 rounded-2xl border-4 p-6 ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900'
                  : 'border-slate-900 bg-white'
              }`}
            >
              <h3 className="text-2xl font-black">
                🛡️ Adverse Drug & Food Interaction Guard (Gemini Powered)
              </h3>
              <p className="text-lg font-medium">
                Verify if a medicine reacts with existing medications or foods (e.g. Grapefruit with Statins, Dairy with Antibiotics).
              </p>
              <form onSubmit={handleInteractionCheck} className="flex flex-col gap-3 sm:flex-row">
                <input
                  required
                  value={medToCheck}
                  onChange={(e) => setMedToCheck(e.target.value)}
                  placeholder="Enter medication to check (e.g. Warfarin, Ciprofloxacin)"
                  className="min-h-[56px] flex-1 rounded-xl border-2 border-slate-900 bg-white px-4 text-lg font-semibold text-black"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[56px] rounded-xl bg-indigo-800 px-6 py-3 text-xl font-bold text-white hover:bg-indigo-900"
                >
                  Verify Interactions
                </button>
              </form>

              {interactionResult && (
                <div className="rounded-xl border-4 border-indigo-700 bg-indigo-50 p-5 space-y-3 text-indigo-950">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black">
                      Severity: {interactionResult.severity}
                    </span>
                    <span className="text-sm font-bold bg-indigo-200 px-3 py-1 rounded-lg">
                      Source: {interactionResult.ai_source}
                    </span>
                  </div>
                  <p className="text-xl font-extrabold">
                    {interactionResult.elder_friendly_guidance}
                  </p>
                  {interactionResult.foods_to_avoid.length > 0 && (
                    <div>
                      <strong className="text-lg font-black text-red-900">
                        Foods / Drinks to Avoid:
                      </strong>
                      <ul className="list-disc pl-6 font-bold">
                        {interactionResult.foods_to_avoid.map((f, idx) => (
                          <li key={idx}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {interactionResult.adverse_drug_conflicts.length > 0 && (
                    <div>
                      <strong className="text-lg font-black text-red-900">
                        Conflicting Regimens:
                      </strong>
                      <ul className="list-disc pl-6 font-bold">
                        {interactionResult.adverse_drug_conflicts.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Smart Medication Schedule — Time Buckets */}
            <section className="space-y-6">
              <h3 className="text-3xl font-black">Today&apos;s Pill Schedule (Time Buckets)</h3>

              {/* Morning Bucket */}
              <div className="space-y-3">
                <h4 className="text-2xl font-bold">🌅 Morning Routine (05:00 - 11:59)</h4>
                {morningDoses.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-lg">
                    No morning medications scheduled.
                  </p>
                ) : (
                  morningDoses.map((dose) => renderDoseCard(dose))
                )}
              </div>

              {/* Afternoon Bucket */}
              <div className="space-y-3">
                <h4 className="text-2xl font-bold">☀️ Afternoon Routine (12:00 - 16:59)</h4>
                {afternoonDoses.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-lg">
                    No afternoon medications scheduled.
                  </p>
                ) : (
                  afternoonDoses.map((dose) => renderDoseCard(dose))
                )}
              </div>

              {/* Evening / Night Bucket */}
              <div className="space-y-3">
                <h4 className="text-2xl font-bold">🌙 Evening & Night Routine (17:00 - 23:59)</h4>
                {eveningDoses.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-lg">
                    No evening medications scheduled.
                  </p>
                ) : (
                  eveningDoses.map((dose) => renderDoseCard(dose))
                )}
              </div>
            </section>

            {/* Senior Vitals Tracker & Health Logging */}
            <section
              className={`space-y-4 rounded-2xl border-4 p-6 ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900'
                  : 'border-slate-900 bg-white'
              }`}
            >
              <h3 className="text-2xl font-black">
                🩺 Daily Vitals & Senior Wellness Logger
              </h3>
              <form onSubmit={handleLogVitals} className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <div>
                  <label htmlFor="vital-sys" className="block font-bold">
                    Systolic (mmHg)
                  </label>
                  <input
                    id="vital-sys"
                    type="number"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    className="min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-3 text-lg font-bold text-black"
                  />
                </div>
                <div>
                  <label htmlFor="vital-dia" className="block font-bold">
                    Diastolic (mmHg)
                  </label>
                  <input
                    id="vital-dia"
                    type="number"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    className="min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-3 text-lg font-bold text-black"
                  />
                </div>
                <div>
                  <label htmlFor="vital-pulse" className="block font-bold">
                    Pulse (bpm)
                  </label>
                  <input
                    id="vital-pulse"
                    type="number"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    className="min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-3 text-lg font-bold text-black"
                  />
                </div>
                <div>
                  <label htmlFor="vital-spo2" className="block font-bold">
                    SpO2 (%)
                  </label>
                  <input
                    id="vital-spo2"
                    type="number"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    className="min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-3 text-lg font-bold text-black"
                  />
                </div>
                <div>
                  <label htmlFor="vital-glucose" className="block font-bold">
                    Glucose (mg/dL)
                  </label>
                  <input
                    id="vital-glucose"
                    type="number"
                    value={glucose}
                    onChange={(e) => setGlucose(e.target.value)}
                    className="min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-3 text-lg font-bold text-black"
                  />
                </div>
                <div className="col-span-2 sm:col-span-5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[56px] w-full rounded-xl bg-teal-800 px-6 py-3 text-xl font-bold text-white hover:bg-teal-900"
                  >
                    Log Daily Vitals & Get Safety Status
                  </button>
                </div>
              </form>

              {/* Vitals History */}
              {vitalsList.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-xl font-bold">Recent Readings:</h4>
                  <div className="space-y-2">
                    {vitalsList.slice(0, 3).map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center justify-between rounded-xl border-2 border-slate-900 bg-slate-100 p-4 font-bold text-slate-950"
                      >
                        <div>
                          <span>
                            BP: {v.systolic_bp}/{v.diastolic_bp} mmHg | Heart: {v.heart_rate} bpm | SpO2:{' '}
                            {v.oxygen_saturation_spo2}% | Sugar: {v.blood_glucose_mg_dl} mg/dL
                          </span>
                        </div>
                        <span className="rounded-lg bg-teal-900 px-3 py-1 text-white text-sm">
                          {v.status_assessment}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Doctor Appointments & Google Calendar */}
            <section
              className={`space-y-4 rounded-2xl border-4 p-6 ${
                highContrastA11y
                  ? 'border-yellow-300 bg-neutral-900'
                  : 'border-slate-900 bg-white'
              }`}
            >
              <h3 className="text-2xl font-black">
                📅 Doctor Consultations & Google Calendar Sync
              </h3>
              {appointments.length === 0 ? (
                <p className="text-lg font-medium">No upcoming appointments recorded.</p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-slate-900 p-4"
                    >
                      <div>
                        <h4 className="text-xl font-extrabold">
                          Dr. {appt.doctor_name} ({appt.specialty})
                        </h4>
                        <p className="text-lg">
                          Time: {new Date(appt.appointment_time).toLocaleString()} | Place: {appt.location}
                        </p>
                      </div>
                      {appt.google_calendar_url && (
                        <a
                          href={appt.google_calendar_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[52px] inline-flex items-center rounded-xl bg-blue-700 px-4 py-2 text-lg font-bold text-white hover:bg-blue-800"
                        >
                          📅 Add to Google Calendar
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );

  function renderDoseCard(dose: DoseLog) {
    const calendarRoutineUrl = GoogleCalendarClient.createMedicationRoutineUrl({
      elderName,
      medicationName: dose.medication_name,
      dosage: dose.dosage,
      scheduledTimeStr: dose.scheduled_time,
      instructions: dose.instructions,
    });

    return (
      <article
        key={dose.id}
        className={`rounded-2xl border-4 p-6 shadow-sm ${
          highContrastA11y
            ? 'border-yellow-300 bg-neutral-900 text-yellow-300'
            : 'border-slate-900 bg-white text-slate-950'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span
              className={`rounded-lg px-3 py-1 text-lg font-bold ${
                dose.status === 'TAKEN'
                  ? 'bg-emerald-800 text-white'
                  : dose.status === 'SNOOZED'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-900 text-white'
              }`}
            >
              ⏰ {dose.scheduled_time} — Status: {dose.status}
            </span>
            <h5 className="mt-2 text-3xl font-black">
              {dose.medication_name} ({dose.dosage})
            </h5>
            <p className="mt-1 text-xl opacity-90">{dose.instructions}</p>
            {dose.elder_note && (
              <p className="mt-2 text-lg font-bold text-amber-600">
                Elder Note: &ldquo;{dose.elder_note}&rdquo;
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                speakAloud(
                  `Medication ${dose.medication_name}, ${dose.dosage}. ${dose.instructions}. Scheduled for ${dose.scheduled_time}.`
                )
              }
              aria-label={`Read ${dose.medication_name} instructions aloud`}
              className="min-h-[56px] rounded-xl border-2 border-slate-900 bg-slate-100 px-5 py-3 text-lg font-bold text-black"
            >
              🔊 Listen
            </button>

            <a
              href={calendarRoutineUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Add ${dose.medication_name} to Google Calendar`}
              className="min-h-[56px] inline-flex items-center rounded-xl border-2 border-slate-900 bg-white px-4 py-3 text-lg font-bold text-black hover:bg-slate-50"
            >
              📅 GCal Routine
            </a>
          </div>
        </div>

        {dose.status === 'PENDING' && role !== 'FAMILY' && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleDoseAction(dose.id, 'TAKEN')}
              className="min-h-[60px] rounded-xl bg-emerald-800 px-6 py-3 text-2xl font-black text-white hover:bg-emerald-900"
            >
              ✓ I Took This Dose
            </button>
            <button
              type="button"
              onClick={() =>
                handleDoseAction(
                  dose.id,
                  'SNOOZED',
                  'Having meal late — delaying dose by 30 minutes'
                )
              }
              className="min-h-[60px] rounded-xl border-4 border-slate-900 bg-amber-100 px-6 py-3 text-xl font-black text-slate-950 hover:bg-amber-200"
            >
              ⏳ Delay +30m (Notify Family)
            </button>
          </div>
        )}
      </article>
    );
  }
}
