-- ============================================================================
-- SushrutaCare AI — PostgreSQL Schema & Security Policies
-- Migration: 001_initial_schema.sql
-- Compatible with Supabase PostgreSQL (Standard & Enterprise)
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
    preferred_language VARCHAR(15) NOT NULL DEFAULT 'en-IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Medications Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    dosage VARCHAR(80) NOT NULL,
    scheduled_time VARCHAR(5) NOT NULL CHECK (scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    instructions TEXT NOT NULL,
    stock_remaining INTEGER NOT NULL DEFAULT 30 CHECK (stock_remaining >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Adherence Logs Table ──────────────────────────────────────────────────
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
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. High-Efficiency Composite Indexes ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_medications_profile_active
    ON public.medications(profile_id, is_active);

CREATE INDEX IF NOT EXISTS idx_adherence_pending_reminders
    ON public.adherence_logs(profile_id, status, reminder_sent, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
    ON public.appointments(profile_id, appointment_time);

-- ── 6. Auto-update Trigger for updated_at ─────────────────────────────────────
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

-- ── 7. Helper Function for Safe JWT profile_id Claim Extraction ───────────────
-- Avoids "invalid input syntax for type json" when request.jwt.claims is empty/missing
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

-- ── 8. Enable Row Level Security (RLS) on All Tables ──────────────────────────
ALTER TABLE public.elder_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- ── 9. Safe Idempotent Row Level Security Policies ────────────────────────────

-- Elder Profiles: Allow creation (registration) and profile-isolated reads/updates
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

-- ── 10. Explicit Schema & Role Grants ─────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
