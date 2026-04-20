import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/prisma-client/client'

export type DropReason =
  | 'no_slots'
  | 'user_dropped'
  | 'vague_repeated'
  | 'inquiry_only'
  | 'tool_failure'
  | 'other'

type SessionForLead = {
  id: string
  clinicId: string
  phoneNumber: string
  slotPatientName: string | null
  slotServiceId: string | null
  slotDate: Date | null
}

/**
 * Persists an unconverted session as a lead for staff follow-up.
 * Idempotent — sessionId has a DB-level unique constraint.
 * Duplicate calls silently no-op. Never throws.
 */
export async function saveLead(
  session: SessionForLead,
  dropReason: DropReason,
): Promise<void> {
  try {
    await prisma.lead.create({
      data: {
        clinicId: session.clinicId,
        patientPhone: session.phoneNumber,
        patientName: session.slotPatientName ?? null,
        serviceInterest: session.slotServiceId ?? null,
        datePreference: session.slotDate?.toISOString() ?? null,
        dropReason,
        sessionId: session.id,
      },
    })
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Unique constraint violation — lead already exists for this session. No-op.
      return
    }
    console.error('[lead-handler] saveLead failed', {
      sessionId: session.id,
      clinicId: session.clinicId,
      dropReason,
      error: err,
    })
  }
}
