'use client';

import React, { useState, useEffect } from 'react';
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

type TabType = 'schedule' | 'vitals' | 'ai' | 'appointments';

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

  // Active view tab
  const [activeTab, setActiveTab] = useState<TabType>('schedule');

  // Accessibility Controls
  const [seniorHighContrast, setSeniorHighContrast] = useState<boolean>(false);
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [voiceSpeed, setVoiceSpeed] = useState<number>(0.85);

  // Pre-login tab
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  // New Profile setup states
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
  const [glucose, setGlucose] = useState<string>('105');
  const [showVitalsModal, setShowVitalsModal] = useState<boolean>(false);

  // Emergency SOS state
  const [sosActive, setSosActive] = useState<boolean>(false);
  const [sosHospitalUrl, setSosHospitalUrl] = useState<string>('');
  const [showSosConfirm, setShowSosConfirm] = useState<boolean>(false);

  // Live Clock
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setCurrentDate(
        now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
      );
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const speakAloud = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = voiceSpeed;
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

      const vRes = await fetch(`${API_BASE}/api/v1/vitals`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (vRes.ok) {
        setVitalsList(await vRes.json());
      }

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
      setAuthView('login');
      const msg = `Care Circle created! Profile ID: ${data.profile_id}. You can now unlock.`;
      setStatusBanner(msg);
      speakAloud('Care Circle created successfully. You can now unlock.');
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
          ? 'Medication marked as taken! Well done.'
          : 'Dose delayed by 30 minutes. Care circle has been informed.';
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
    if (!token || !rxInput.trim()) return;
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
      if (!scanRes.ok) throw new Error(parsed.detail || 'AI prescription parse failed');
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
          elder_note: 'Daily checkup entry',
        }),
      });
      if (!res.ok) throw new Error('Failed to log vitals');
      const data = await res.json();
      setShowVitalsModal(false);
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
      setShowSosConfirm(false);
      const alertMsg = 'EMERGENCY SOS DISPATCHED! All caregivers alerted via high-priority push & email.';
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

  const fontClass =
    fontScale === 'xlarge' ? 'text-2xl' : fontScale === 'large' ? 'text-xl' : 'text-base';

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        seniorHighContrast
          ? 'bg-black text-yellow-300'
          : 'bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100 text-slate-900'
      } ${fontClass}`}
    >
      {/* Top Application Bar */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
          seniorHighContrast
            ? 'border-yellow-400 bg-black/95 text-yellow-300'
            : 'border-slate-200 bg-white/95 text-slate-900 shadow-sm'
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${
                seniorHighContrast ? 'bg-yellow-300 text-black' : 'bg-teal-700 text-white'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
                aria-hidden="true"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tight">SushrutaCare</span>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider text-teal-800">
                  AI
                </span>
              </div>
              <p className="text-xs font-semibold opacity-75">
                Senior Care & Autonomous Medication Platform
              </p>
            </div>
          </div>

          {/* Senior Clock & Accessibility Toolbar */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Live Clock Display */}
            <div
              className={`hidden rounded-xl border px-3 py-1.5 text-right sm:block ${
                seniorHighContrast
                  ? 'border-yellow-400 bg-neutral-900 text-yellow-300'
                  : 'border-slate-200 bg-slate-100 text-slate-800'
              }`}
            >
              <div className="text-xs font-semibold">{currentDate}</div>
              <div className="text-sm font-black tracking-wide font-mono">{currentTime}</div>
            </div>

            {/* Font Scale Button */}
            <button
              type="button"
              onClick={() => {
                const next =
                  fontScale === 'normal' ? 'large' : fontScale === 'large' ? 'xlarge' : 'normal';
                setFontScale(next);
                speakAloud(`Text size set to ${next}`);
              }}
              title="Adjust Font Size"
              aria-label="Adjust Font Size"
              className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-all ${
                seniorHighContrast
                  ? 'border-yellow-300 bg-neutral-900 text-yellow-300'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span className="text-base">🔠</span>
              <span>{fontScale.toUpperCase()}</span>
            </button>

            {/* High Contrast Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !seniorHighContrast;
                setSeniorHighContrast(next);
                speakAloud(next ? 'High contrast senior mode on' : 'Standard display mode on');
              }}
              title="Toggle Senior AAA High Contrast"
              aria-label="Toggle Senior AAA High Contrast"
              className={`flex h-11 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-black transition-all ${
                seniorHighContrast
                  ? 'border-yellow-400 bg-yellow-300 text-black hover:bg-yellow-400'
                  : 'border-slate-800 bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <span>👁️</span>
              <span className="hidden sm:inline">
                {seniorHighContrast ? 'Normal Mode' : 'Senior AAA'}
              </span>
            </button>

            {/* Voice Speed Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = voiceSpeed === 0.85 ? 0.7 : 0.85;
                setVoiceSpeed(next);
                speakAloud(next === 0.7 ? 'Voice pace set to very slow' : 'Voice pace set to normal');
              }}
              title="Toggle Speech Pace"
              aria-label="Toggle Voice Cadence"
              className={`flex h-11 items-center gap-1 rounded-xl border px-3 text-sm font-bold ${
                seniorHighContrast
                  ? 'border-yellow-300 bg-neutral-900 text-yellow-300'
                  : 'border-slate-300 bg-white text-slate-800'
              }`}
            >
              <span>🔊</span>
              <span className="hidden md:inline">{voiceSpeed === 0.7 ? 'Slow Audio' : 'Audio Normal'}</span>
            </button>

            {token && (
              <button
                type="button"
                onClick={() => setToken(null)}
                className="flex h-11 items-center gap-1 rounded-xl border-2 border-red-700 bg-red-50 px-3 text-sm font-bold text-red-900 hover:bg-red-100"
              >
                <span>🔒</span>
                <span>Lock</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Status & Error Notification Banners */}
        <div aria-live="polite" className="space-y-2">
          {statusBanner && (
            <div
              className={`flex items-center justify-between rounded-2xl border-2 p-4 text-lg font-bold shadow-sm ${
                seniorHighContrast
                  ? 'border-yellow-300 bg-neutral-950 text-yellow-300'
                  : 'border-emerald-700 bg-emerald-50 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">✓</span>
                <span>{statusBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner('')}
                aria-label="Dismiss message"
                className="text-sm underline opacity-75 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {errorBanner && (
            <div
              role="alert"
              className="flex items-center justify-between rounded-2xl border-2 border-red-700 bg-red-50 p-4 text-lg font-bold text-red-950 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner('')}
                aria-label="Dismiss error"
                className="text-sm underline opacity-75 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {!token ? (
          /* ==================================================================== */
          /* PRE-LOGIN HERO & PASSCODE ENTRY VIEW                                  */
          /* ==================================================================== */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start py-4">
            {/* Left Hero Column */}
            <div className="space-y-6 lg:col-span-6">
              <div
                className={`rounded-3xl border-2 p-8 shadow-sm ${
                  seniorHighContrast
                    ? 'border-yellow-400 bg-neutral-900 text-yellow-300'
                    : 'border-teal-200/80 bg-white text-slate-900'
                }`}
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-sm font-bold text-teal-900">
                  <span>🛡️</span>
                  <span>Senior Autonomy & Family Safety</span>
                </div>
                <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                  Medication Care Circle Built for Seniors
                </h2>
                <p className="mt-3 text-lg opacity-85 leading-relaxed">
                  No confusing passwords. Keep elderly family members independent with large high-contrast
                  controls, voice speech readouts, and immediate caregiver synchronization.
                </p>

                {/* Feature Checkpoints */}
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl text-teal-600 font-bold">✓</span>
                    <span className="font-semibold">6-Digit Care Circle Passcode</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl text-teal-600 font-bold">✓</span>
                    <span className="font-semibold">Google Gemini 2.5 Flash OCR</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl text-teal-600 font-bold">✓</span>
                    <span className="font-semibold">Polypharmacy Interaction Guard</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl text-teal-600 font-bold">✓</span>
                    <span className="font-semibold">One-Tap Emergency SOS</span>
                  </div>
                </div>

                {/* Switcher Tab between Login and Register */}
                <div className="mt-8 flex rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAuthView('login')}
                    className={`flex-1 rounded-xl py-3 text-base font-extrabold transition-all ${
                      authView === 'login'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1. Enter with Passcode
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthView('register')}
                    className={`flex-1 rounded-xl py-3 text-base font-extrabold transition-all ${
                      authView === 'register'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2. Create New Circle
                  </button>
                </div>
              </div>
            </div>

            {/* Right Form Column */}
            <div className="lg:col-span-6">
              {authView === 'login' ? (
                /* Passcode Login Card */
                <form
                  onSubmit={handlePasscodeLogin}
                  className={`space-y-5 rounded-3xl border-2 p-8 shadow-md ${
                    seniorHighContrast
                      ? 'border-yellow-400 bg-neutral-900 text-yellow-300'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  <div className="border-b pb-4">
                    <h3 className="text-2xl font-black">Enter Care Circle</h3>
                    <p className="text-sm opacity-75 mt-1">
                      Enter the Elder Profile ID and 6-digit passcode provided by your family.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="login-profile-id" className="block text-base font-black">
                      Elder Profile ID
                    </label>
                    <input
                      id="login-profile-id"
                      required
                      value={profileId}
                      onChange={(e) => setProfileId(e.target.value)}
                      placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                      className="mt-1.5 min-h-[56px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-black focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-passcode" className="block text-base font-black">
                      6-Digit Numeric Passcode
                    </label>
                    <input
                      id="login-passcode"
                      type="password"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="••••••"
                      className="mt-1.5 min-h-[56px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-3xl font-black tracking-widest text-center text-black focus:border-teal-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-black mb-2">Select Your Role</label>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {[
                        { r: 'ELDER', label: '👴 Elder', desc: 'Large Buttons & Voice' },
                        { r: 'CARETAKER', label: '🧑‍⚕️ Caretaker', desc: 'Manage & Add Regimen' },
                        { r: 'FAMILY', label: '👨‍👩‍👧 Family', desc: 'Monitor Adherence' },
                      ].map((item) => (
                        <button
                          key={item.r}
                          type="button"
                          onClick={() => setRole(item.r as any)}
                          className={`rounded-2xl border-2 p-3 text-left transition-all ${
                            role === item.r
                              ? 'border-teal-700 bg-teal-50 text-teal-950 font-black ring-2 ring-teal-600'
                              : 'border-slate-200 bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="font-extrabold text-base">{item.label}</div>
                          <div className="text-xs opacity-75 mt-0.5">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 min-h-[60px] w-full rounded-2xl bg-teal-700 px-6 py-4 text-xl font-black text-white shadow-md hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-400 active:scale-[0.99]"
                  >
                    {loading ? 'Unlocking...' : '🔓 Unlock Care Circle'}
                  </button>
                </form>
              ) : (
                /* Register Profile Card */
                <form
                  onSubmit={handleCreateProfile}
                  className={`space-y-5 rounded-3xl border-2 p-8 shadow-md ${
                    seniorHighContrast
                      ? 'border-yellow-400 bg-neutral-900 text-yellow-300'
                      : 'border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  <div className="border-b pb-4">
                    <h3 className="text-2xl font-black">Create New Care Circle</h3>
                    <p className="text-sm opacity-75 mt-1">
                      Set up an elder profile and configure caregiver alerts.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="reg-elder-name" className="block text-base font-black">
                      Elder Full Name
                    </label>
                    <input
                      id="reg-elder-name"
                      required
                      value={newElderName}
                      onChange={(e) => setNewElderName(e.target.value)}
                      placeholder="e.g. S. Ramanathan"
                      className="mt-1.5 min-h-[56px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-black"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-care-email" className="block text-base font-black">
                      Caregiver / Family Alert Email
                    </label>
                    <input
                      id="reg-care-email"
                      type="email"
                      required
                      value={newCareEmail}
                      onChange={(e) => setNewCareEmail(e.target.value)}
                      placeholder="caregiver@family.org"
                      className="mt-1.5 min-h-[56px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-black"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-passcode" className="block text-base font-black">
                      Choose 6-Digit Passcode
                    </label>
                    <input
                      id="reg-passcode"
                      type="password"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      value={newPasscode}
                      onChange={(e) => setNewPasscode(e.target.value)}
                      placeholder="e.g. 482910"
                      className="mt-1.5 min-h-[56px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-2xl font-black tracking-widest text-center text-black"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 min-h-[60px] w-full rounded-2xl bg-slate-900 px-6 py-4 text-xl font-black text-white shadow-md hover:bg-slate-800 active:scale-[0.99]"
                  >
                    {loading ? 'Creating...' : '✨ Create Care Circle'}
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* ==================================================================== */
          /* LOGGED IN DASHBOARD VIEW                                             */
          /* ==================================================================== */
          <div className="space-y-6">
            {/* STICKY EMERGENCY SOS HERO BANNER */}
            <section
              aria-label="Emergency Care Bar"
              className="rounded-3xl border-2 border-red-300 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 p-6 text-white shadow-lg"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-red-700 font-black text-lg">
                      !
                    </span>
                    <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                      One-Tap Emergency Care & SOS
                    </h2>
                  </div>
                  <p className="mt-1 text-base font-medium opacity-90">
                    Instantly dispatches alerts to family caregivers and launches hospital navigation.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSosConfirm(true)}
                    disabled={loading}
                    className="min-h-[60px] rounded-2xl bg-white px-6 py-3 text-xl font-black text-red-700 shadow-md hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-200 active:scale-[0.98]"
                  >
                    🚨 TRIGGER SOS
                  </button>

                  <a
                    href={GoogleMapsService.getNearbyHospitalsUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[60px] items-center rounded-2xl border-2 border-white/60 bg-red-800/60 px-5 py-3 text-base font-bold text-white hover:bg-red-800"
                  >
                    🏥 Emergency Hospitals
                  </a>

                  <a
                    href={GoogleMapsService.getNearbyPharmaciesUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[60px] items-center rounded-2xl border-2 border-white/60 bg-red-800/60 px-5 py-3 text-base font-bold text-white hover:bg-red-800"
                  >
                    💊 24/7 Pharmacies
                  </a>
                </div>
              </div>

              {sosActive && sosHospitalUrl && (
                <div className="mt-4 rounded-2xl bg-white p-4 text-slate-900 shadow">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-red-700">
                      🚨 Hospital Driving Directions Generated:
                    </span>
                    <a
                      href={sosHospitalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-black text-blue-700 underline"
                    >
                      Open Google Maps Turn-by-Turn Navigation →
                    </a>
                  </div>
                </div>
              )}
            </section>

            {/* Senior Care Profile Card & Adherence Status */}
            <section
              className={`rounded-3xl border-2 p-6 shadow-sm ${
                seniorHighContrast
                  ? 'border-yellow-400 bg-neutral-900 text-yellow-300'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black">{elderName}</h2>
                    <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-black text-teal-900">
                      {role} MODE
                    </span>
                  </div>
                  <p className="mt-1 text-base font-semibold opacity-80">
                    Care Circle Profile ID: <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{profileId}</code>
                  </p>
                </div>

                {/* Adherence Progress Bar */}
                <div className="min-w-[260px] space-y-2">
                  <div className="flex justify-between text-base font-extrabold">
                    <span>Today&apos;s Adherence</span>
                    <span className="text-teal-700">{adherenceRate}%</span>
                  </div>
                  <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-teal-600 transition-all duration-500"
                      style={{ width: `${adherenceRate}%` }}
                    />
                  </div>
                  <p className="text-xs font-semibold opacity-75">
                    {doses.filter((d) => d.status === 'TAKEN').length} of {doses.length} doses taken
                  </p>
                </div>
              </div>
            </section>

            {/* Low-Stock Refill Alert (If Any) */}
            {refills.some((r) => r.is_low_stock) && (
              <section className="rounded-3xl border-2 border-amber-400 bg-amber-50 p-5 shadow-sm text-amber-950">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h3 className="text-xl font-black">Medication Refill Alert</h3>
                    <p className="text-sm font-semibold">
                      Some medications are below the 5-pill threshold.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {refills
                    .filter((r) => r.is_low_stock)
                    .map((r) => (
                      <div
                        key={r.medication_id}
                        className="flex items-center justify-between rounded-2xl border border-amber-300 bg-white p-3.5"
                      >
                        <div>
                          <div className="font-extrabold text-slate-900">
                            {r.name} ({r.dosage})
                          </div>
                          <div className="text-xs font-bold text-red-600">
                            {r.stock_remaining} pills left (~{r.days_left_approx} days)
                          </div>
                        </div>
                        <a
                          href={GoogleMapsService.getNearbyPharmaciesUrl()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                        >
                          Find Chemist →
                        </a>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Segmented Navigation Tabs */}
            <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-2 border border-slate-200">
              {[
                { id: 'schedule', label: '💊 Daily Regimen', count: doses.length },
                { id: 'vitals', label: '🩺 Vitals & Health', count: vitalsList.length },
                { id: 'ai', label: '✨ Gemini AI & Food Guard' },
                { id: 'appointments', label: '📅 Consultations', count: appointments.length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 text-base font-extrabold transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ================================================================ */}
            {/* TAB 1: MEDICATION SCHEDULE                                       */}
            {/* ================================================================ */}
            {activeTab === 'schedule' && (
              <div className="space-y-6">
                {/* Morning Bucket */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-black text-amber-900">
                      🌅 Morning Routine (05:00 - 11:59)
                    </h3>
                    <span className="text-xs font-bold bg-amber-100 text-amber-900 px-2.5 py-1 rounded-full">
                      {morningDoses.length} dose(s)
                    </span>
                  </div>
                  {morningDoses.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 font-semibold">
                      No morning medications scheduled.
                    </p>
                  ) : (
                    morningDoses.map((dose) => renderDoseCard(dose))
                  )}
                </div>

                {/* Afternoon Bucket */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-black text-orange-900">
                      ☀️ Afternoon Routine (12:00 - 16:59)
                    </h3>
                    <span className="text-xs font-bold bg-orange-100 text-orange-900 px-2.5 py-1 rounded-full">
                      {afternoonDoses.length} dose(s)
                    </span>
                  </div>
                  {afternoonDoses.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 font-semibold">
                      No afternoon medications scheduled.
                    </p>
                  ) : (
                    afternoonDoses.map((dose) => renderDoseCard(dose))
                  )}
                </div>

                {/* Evening / Night Bucket */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-black text-indigo-950">
                      🌙 Evening & Night Routine (17:00 - 23:59)
                    </h3>
                    <span className="text-xs font-bold bg-indigo-100 text-indigo-900 px-2.5 py-1 rounded-full">
                      {eveningDoses.length} dose(s)
                    </span>
                  </div>
                  {eveningDoses.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 font-semibold">
                      No evening medications scheduled.
                    </p>
                  ) : (
                    eveningDoses.map((dose) => renderDoseCard(dose))
                  )}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* TAB 2: VITALS & HEALTH LOGS                                      */}
            {/* ================================================================ */}
            {activeTab === 'vitals' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black">Daily Vitals & Clinical Assessment</h3>
                  <button
                    type="button"
                    onClick={() => setShowVitalsModal(true)}
                    className="min-h-[48px] rounded-xl bg-teal-700 px-5 py-2.5 text-base font-extrabold text-white shadow hover:bg-teal-800"
                  >
                    + Log New Reading
                  </button>
                </div>

                {/* Quick Vitals Overview Cards */}
                {vitalsList.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm text-center">
                      <div className="text-xs font-bold text-slate-500 uppercase">Blood Pressure</div>
                      <div className="mt-1 text-2xl font-black text-slate-900">
                        {vitalsList[0].systolic_bp}/{vitalsList[0].diastolic_bp}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">mmHg</div>
                    </div>

                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm text-center">
                      <div className="text-xs font-bold text-slate-500 uppercase">Heart Pulse</div>
                      <div className="mt-1 text-2xl font-black text-rose-600">
                        {vitalsList[0].heart_rate}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">bpm</div>
                    </div>

                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm text-center">
                      <div className="text-xs font-bold text-slate-500 uppercase">Oxygen SpO2</div>
                      <div className="mt-1 text-2xl font-black text-blue-600">
                        {vitalsList[0].oxygen_saturation_spo2}%
                      </div>
                      <div className="text-xs font-semibold text-slate-500">normal: &gt;95%</div>
                    </div>

                    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm text-center">
                      <div className="text-xs font-bold text-slate-500 uppercase">Blood Sugar</div>
                      <div className="mt-1 text-2xl font-black text-amber-600">
                        {vitalsList[0].blood_glucose_mg_dl}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">mg/dL</div>
                    </div>
                  </div>
                )}

                {/* History list */}
                <div className="space-y-3">
                  <h4 className="text-xl font-black">Logged Vitals History</h4>
                  {vitalsList.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                      No vitals recorded yet. Tap &apos;Log New Reading&apos; above.
                    </p>
                  ) : (
                    vitalsList.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div>
                          <div className="text-lg font-black text-slate-900">
                            BP: {v.systolic_bp}/{v.diastolic_bp} mmHg | Heart: {v.heart_rate} bpm | SpO2: {v.oxygen_saturation_spo2}%
                          </div>
                          <div className="text-sm text-slate-500">
                            Logged: {new Date(v.logged_at).toLocaleString()}
                          </div>
                        </div>
                        <span className="rounded-xl bg-teal-100 px-3 py-1.5 text-sm font-extrabold text-teal-900">
                          {v.status_assessment}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* TAB 3: GEMINI AI PRESCRIPTION & FOOD INTERACTION GUARD           */}
            {/* ================================================================ */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                {/* Prescription Scanner */}
                {role !== 'FAMILY' && (
                  <form
                    onSubmit={handleGeminiSmartAdd}
                    className={`space-y-4 rounded-3xl border-2 p-6 shadow-sm ${
                      seniorHighContrast
                        ? 'border-yellow-400 bg-neutral-900'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">✨</span>
                      <h3 className="text-2xl font-black">
                        Google Gemini 2.5 Flash — Smart Prescription Scanner
                      </h3>
                    </div>
                    <p className="text-base font-semibold opacity-80">
                      Paste handwritten notes, prescription text, or medication instructions:
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        required
                        value={rxInput}
                        onChange={(e) => setRxInput(e.target.value)}
                        placeholder="e.g. Amlodipine 5mg morning after breakfast"
                        className="min-h-[56px] flex-1 rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-black"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="min-h-[56px] rounded-2xl bg-blue-700 px-6 py-3 text-lg font-black text-white hover:bg-blue-800"
                      >
                        AI Schedule
                      </button>
                    </div>
                    {aiWarning && (
                      <p role="alert" className="rounded-xl bg-amber-100 p-3 text-base font-bold text-amber-950">
                        ⚠️ Warning: {aiWarning}
                      </p>
                    )}
                  </form>
                )}

                {/* Polypharmacy & Adverse Food Interaction Guard */}
                <div
                  className={`space-y-4 rounded-3xl border-2 p-6 shadow-sm ${
                    seniorHighContrast
                      ? 'border-yellow-400 bg-neutral-900'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🛡️</span>
                    <h3 className="text-2xl font-black">
                      Adverse Drug & Food Interaction Guard
                    </h3>
                  </div>
                  <p className="text-base font-semibold opacity-80">
                    Verify dangerous senior food conflicts (Grapefruit with Statins, Dairy with Antibiotics, Vitamin K with Warfarin):
                  </p>
                  <form onSubmit={handleInteractionCheck} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      required
                      value={medToCheck}
                      onChange={(e) => setMedToCheck(e.target.value)}
                      placeholder="Enter drug name to check (e.g. Warfarin, Ciprofloxacin)"
                      className="min-h-[56px] flex-1 rounded-2xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-black"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="min-h-[56px] rounded-2xl bg-indigo-700 px-6 py-3 text-lg font-black text-white hover:bg-indigo-800"
                    >
                      Check Interactions
                    </button>
                  </form>

                  {interactionResult && (
                    <div className="mt-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/70 p-5 space-y-3 text-indigo-950">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black">
                          Status: {interactionResult.severity}
                        </span>
                        <span className="text-xs font-bold bg-indigo-200 px-2.5 py-1 rounded-full">
                          {interactionResult.ai_source}
                        </span>
                      </div>
                      <p className="text-lg font-bold">{interactionResult.elder_friendly_guidance}</p>
                      {interactionResult.foods_to_avoid.length > 0 && (
                        <div>
                          <strong className="text-red-800">Foods / Drinks to Avoid:</strong>
                          <ul className="list-disc pl-5 font-semibold">
                            {interactionResult.foods_to_avoid.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================================================================ */}
            {/* TAB 4: CONSULTATIONS & GOOGLE CALENDAR                           */}
            {/* ================================================================ */}
            {activeTab === 'appointments' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black">Doctor Consultations</h3>
                  <div className="text-sm font-semibold opacity-75">
                    Synced with Google Calendar
                  </div>
                </div>

                {appointments.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                    No medical consultations recorded.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {appointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div>
                          <div className="text-xl font-black text-slate-900">
                            Dr. {appt.doctor_name} ({appt.specialty})
                          </div>
                          <div className="text-sm font-semibold text-slate-600 mt-0.5">
                            📍 {appt.location} | ⏰ {new Date(appt.appointment_time).toLocaleString()}
                          </div>
                        </div>
                        {appt.google_calendar_url && (
                          <a
                            href={appt.google_calendar_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[48px] inline-flex items-center rounded-xl bg-blue-700 px-4 py-2.5 text-base font-extrabold text-white hover:bg-blue-800"
                          >
                            📅 Add to Google Calendar
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* EMERGENCY SOS SAFETY CONFIRMATION MODAL */}
      {showSosConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border-4 border-red-600 bg-white p-8 text-slate-900 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600">
              <span className="text-4xl">🚨</span>
              <h3 className="text-3xl font-black">Emergency SOS Confirmation</h3>
            </div>
            <p className="mt-3 text-lg font-bold text-slate-700">
              Are you sure you want to trigger the Emergency SOS?
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              This will immediately send high-priority push notifications and emails to all family caregivers
              and open turn-by-turn navigation to the nearest emergency hospital.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleTriggerSOS}
                disabled={loading}
                className="min-h-[56px] flex-1 rounded-2xl bg-red-600 px-6 py-3 text-xl font-black text-white hover:bg-red-700"
              >
                YES, TRIGGER SOS
              </button>
              <button
                type="button"
                onClick={() => setShowSosConfirm(false)}
                className="min-h-[56px] flex-1 rounded-2xl border-2 border-slate-300 bg-white px-6 py-3 text-lg font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VITALS LOG MODAL */}
      {showVitalsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border-2 border-slate-200 bg-white p-6 text-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-2xl font-black">Log Today&apos;s Vitals</h3>
              <button
                type="button"
                onClick={() => setShowVitalsModal(false)}
                className="text-2xl font-bold text-slate-400 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLogVitals} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold">Systolic BP</label>
                  <input
                    type="number"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Diastolic BP</label>
                  <input
                    type="number"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-bold">Pulse (bpm)</label>
                  <input
                    type="number"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">SpO2 (%)</label>
                  <input
                    type="number"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold">Glucose</label>
                  <input
                    type="number"
                    value={glucose}
                    onChange={(e) => setGlucose(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-4 min-h-[52px] w-full rounded-2xl bg-teal-700 text-lg font-black text-white hover:bg-teal-800"
              >
                Save Vitals & Evaluate
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
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
        className={`rounded-3xl border-2 p-6 shadow-sm transition-all ${
          seniorHighContrast
            ? 'border-yellow-400 bg-neutral-900 text-yellow-300'
            : dose.status === 'TAKEN'
            ? 'border-emerald-200 bg-emerald-50/50 text-slate-900'
            : dose.status === 'SNOOZED'
            ? 'border-amber-200 bg-amber-50/50 text-slate-900'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-extrabold ${
                  dose.status === 'TAKEN'
                    ? 'bg-emerald-700 text-white'
                    : dose.status === 'SNOOZED'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-white'
                }`}
              >
                ⏰ {dose.scheduled_time} — {dose.status}
              </span>
              {dose.stock_remaining !== undefined && (
                <span className="text-xs font-bold text-slate-500">
                  Stock: {dose.stock_remaining} left
                </span>
              )}
            </div>

            <h4 className="text-2xl font-black text-slate-900 sm:text-3xl">
              {dose.medication_name}{' '}
              <span className="text-xl font-bold opacity-75">({dose.dosage})</span>
            </h4>
            <p className="text-base font-semibold text-slate-700">{dose.instructions}</p>
            {dose.elder_note && (
              <p className="text-sm font-bold text-amber-800">
                Elder Note: &ldquo;{dose.elder_note}&rdquo;
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                speakAloud(
                  `Medication ${dose.medication_name}, ${dose.dosage}. ${dose.instructions}. Scheduled for ${dose.scheduled_time}.`
                )
              }
              aria-label={`Read ${dose.medication_name} instructions aloud`}
              className="flex min-h-[48px] items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 text-sm font-bold text-slate-900 hover:bg-slate-200"
            >
              <span>🔊</span>
              <span>Listen</span>
            </button>

            <a
              href={calendarRoutineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              <span>📅</span>
              <span>GCal</span>
            </a>
          </div>
        </div>

        {dose.status === 'PENDING' && role !== 'FAMILY' && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleDoseAction(dose.id, 'TAKEN')}
              className="min-h-[56px] rounded-2xl bg-emerald-700 px-6 py-3 text-xl font-black text-white shadow-md hover:bg-emerald-800 active:scale-[0.99]"
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
              className="min-h-[56px] rounded-2xl border-2 border-amber-500 bg-amber-100 px-6 py-3 text-lg font-black text-amber-950 hover:bg-amber-200 active:scale-[0.99]"
            >
              ⏳ Delay +30m (Notify Caregiver)
            </button>
          </div>
        )}
      </article>
    );
  }
}
