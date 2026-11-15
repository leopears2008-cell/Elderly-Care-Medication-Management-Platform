-- SushrutaCare AI — Initial Database Schema
-- Supabase PostgreSQL + RLS Policies
-- Migration: 001_initial_schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    passcode_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'elder'
                        CHECK (role IN ('elder', 'caretaker', 'family')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Medications ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    dosage              TEXT NOT NULL,
    frequency           TEXT NOT NULL,
    dose_times          TEXT[] NOT NULL DEFAULT '{}',
    instructions        TEXT,
    prescribing_doctor  TEXT,
    start_date          DATE,
    end_date            DATE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medications_user_id ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_medications_active  ON medications(user_id, is_active);

-- ── Adherence Logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adherence_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medication_id   UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_time  TIMESTAMPTZ NOT NULL,
    taken_at        TIMESTAMPTZ,
    status          TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'pending')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adherence_medication_id  ON adherence_logs(medication_id);
CREATE INDEX IF NOT EXISTS idx_adherence_user_id        ON adherence_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_adherence_scheduled_time ON adherence_logs(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_adherence_status         ON adherence_logs(user_id, status);

-- ── Appointments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_name         TEXT NOT NULL,
    specialty           TEXT,
    appointment_dt      TIMESTAMPTZ NOT NULL,
    duration_minutes    INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
    location            TEXT,
    notes               TEXT,
    reminder_sent       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_user_id       ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dt            ON appointments(appointment_dt);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_sent ON appointments(reminder_sent, appointment_dt);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_medications_updated_at
    BEFORE UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments   ENABLE ROW LEVEL SECURITY;

-- Users: can only read and update their own row
CREATE POLICY users_select_own ON users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY users_update_own ON users
    FOR UPDATE USING (id = auth.uid());

-- Medications: full CRUD on own records
CREATE POLICY medications_select_own ON medications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY medications_insert_own ON medications
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY medications_update_own ON medications
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY medications_delete_own ON medications
    FOR DELETE USING (user_id = auth.uid());

-- Adherence logs: full CRUD on own records
CREATE POLICY adherence_select_own ON adherence_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY adherence_insert_own ON adherence_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY adherence_update_own ON adherence_logs
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY adherence_delete_own ON adherence_logs
    FOR DELETE USING (user_id = auth.uid());

-- Appointments: full CRUD on own records
CREATE POLICY appointments_select_own ON appointments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY appointments_insert_own ON appointments
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY appointments_update_own ON appointments
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY appointments_delete_own ON appointments
    FOR DELETE USING (user_id = auth.uid());

-- ── Example seed (commented — run manually if needed) ─────────────────────────
-- INSERT INTO users (email, name, passcode_hash, role) VALUES
--   ('elder@example.com', 'Ramesh Kumar', '$2b$12$PLACEHOLDER_HASH', 'elder');
