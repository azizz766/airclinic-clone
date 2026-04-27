import { prisma } from '@/lib/prisma'
import { createCalendarEvent, updateCalendarEvent } from './calendar'

type AppointmentForSync = {
  id: string
  scheduledAt: Date
  durationMinutes: number
  patient: { firstName: string; lastName: string }
  doctor: { firstName: string; lastName: string } | null
  service: { name: string }
  clinic: { name: string; timezone: string }
}

export async function syncCreateEventForAppointment(
  clinicId: string,
  appointment: AppointmentForSync,
): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { clinicId },
  })

  if (!connection) return

  console.info('[google-calendar/sync] Creating event', { clinicId, appointmentId: appointment.id })

  try {
    const eventId = await createCalendarEvent(connection, appointment)
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { calendarEventId: eventId },
    })
    console.log('[google-calendar/sync] Event created:', { appointmentId: appointment.id, eventId })
  } catch (err) {
    console.error('[google-calendar/sync] Event creation failed:', {
      appointmentId: appointment.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function syncCreateEvent(clinicId: string, appointmentId: string): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { clinicId },
  })

  if (!connection) return

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
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

  console.info('[google-calendar/sync] Creating event', { clinicId, appointmentId })

  try {
    const eventId = await createCalendarEvent(connection, appointment)
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { calendarEventId: eventId },
    })
    console.log('[google-calendar/sync] Event created:', { appointmentId, eventId })
  } catch (err) {
    console.error('[google-calendar/sync] Event creation failed:', {
      appointmentId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function syncUpdateEventForAppointment(
  clinicId: string,
  appointment: AppointmentForSync & { calendarEventId: string | null },
): Promise<void> {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { clinicId },
  })

  if (!connection) return

  console.info('[google-calendar/sync] Updating event', { clinicId, appointmentId: appointment.id })

  try {
    if (appointment.calendarEventId) {
      await updateCalendarEvent(connection, appointment.calendarEventId, appointment)
      console.log('[google-calendar/sync] Event updated:', {
        appointmentId: appointment.id,
        eventId: appointment.calendarEventId,
      })
    } else {
      const eventId = await createCalendarEvent(connection, appointment)
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { calendarEventId: eventId },
      })
      console.log('[google-calendar/sync] Event created (no prior ID):', {
        appointmentId: appointment.id,
        eventId,
      })
    }
  } catch (err) {
    console.error('[google-calendar/sync] Reschedule calendar sync failed', {
      appointmentId: appointment.id,
      clinicId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
