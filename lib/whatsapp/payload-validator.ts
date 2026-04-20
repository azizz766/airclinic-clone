import { z } from 'zod'

export const ReceptionPayloadSchema = z.object({
  action: z.enum([
    'ask_for_service',
    'ask_for_branch',
    'ask_for_doctor',
    'ask_for_date',
    'ask_for_time',
    'ask_for_name',
    'ask_for_phone',
    'show_slots',
    'confirm_details',
    'confirm_booking',
    'booking_failed',
    'reschedule_prompt',
    'cancellation_confirm',
    'escalation_human',
    'outside_working_hours',
    'generic_reply',
  ]),
  context: z.object({
    patientName: z.string().optional(),
    serviceName: z.string().optional(),
    branchName: z.string().optional(),
    doctorName: z.string().optional(),
    dateLabel: z.string().optional(),
    timeLabel: z.string().optional(),
    slotsText: z.string().optional(),
    summaryText: z.string().optional(),
    failureReason: z.string().optional(),
    customText: z.string().optional(),
  }),
})

export function validatePayload(input: unknown) {
  return ReceptionPayloadSchema.safeParse(input)
}