'use client';

import { useState, useEffect, FormEvent } from 'react';
import { appointmentsApi, type Appointment } from '@/lib/api';

export default function AppointmentManager() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    doctor_name: '',
    specialty: '',
    appointment_dt: '',
    duration_minutes: 30,
    location: '',
    notes: '',
  });

  useEffect(() => {
    appointmentsApi
      .list()
      .then(setAppointments)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await appointmentsApi.create({
        ...form,
        appointment_dt: new Date(form.appointment_dt).toISOString(),
      });
      setAppointments(prev => [...prev, created].sort(
        (a, b) => new Date(a.appointment_dt).getTime() - new Date(b.appointment_dt).getTime()
      ));
      setShowForm(false);
      setForm({ doctor_name: '', specialty: '', appointment_dt: '', duration_minutes: 30, location: '', notes: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this appointment?')) return;
    try {
      await appointmentsApi.delete(id);
      setAppointments(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const openCalendar = async (appt: Appointment) => {
    try {
      const { calendar_link } = await appointmentsApi.getCalendarLink(appt.id);
      window.open(calendar_link, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Could not generate calendar link.');
    }
  };

  const formatDt = (dt: string) =>
    new Date(dt).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <section aria-label="Appointment Manager">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">📅 Appointments</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-800 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl text-lg touch-target transition-colors"
          aria-expanded={showForm}
          aria-controls="appointment-form"
        >
          {showForm ? '✕ Cancel' : '+ Add Appointment'}
        </button>
      </div>

      {error && <p role="alert" className="mb-4 text-red-700 text-lg">⚠️ {error}</p>}

      {/* Add form */}
      {showForm && (
        <form
          id="appointment-form"
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm p-6 mb-8 space-y-4"
          aria-label="New appointment form"
        >
          <h3 className="text-xl font-bold text-gray-800">New Appointment</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="doctor-name" className="block font-semibold text-gray-700 mb-1">
                Doctor Name *
              </label>
              <input
                id="doctor-name"
                required
                value={form.doctor_name}
                onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
                placeholder="Dr. Sarah Johnson"
              />
            </div>
            <div>
              <label htmlFor="specialty" className="block font-semibold text-gray-700 mb-1">
                Specialty
              </label>
              <input
                id="specialty"
                value={form.specialty}
                onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
                placeholder="Cardiology"
              />
            </div>
            <div>
              <label htmlFor="appt-dt" className="block font-semibold text-gray-700 mb-1">
                Date &amp; Time *
              </label>
              <input
                id="appt-dt"
                required
                type="datetime-local"
                value={form.appointment_dt}
                onChange={e => setForm(f => ({ ...f, appointment_dt: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="duration" className="block font-semibold text-gray-700 mb-1">
                Duration (minutes)
              </label>
              <input
                id="duration"
                type="number"
                min={5}
                max={480}
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="location" className="block font-semibold text-gray-700 mb-1">
                Location
              </label>
              <input
                id="location"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
                placeholder="City Hospital, Room 204"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="block font-semibold text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-600 focus:outline-none resize-none"
                placeholder="Bring previous reports, fasting required..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xl font-bold py-4 rounded-xl touch-target transition-colors"
          >
            {submitting ? '⏳ Saving...' : '✓ Save Appointment'}
          </button>
        </form>
      )}

      {/* Appointments list */}
      {loading ? (
        <p className="text-gray-500 text-lg">Loading appointments...</p>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
          <p className="text-xl text-gray-500">📅 No appointments scheduled</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map(appt => (
            <article
              key={appt.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
              aria-label={`Appointment with Dr. ${appt.doctor_name}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">
                    👨‍⚕️ Dr. {appt.doctor_name}
                    {appt.specialty && (
                      <span className="ml-2 text-base font-normal text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg">
                        {appt.specialty}
                      </span>
                    )}
                  </h3>
                  <p className="text-lg text-gray-700 mt-1">📅 {formatDt(appt.appointment_dt)}</p>
                  <p className="text-gray-500 text-base">⏱ {appt.duration_minutes} minutes</p>
                  {appt.location && (
                    <p className="text-gray-600 mt-1">📍 {appt.location}</p>
                  )}
                  {appt.notes && (
                    <p className="text-gray-500 text-base mt-1">📝 {appt.notes}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => openCalendar(appt)}
                    className="bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-xl text-sm touch-target transition-colors whitespace-nowrap"
                    aria-label={`Add ${appt.doctor_name} appointment to Google Calendar`}
                  >
                    📅 Add to Calendar
                  </button>
                  <button
                    onClick={() => handleDelete(appt.id)}
                    className="bg-red-100 hover:bg-red-200 text-red-700 font-semibold px-4 py-2 rounded-xl text-sm touch-target transition-colors"
                    aria-label={`Delete appointment with Dr. ${appt.doctor_name}`}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
