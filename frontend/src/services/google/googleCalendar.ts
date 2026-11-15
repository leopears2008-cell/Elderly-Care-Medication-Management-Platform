/**
 * Google Calendar Sync Helper — SushrutaCare AI
 * Enables 1-click addition of doctor visits and routine daily medication reminders to Google Calendar.
 */

export interface CalendarAppointmentParams {
  elderName: string;
  doctorName: string;
  specialty: string;
  appointmentTime: Date;
  location: string;
  notes?: string;
  durationMinutes?: number;
}

export interface CalendarRoutineParams {
  elderName: string;
  medicationName: string;
  dosage: string;
  scheduledTimeStr: string; // HH:MM
  instructions: string;
}

export class GoogleCalendarClient {
  private static readonly CALENDAR_BASE = 'https://calendar.google.com/calendar/render';

  /**
   * Generates a Google Calendar link for a medical consultation.
   */
  public static createDoctorVisitUrl(params: CalendarAppointmentParams): string {
    const startStr = params.appointmentTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const duration = params.durationMinutes || 45;
    const endTime = new Date(params.appointmentTime.getTime() + duration * 60000);
    const endStr = endTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const details = [
      `Doctor Visit for ${params.elderName}`,
      `Specialist: Dr. ${params.doctorName} (${params.specialty})`,
      params.notes ? `Caregiver Notes: ${params.notes}` : '',
      'Scheduled via SushrutaCare AI Platform',
    ]
      .filter(Boolean)
      .join('\n');

    const searchParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: `🏥 [SushrutaCare] Dr. ${params.doctorName} - ${params.elderName}`,
      dates: `${startStr}/${endStr}`,
      details,
      location: params.location,
    });

    return `${this.CALENDAR_BASE}?${searchParams.toString()}`;
  }

  /**
   * Generates a recurring daily reminder for senior medication routines.
   */
  public static createMedicationRoutineUrl(params: CalendarRoutineParams): string {
    const [hh, mm] = params.scheduledTimeStr.split(':').map((v) => parseInt(v, 10));
    const now = new Date();
    now.setHours(hh || 8, mm || 0, 0, 0);

    const startStr = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = new Date(now.getTime() + 15 * 60000);
    const endStr = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const details = [
      `Medicine: ${params.medicationName} (${params.dosage})`,
      `Instructions: ${params.instructions}`,
      'Please take with water and mark taken in SushrutaCare AI app.',
    ].join('\n');

    const searchParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: `💊 [Medication] ${params.medicationName} (${params.dosage}) - ${params.elderName}`,
      dates: `${startStr}/${endStr}`,
      details,
      recur: 'RRULE:FREQ=DAILY',
    });

    return `${this.CALENDAR_BASE}?${searchParams.toString()}`;
  }
}
