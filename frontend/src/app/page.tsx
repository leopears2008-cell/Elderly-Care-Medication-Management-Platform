'use client';

import { useState, useEffect } from 'react';
import { authApi, medicationsApi, type User, type Medication } from '@/lib/api';
import ElderDoseCard from '@/components/ElderDoseCard';
import PrescriptionScanner from '@/components/PrescriptionScanner';
import AppointmentManager from '@/components/AppointmentManager';

type Role = 'elder' | 'caretaker' | 'family';
type Tab = 'medications' | 'appointments' | 'scanner' | 'analytics';

export default function Home() {
  const [passcode, setPasscode] = useState('');
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('elder');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('medications');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginStep, setLoginStep] = useState<'email' | 'passcode'>('email');

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        const u = JSON.parse(savedUser) as User;
        setUser(u);
        setRole(u.role as Role);
      } catch {}
    }
  }, []);

  // Load medications when user is set
  useEffect(() => {
    if (user) {
      medicationsApi.list().then(setMedications).catch(console.error);
    }
  }, [user]);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(email, passcode);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setUser(res.user);
      setRole(res.user.role as Role);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    setPasscode('');
    setEmail('');
  };

  const handleMedicationTaken = async (med: Medication) => {
    try {
      const now = new Date().toISOString();
      await medicationsApi.logAdherence(med.id, 'taken', now);
      setMedications(prev => prev.map(m => m.id === med.id ? { ...m, adherence_percent: 100 } : m));
    } catch (e) {
      console.error('Failed to log adherence', e);
    }
  };

  const handleMedicationMissed = async (med: Medication) => {
    try {
      const now = new Date().toISOString();
      await medicationsApi.logAdherence(med.id, 'missed', now);
    } catch (e) {
      console.error('Failed to log adherence', e);
    }
  };

  // ── Passcode Gate ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-900 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm"
          role="main"
          aria-label="SushrutaCare AI Login"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-3" aria-hidden="true">🏥</div>
            <h1 className="text-3xl font-bold text-blue-900">SushrutaCare</h1>
            <p className="text-gray-600 text-lg mt-1">AI-Powered Care</p>
          </div>

          {loginStep === 'email' ? (
            <div>
              <label
                htmlFor="email-input"
                className="block text-xl font-semibold text-gray-800 mb-3"
              >
                Email Address
              </label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setLoginStep('passcode')}
                placeholder="your@email.com"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-4 text-xl focus:border-blue-600 focus:outline-none"
                aria-required="true"
                autoComplete="email"
              />
              <button
                onClick={() => setLoginStep('passcode')}
                disabled={!email}
                className="w-full mt-5 bg-blue-800 text-white text-xl font-bold rounded-xl py-4 touch-target hover:bg-blue-700 disabled:opacity-50 transition-colors"
                aria-label="Continue to passcode entry"
              >
                Continue →
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setLoginStep('email')}
                className="text-blue-700 text-base mb-4 flex items-center gap-1 hover:underline"
                aria-label="Go back to email entry"
              >
                ← {email}
              </button>
              <label
                htmlFor="passcode-input"
                className="block text-xl font-semibold text-gray-800 mb-3"
              >
                Enter Your Passcode
              </label>
              <input
                id="passcode-input"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={12}
                value={passcode}
                onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-4 text-3xl text-center tracking-widest focus:border-blue-600 focus:outline-none"
                aria-required="true"
                autoComplete="current-password"
                autoFocus
              />

              {/* Large PIN pad for seniors */}
              <div
                className="grid grid-cols-3 gap-3 mt-5"
                role="group"
                aria-label="Numeric keypad"
              >
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (key === '⌫') setPasscode(p => p.slice(0, -1));
                      else if (key) setPasscode(p => (p + key).slice(0, 12));
                    }}
                    disabled={!key}
                    className={`h-16 rounded-xl text-2xl font-bold transition-colors touch-target
                      ${key === '⌫' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 
                        key ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300' : 
                        'invisible'}`}
                    aria-label={key === '⌫' ? 'Delete last digit' : key ? `Digit ${key}` : ''}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {error && (
                <p role="alert" className="mt-4 text-red-700 text-center text-lg font-medium">
                  ⚠️ {error}
                </p>
              )}

              <button
                onClick={handleLogin}
                disabled={passcode.length < 4 || loading}
                className="w-full mt-5 bg-green-700 text-white text-xl font-bold rounded-xl py-4 touch-target hover:bg-green-600 disabled:opacity-50 transition-colors"
                aria-label="Sign in"
              >
                {loading ? '⏳ Signing in...' : '✓ Sign In'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Elder View ────────────────────────────────────────────────────────────
  if (role === 'elder') {
    const speakAll = () => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const text = medications.length === 0
        ? 'You have no medications scheduled for today.'
        : `You have ${medications.length} medications. ` + medications
            .map(m => `${m.name}, ${m.dosage}, at ${m.dose_times.join(' and ')}.`)
            .join(' ');
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.85;
      utt.pitch = 1;
      utt.volume = 1;
      window.speechSynthesis.speak(utt);
    };

    return (
      <div className="min-h-screen bg-gray-50 senior-mode">
        {/* Header */}
        <header className="bg-blue-900 text-white px-6 py-5">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">🏥 SushrutaCare AI</h1>
              <p className="text-blue-200 text-xl">Hello, {user.name} 👋</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-blue-700 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-lg font-semibold touch-target transition-colors"
              aria-label="Sign out"
            >
              Sign Out
            </button>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Speak All button */}
          <button
            onClick={speakAll}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black text-2xl font-bold py-5 rounded-2xl touch-target mb-8 flex items-center justify-center gap-3 transition-colors"
            aria-label="Read all medications aloud"
          >
            🔊 Read My Medications Aloud
          </button>

          <h2 className="text-2xl font-bold text-gray-900 mb-5">
            Today&apos;s Medications ({medications.length})
          </h2>

          {medications.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <p className="text-2xl text-gray-600">✅ No medications scheduled</p>
            </div>
          ) : (
            <div className="space-y-5">
              {medications.map(med => (
                <ElderDoseCard
                  key={med.id}
                  medication={med}
                  onTaken={() => handleMedicationTaken(med)}
                  onMissed={() => handleMedicationMissed(med)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Caretaker / Family View ───────────────────────────────────────────────
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'medications', label: 'Medications', icon: '💊' },
    { key: 'appointments', label: 'Appointments', icon: '📅' },
    { key: 'scanner', label: 'AI Scanner', icon: '🔬' },
    { key: 'analytics', label: 'Analytics', icon: '📊' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">🏥 SushrutaCare AI</h1>
            <p className="text-blue-200">Caretaker Dashboard — {user.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-base font-semibold touch-target transition-colors"
            aria-label="Sign out"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav aria-label="Dashboard sections" className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={`px-5 py-4 text-base font-semibold whitespace-nowrap border-b-4 transition-colors touch-target
                ${activeTab === tab.key
                  ? 'border-blue-700 text-blue-800'
                  : 'border-transparent text-gray-600 hover:text-blue-700 hover:border-blue-300'
                }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'medications' && (
          <section aria-label="Medications management">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Medications</h2>
            </div>
            {medications.length === 0 ? (
              <p className="text-gray-500 text-lg">No medications added yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {medications.map(med => (
                  <ElderDoseCard
                    key={med.id}
                    medication={med}
                    onTaken={() => handleMedicationTaken(med)}
                    onMissed={() => handleMedicationMissed(med)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'appointments' && <AppointmentManager />}
        {activeTab === 'scanner' && <PrescriptionScanner />}

        {activeTab === 'analytics' && (
          <section aria-label="Adherence analytics">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Adherence Analytics</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <p className="text-5xl font-bold text-green-700">
                  {medications.filter(m => (m.adherence_percent ?? 0) >= 80).length}
                </p>
                <p className="text-gray-600 text-lg mt-2">High Adherence (&ge;80%)</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <p className="text-5xl font-bold text-yellow-600">
                  {medications.filter(m => {
                    const p = m.adherence_percent ?? 0;
                    return p >= 50 && p < 80;
                  }).length}
                </p>
                <p className="text-gray-600 text-lg mt-2">Moderate (50–79%)</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <p className="text-5xl font-bold text-red-700">
                  {medications.filter(m => (m.adherence_percent ?? 0) < 50).length}
                </p>
                <p className="text-gray-600 text-lg mt-2">Low Adherence (&lt;50%)</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
