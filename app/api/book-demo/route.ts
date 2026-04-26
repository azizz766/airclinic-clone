import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { sendStaffBookingNotification } from '@/lib/notifications/staff-whatsapp'
import { checkRateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

const trialSchema = z.object({
  clinicName: z.string().min(1, 'clinicName is required'),
  contactName: z.string().min(1, 'contactName is required'),
  phone: z.string().min(1, 'phone is required'),
  email: z.string().email('email must be a valid email address'),
  city: z.string().min(1, 'city is required'),
  locations: z.string().min(1, 'locations is required'),
  whatsappVolume: z.string().min(1, 'whatsappVolume is required'),
  bookingMethod: z.string().min(1, 'bookingMethod is required'),
  mainGoal: z.string().min(1, 'mainGoal is required'),
})

type Submission = z.infer<typeof trialSchema>

function logFailure(channel: 'whatsapp' | 'email', submission: Submission, error: unknown) {
  let serializedError: unknown
  if (error instanceof Error) {
    serializedError = { message: error.message, name: error.name, stack: error.stack }
  } else if (error !== null && typeof error === 'object') {
    const e = error as Record<string, unknown>
    serializedError = {
      message: e['message'],
      name: e['name'],
      statusCode: e['statusCode'],
      code: e['code'],
      body: e['body'] ?? e['response'],
    }
  } else {
    serializedError = String(error)
  }

  console.error(
    JSON.stringify({
      event: 'free-trial-notification-failure',
      channel,
      submission,
      error: serializedError,
      timestamp: new Date().toISOString(),
    }),
  )
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, errors: ['Too many requests — please try again later'] },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, errors: ['Invalid JSON body'] }, { status: 400 })
  }

  const parsed = trialSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errors: parsed.error.issues.map((e: z.ZodIssue) => e.message) },
      { status: 400 },
    )
  }

  const { clinicName, contactName, phone, email, city, locations, whatsappVolume, bookingMethod, mainGoal } = parsed.data
  const submission = parsed.data
  const warnings: string[] = []

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('demo_requests').insert([
    {
      clinic_name: clinicName,
      contact_name: contactName,
      work_email: email,
      monthly_patient_volume: whatsappVolume,
      metadata: { phone, city, locations, booking_method: bookingMethod, main_goal: mainGoal },
    },
  ])
  if (dbError) {
    console.error(JSON.stringify({ event: 'free-trial-db-insert-failure', error: dbError, timestamp: new Date().toISOString() }))
    return NextResponse.json({ success: false, errors: ['Failed to save your request. Please try again.'] }, { status: 500 })
  }

  try {
    await sendStaffBookingNotification({
      patientName: contactName,
      serviceName: `Free Trial - ${clinicName}`,
      scheduledAt: new Date(),
      phone,
    })
  } catch (err) {
    logFailure('whatsapp', submission, err)
    warnings.push('Staff WhatsApp notification failed')
  }

  try {
    const staffEmail = process.env.STAFF_EMAIL
    const emailFrom = process.env.EMAIL_FROM
    if (!staffEmail) {
      warnings.push('STAFF_EMAIL env var not set — email notification skipped')
    } else if (!emailFrom) {
      warnings.push('EMAIL_FROM env var not set — email notification skipped')
    } else {
      const emailResult = await resend.emails.send({
        from: emailFrom,
        to: staffEmail,
        subject: '🚀 New Free Trial Request',
        html: `
          <h2>New Free Trial Request</h2>
          <p><strong>Clinic:</strong> ${clinicName}</p>
          <p><strong>Contact:</strong> ${contactName}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>City:</strong> ${city}</p>
          <p><strong>Locations:</strong> ${locations}</p>
          <p><strong>Monthly WhatsApp Inquiries:</strong> ${whatsappVolume}</p>
          <p><strong>Current Booking Method:</strong> ${bookingMethod}</p>
          <p><strong>Main Goal:</strong> ${mainGoal}</p>
        `,
      })

      if (emailResult.error) {
        logFailure('email', submission, emailResult.error)
        warnings.push('Email notification failed')
      }
    }
  } catch (err) {
    logFailure('email', submission, err)
    warnings.push('Email notification failed unexpectedly')
  }

  const response: { success: boolean; warnings?: string[] } = { success: true }
  if (warnings.length > 0) response.warnings = warnings

  return NextResponse.json(response, { status: 200 })
}
