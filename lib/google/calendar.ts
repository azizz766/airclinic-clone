import { google } from 'googleapis'
import type { GoogleCalendarConnection } from '@/lib/prisma-client/client'
import { buildOAuthClient } from './oauth'
import { prisma } from '@/lib/prisma'

type AppointmentForEvent = {
  id: string
  scheduledAt: Date
  durationMinutes: number
  patient: { firstName: string; lastName: string }
  doctor: { firstName: string; lastName: string } | null
  service: { name: string }
  clinic: { name: string; timezone: string }
}

export async function createCalendarEvent(
  connection: GoogleCalendarConnection,
  appointment: AppointmentForEvent,
): Promise<string> {
  const client = buildOAuthClient()
  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiresAt.getTime(),
  })

  // Persist refreshed tokens automatically when googleapis renews them
  client.on('tokens', (tokens) => {
    const update: Parameters<typeof prisma.googleCalendarConnection.update>[0]['data'] = {}
    if (tokens.access_token) update.accessToken = tokens.access_token
    if (tokens.expiry_date) update.tokenExpiresAt = new Date(tokens.expiry_date)
    if (Object.keys(update).length > 0) {
      prisma.googleCalendarConnection
        .update({ where: { clinicId: connection.clinicId }, data: update })
        .catch((err: Error) =>
          console.warn('[google-calendar] Failed to persist refreshed tokens:', err.message),
        )
    }
  })

  const calendar = google.calendar({ version: 'v3', auth: client })

  const startTime = appointment.scheduledAt
  const endTime = new Date(startTime.getTime() + appointment.durationMinutes * 60_000)
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`
  const doctorName = appointment.doctor
    ? `${appointment.doctor.firstName} ${appointment.doctor.lastName}`
    : 'Unassigned'
  const timezone = appointment.clinic.timezone || 'UTC'

  const response = await calendar.events.insert({
    calendarId: connection.calendarId,
    requestBody: {
      summary: `${patientName} — ${appointment.service.name}`,
      description: `Doctor: ${doctorName}\nClinic: ${appointment.clinic.name}\nAppointment ID: ${appointment.id}`,
      start: { dateTime: startTime.toISOString(), timeZone: timezone },
      end: { dateTime: endTime.toISOString(), timeZone: timezone },
    },
  })

  const eventId = response.data.id
  if (!eventId) throw new Error('Google Calendar returned no event ID')
  return eventId
}
