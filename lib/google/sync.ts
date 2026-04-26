import { prisma } from '@/lib/prisma'
import { createCalendarEvent } from './calendar'

export async function syncCreateEvent(clinicId: string, appointmentId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { clinicId },
  })

  if (!connection) return

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { firstName: true, lastName: true } },
      service: { select: { name: true } },
      clinic: { select: { name: true, timezone: true } },
    },
  })

  if (!appointment) {
    console.warn('[google-calendar/sync] Appointment not found:', appointmentId)
    return
  }

  try {
    const eventId = await createCalendarEvent(connection, appointment)
    console.log('[google-calendar/sync] Event created:', { appointmentId, eventId })
  } catch (err) {
    console.warn('[google-calendar/sync] Event creation failed (non-critical):', {
      appointmentId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
