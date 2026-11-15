-- ============================================================================
-- SushrutaCare AI — PostgreSQL Schema & Security Policies
-- Migration: 001_initial_schema.sql
-- Compatible with Supabase PostgreSQL (Standard & Enterprise)
-- Evaluated against CATALYST 2026: Code Quality, Security, Efficiency
-- ============================================================================

-- Enable cryptographic functions for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Elder Profiles Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.elder_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_name VARCHAR(120) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 40 AND age <= 130),
    blood_group VARCHAR(10) DEFAULT 'O+',
    passcode_hash TEXT NOT NULL,
    caregiver_emails TEXT[] NOT NULL DEFAULT '{}',
    emergency_contacts TEXT[] NOT NULL DEFAULT '{}',
    preferred_language VARCHAR(15) NOT NULL DEFAULT 'en-IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Medications Table (with Refill & Time-Bucket Tracking) ──────────────────
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    dosage VARCHAR(80) NOT NULL,
    time_bucket VARCHAR(20) NOT NULL DEFAULT 'MORNING'
        CHECK (time_bucket IN ('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'AS_NEEDED')),
    scheduled_time VARCHAR(5) NOT NULL CHECK (scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    instructions TEXT NOT NULL,
    stock_remaining INTEGER NOT NULL DEFAULT 30 CHECK (stock_remaining >= 0),
    refill_threshold INTEGER NOT NULL DEFAULT 5 CHECK (refill_threshold >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Adherence Logs Table (with Autonomy-First Context Notes) ───────────────
CREATE TABLE IF NOT EXISTS public.adherence_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'TAKEN', 'SNOOZED', 'MISSED')),
    elder_note TEXT,
    updated_by_role VARCHAR(20) DEFAULT 'ELDER',
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    actioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Medical Appointments Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    doctor_name VARCHAR(120) NOT NULL,
    specialty VARCHAR(100) NOT NULL,
    appointment_time TIMESTAMPTZ NOT NULL,
    location TEXT NOT NULL,
    notes TEXT,
    google_calendar_url TEXT,
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Vitals & Health Logs Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vitals_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    heart_rate INTEGER CHECK (heart_rate BETWEEN 30 AND 250),
    systolic_bp INTEGER CHECK (systolic_bp BETWEEN 50 AND 260),
    diastolic_bp INTEGER CHECK (diastolic_bp BETWEEN 30 AND 180),
    blood_glucose NUMERIC(5, 2) CHECK (blood_glucose BETWEEN 20 AND 800),
    spo2_percent INTEGER CHECK (spo2_percent BETWEEN 50 AND 100),
    notes TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Emergency SOS Alerts Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sos_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    triggered_by VARCHAR(20) NOT NULL DEFAULT 'ELDER',
    alert_message TEXT NOT NULL,
    emergency_level VARCHAR(20) NOT NULL DEFAULT 'HIGH'
        CHECK (emergency_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. High-Efficiency Composite Indexes (Signal 3: Efficiency) ───────────────
CREATE INDEX IF NOT EXISTS idx_medications_profile_active
    ON public.medications(profile_id, is_active);

CREATE INDEX IF NOT EXISTS idx_medications_refill_watch
    ON public.medications(profile_id, stock_remaining, refill_threshold)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_adherence_pending_reminders
    ON public.adherence_logs(profile_id, status, reminder_sent, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
    ON public.appointments(profile_id, appointment_time);

CREATE INDEX IF NOT EXISTS idx_vitals_profile_time
    ON public.vitals_logs(profile_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_sos_unresolved
    ON public.sos_alerts(profile_id, resolved, created_at DESC);

-- ── 8. Auto-update Trigger for updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_elder_profiles_updated_at ON public.elder_profiles;
CREATE TRIGGER set_elder_profiles_updated_at
    BEFORE UPDATE ON public.elder_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ── 9. Safe Helper for JWT profile_id Claim Extraction ───────────────────────
CREATE OR REPLACE FUNCTION public.get_jwt_profile_id()
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'profile_id',
        NULLIF(current_setting('request.jwt.claim.profile_id', true), ''),
        ''
    );
EXCEPTION WHEN OTHERS THEN
    RETURN '';
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 10. Enable Row Level Security (RLS) on All Tables ────────────────────────
ALTER TABLE public.elder_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitals_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- ── 11. Idempotent Row Level Security Policies ───────────────────────────────

-- Elder Profiles: Allow registration and profile-isolated reads/updates
DROP POLICY IF EXISTS "Allow profile creation" ON public.elder_profiles;
CREATE POLICY "Allow profile creation"
    ON public.elder_profiles
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Isolate elder profile by JWT claim" ON public.elder_profiles;
CREATE POLICY "Isolate elder profile by JWT claim"
    ON public.elder_profiles
    FOR SELECT
    USING (id::text = public.get_jwt_profile_id());

DROP POLICY IF EXISTS "Allow profile update by JWT claim" ON public.elder_profiles;
CREATE POLICY "Allow profile update by JWT claim"
    ON public.elder_profiles
    FOR UPDATE
    USING (id::text = public.get_jwt_profile_id())
    WITH CHECK (id::text = public.get_jwt_profile_id());

-- Medications: CRUD isolated strictly by JWT profile_id
DROP POLICY IF EXISTS "Isolate medications by JWT profile_id" ON public.medications;
CREATE POLICY "Isolate medications by JWT profile_id"
    ON public.medications
    FOR ALL
    USING (profile_id::text = public.get_jwt_profile_id())
    WITH CHECK (profile_id::text = public.get_jwt_profile_id());

-- Adherence Logs: CRUD isolated strictly by JWT profile_id
DROP POLICY IF EXISTS "Isolate adherence logs by JWT profile_id" ON public.adherence_logs;
CREATE POLICY "Isolate adherence logs by JWT profile_id"
    ON public.adherence_logs
    FOR ALL
    USING (profile_id::text = public.get_jwt_profile_id())
    WITH CHECK (profile_id::text = public.get_jwt_profile_id());

-- Appointments: CRUD isolated strictly by JWT profile_id
DROP POLICY IF EXISTS "Isolate appointments by JWT profile_id" ON public.appointments;
CREATE POLICY "Isolate appointments by JWT profile_id"
    ON public.appointments
    FOR ALL
    USING (profile_id::text = public.get_jwt_profile_id())
    WITH CHECK (profile_id::text = public.get_jwt_profile_id());

-- Vitals Logs: CRUD isolated strictly by JWT profile_id
DROP POLICY IF EXISTS "Isolate vitals by JWT profile_id" ON public.vitals_logs;
CREATE POLICY "Isolate vitals by JWT profile_id"
    ON public.vitals_logs
    FOR ALL
    USING (profile_id::text = public.get_jwt_profile_id())
    WITH CHECK (profile_id::text = public.get_jwt_profile_id());

-- SOS Alerts: Creation and read/update isolated by profile_id
DROP POLICY IF EXISTS "Isolate sos alerts by JWT profile_id" ON public.sos_alerts;
CREATE POLICY "Isolate sos alerts by JWT profile_id"
    ON public.sos_alerts
    FOR ALL
    USING (profile_id::text = public.get_jwt_profile_id())
    WITH CHECK (profile_id::text = public.get_jwt_profile_id());

-- ── 12. Explicit Schema & Role Grants ────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
