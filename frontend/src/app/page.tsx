'use client';

import React, { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DoseLog {
  id: string;
  medication_name: string;
  dosage: string;
  scheduled_time: string;
  instructions: string;
  status: 'PENDING' | 'TAKEN' | 'SNOOZED' | 'MISSED';
  elder_note?: string | null;
}

interface Appointment {
  id: string;
  doctor_name: string;
  specialty: string;
  appointment_time: string;
  location: string;
  google_calendar_url: string;
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
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Quick Setup / Medication / AI states
  const [newElderName, setNewElderName] = useState('');
  const [newElderAge, setNewElderAge] = useState(72);
  const [newCareEmail, setNewCareEmail] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [rxInput, setRxInput] = useState('');
  const [aiWarning, setAiWarning] = useState<string | null>(null);

  const speakAloud = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const fetchDashboard = async (jwtToken: string) => {
    const res = await fetch(`${API_BASE}/api/v1/dashboard`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });
    if (!res.ok) throw new Error('Failed to load dashboard');
    const data = await res.json();
    setElderName(data.elder_name);
    setAdherenceRate(data.adherence_rate_percent);
    setDoses(data.today_doses);
    setAppointments(data.appointments);
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
      setStatusBanner(`Created Care Circle! Profile ID: ${data.profile_id}`);
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
      if (!res.ok) throw new Error(data.detail || 'Invalid passcode');
      setToken(data.access_token);
      await fetchDashboard(data.access_token);
      setStatusBanner(`Logged in as ${data.role} for ${data.elder_name}`);
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
          : 'Dose delayed by 30 minutes. Caretakers notified with your reason.';
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
      setStatusBanner(`Gemini added ${parsed.medication_name} (${parsed.dosage})`);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border-4 border-slate-900 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            SushrutaCare AI — Elderly Care & Medication Circle
          </h1>
          <p className="mt-2 text-lg font-medium text-slate-700">
            Passcode-protected shared ecosystem keeping seniors in control of their daily health.
          </p>
        </header>

        <div aria-live="polite" className="space-y-2">
          {statusBanner && (
            <div className="rounded-xl border-2 border-emerald-800 bg-emerald-100 p-4 text-lg font-bold text-emerald-950">
              ✓ {statusBanner}
            </div>
          )}
          {errorBanner && (
            <div
              role="alert"
              className="rounded-xl border-2 border-red-800 bg-red-100 p-4 text-lg font-bold text-red-950"
            >
              ⚠️ {errorBanner}
            </div>
          )}
        </div>

        {!token ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Step 1: Create Care Circle */}
            <form
              onSubmit={handleCreateProfile}
              className="space-y-4 rounded-2xl border-4 border-slate-900 bg-white p-6"
            >
              <h2 className="text-2xl font-bold">1. Create Elder Care Circle</h2>
              <div>
                <label htmlFor="elder-name" className="block text-lg font-bold">
                  Elder Full Name
                </label>
                <input
                  id="elder-name"
                  required
                  value={newElderName}
                  onChange={(e) => setNewElderName(e.target.value)}
                  className="mt-1 min-h-[52px] w-full rounded-xl border-2 border-slate-900 px-4 text-lg"
                  placeholder="e.g. Thiru Sundaram"
                />
              </div>
              <div>
                <label htmlFor="care-email" className="block text-lg font-bold">
                  Caretaker / Family Alert Email
                </label>
                <input
                  id="care-email"
                  type="email"
                  required
                  value={newCareEmail}
                  onChange={(e) => setNewCareEmail(e.target.value)}
                  className="mt-1 min-h-[52px] w-full rounded-xl border-2 border-slate-900 px-4 text-lg"
                  placeholder="family@example.com"
                />
              </div>
              <div>
                <label htmlFor="setup-passcode" className="block text-lg font-bold">
                  Set 6-Digit Care Circle Passcode
                </label>
                <input
                  id="setup-passcode"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  className="mt-1 min-h-[52px] w-full rounded-xl border-2 border-slate-900 px-4 text-xl font-bold tracking-widest"
                  placeholder="482910"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[56px] w-full rounded-xl bg-slate-900 px-6 py-3 text-xl font-bold text-white hover:bg-slate-800"
              >
                Create Secure Profile
              </button>
            </form>

            {/* Step 2: Shared Passcode Access */}
            <form
              onSubmit={handlePasscodeLogin}
              className="space-y-4 rounded-2xl border-4 border-slate-900 bg-white p-6"
            >
              <h2 className="text-2xl font-bold">2. Enter Care Circle (Passcode)</h2>
              <div>
                <label htmlFor="login-profile-id" className="block text-lg font-bold">
                  Elder Profile ID
                </label>
                <input
                  id="login-profile-id"
                  required
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="mt-1 min-h-[52px] w-full rounded-xl border-2 border-slate-900 px-4 text-lg"
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
                  className="mt-1 min-h-[52px] w-full rounded-xl border-2 border-slate-900 px-4 text-xl font-bold tracking-widest"
                />
              </div>
              <div>
                <label htmlFor="login-role" className="block text-lg font-bold">
                  Select Your Role
                </label>
                <select
                  id="login-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 min-h-[52px] w-full rounded-xl border-2 border-slate-900 bg-white px-4 text-lg font-bold"
                >
                  <option value="ELDER">Elderly Individual (High-Contrast Autonomy View)</option>
                  <option value="CARETAKER">Caretaker (Manage Schedule & AI Scanner)</option>
                  <option value="FAMILY">Family Member (Monitor Adherence)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[56px] w-full rounded-xl bg-emerald-800 px-6 py-3 text-xl font-bold text-white hover:bg-emerald-900"
              >
                Unlock Shared Profile
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-4 border-slate-900 bg-amber-100 p-6">
              <div>
                <h2 className="text-2xl font-extrabold">
                  Care Profile: {elderName} ({role} MODE)
                </h2>
                <p className="text-xl font-bold text-slate-900">
                  Today&apos;s Medication Adherence: {adherenceRate}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToken(null)}
                className="min-h-[52px] rounded-xl border-2 border-slate-900 bg-white px-5 py-2 text-lg font-bold"
              >
                Switch Role / Lock
              </button>
            </section>

            {/* Gemini AI Prescription Scanner (Enabled for ELDER and CARETAKER) */}
            {role !== 'FAMILY' && (
              <form
                onSubmit={handleGeminiSmartAdd}
                className="space-y-4 rounded-2xl border-4 border-slate-900 bg-white p-6"
              >
                <h3 className="text-2xl font-bold">
                  ✨ Google Gemini 2.5 Flash — Smart Prescription & Interaction Guard
                </h3>
                <label htmlFor="rx-input" className="block text-lg font-medium">
                  Type or paste doctor&apos;s prescription text (e.g., &quot;Metformin 500mg morning after breakfast&quot;):
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="rx-input"
                    required
                    value={rxInput}
                    onChange={(e) => setRxInput(e.target.value)}
                    placeholder="Amlodipine 5mg at 08:00 after breakfast"
                    className="min-h-[56px] flex-1 rounded-xl border-2 border-slate-900 px-4 text-lg"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="min-h-[56px] rounded-xl bg-blue-800 px-6 py-3 text-xl font-bold text-white hover:bg-blue-900"
                  >
                    Scan & Schedule with Gemini
                  </button>
                </div>
                {aiWarning && (
                  <p role="alert" className="rounded-xl bg-amber-200 p-3 text-lg font-bold">
                    ⚠️ Gemini Interaction Check: {aiWarning}
                  </p>
                )}
              </form>
            )}

            {/* Medication Dose Cards */}
            <section className="space-y-4">
              <h3 className="text-2xl font-extrabold">Today&apos;s Medication Schedule</h3>
              {doses.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-slate-400 bg-white p-8 text-center text-xl font-medium">
                  No medications scheduled yet. Use the Gemini Prescription Scanner above to add one.
                </p>
              ) : (
                doses.map((dose) => (
                  <article
                    key={dose.id}
                    className="rounded-2xl border-4 border-slate-900 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="rounded-lg bg-slate-900 px-3 py-1 text-lg font-bold text-white">
                          ⏰ {dose.scheduled_time} — Status: {dose.status}
                        </span>
                        <h4 className="mt-2 text-3xl font-extrabold">
                          {dose.medication_name} ({dose.dosage})
                        </h4>
                        <p className="mt-1 text-xl text-slate-800">{dose.instructions}</p>
                        {dose.elder_note && (
                          <p className="mt-2 text-lg font-bold text-amber-900">
                            Elder Note: &ldquo;{dose.elder_note}&rdquo;
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          speakAloud(
                            `Medication ${dose.medication_name}, ${dose.dosage}. ${dose.instructions}`
                          )
                        }
                        aria-label={`Read ${dose.medication_name} instructions aloud`}
                        className="min-h-[56px] rounded-xl border-2 border-slate-900 bg-slate-100 px-5 py-3 text-lg font-bold"
                      >
                        🔊 Listen Aloud
                      </button>
                    </div>

                    {dose.status === 'PENDING' && role !== 'FAMILY' && (
                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => handleDoseAction(dose.id, 'TAKEN')}
                          className="min-h-[60px] rounded-xl bg-emerald-800 px-6 py-3 text-2xl font-extrabold text-white hover:bg-emerald-900"
                        >
                          ✓ I Took This Dose
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDoseAction(
                              dose.id,
                              'SNOOZED',
                              'Having meal late — taking in 30 minutes'
                            )
                          }
                          className="min-h-[60px] rounded-xl border-4 border-slate-900 bg-amber-100 px-6 py-3 text-xl font-bold text-slate-950 hover:bg-amber-200"
                        >
                          ⏳ Delay +30m (Notify Care Circle)
                        </button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
