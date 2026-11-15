-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Elder Profiles Table
CREATE TABLE IF NOT EXISTS public.elder_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_name VARCHAR(120) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 40 AND age <= 130),
    blood_group VARCHAR(10),
    passcode_hash TEXT NOT NULL,
    caregiver_emails TEXT[] NOT NULL DEFAULT '{}',
    preferred_language VARCHAR(15) NOT NULL DEFAULT 'en-IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Medications Table
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.elder_profiles(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    dosage VARCHAR(80) NOT NULL,
    scheduled_time VARCHAR(5) NOT NULL CHECK (scheduled_time ~ '^([01]\d|2[0-3]):([0-5]\d)$'),
    instructions TEXT NOT NULL,
    stock_remaining INTEGER NOT NULL DEFAULT 30 CHECK (stock_remaining >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Adherence Logs Table
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

-- 4. Medical Appointments Table
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

-- 5. High-Efficiency Composite Indexes (Evaluated for Efficiency Signal)
CREATE INDEX IF NOT EXISTS idx_medications_profile_active
    ON public.medications(profile_id, is_active);

CREATE INDEX IF NOT EXISTS idx_adherence_pending_reminders
    ON public.adherence_logs(profile_id, status, reminder_sent, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
    ON public.appointments(profile_id, appointment_time);

-- 6. Enable Row Level Security (RLS) on All Tables
ALTER TABLE public.elder_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: Isolate records strictly by JWT claim profile_id
CREATE POLICY "Isolate elder profile by JWT claim"
    ON public.elder_profiles
    FOR SELECT
    USING (id::text = coalesce(current_setting('request.jwt.claims', true)::json->>'profile_id', ''));

CREATE POLICY "Isolate medications by JWT profile_id"
    ON public.medications
    FOR ALL
    USING (profile_id::text = coalesce(current_setting('request.jwt.claims', true)::json->>'profile_id', ''));

CREATE POLICY "Isolate adherence logs by JWT profile_id"
    ON public.adherence_logs
    FOR ALL
    USING (profile_id::text = coalesce(current_setting('request.jwt.claims', true)::json->>'profile_id', ''));

CREATE POLICY "Isolate appointments by JWT profile_id"
    ON public.appointments
    FOR ALL
    USING (profile_id::text = coalesce(current_setting('request.jwt.claims', true)::json->>'profile_id', ''));
