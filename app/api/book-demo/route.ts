import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { sendStaffBookingNotification } from '@/lib/notifications/staff-whatsapp'
import { checkRateLimit } from '@/lib/rate-limit'

const resend = new Resend(process.env.RESEND_API_KEY)

const bookDemoSchema = z.object({
  clinicName: z.string().min(1, 'clinicName is required'),
  contactName: z.string().min(1, 'contactName is required'),
  email: z.string().email('email must be a valid email address'),
  volume: z.string().min(1, 'volume is required'),
})

function logFailure(
  channel: 'whatsapp' | 'email',
  submission: { clinicName: string; contactName: string; email: string; volume: string },
  error: unknown,
) {
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
      event: 'book-demo-notification-failure',
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
    return NextResponse.json(
      { success: false, errors: ['Invalid JSON body'] },
      { status: 400 }
    )
  }

  const parsed = bookDemoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errors: parsed.error.issues.map((e: z.ZodIssue) => e.message) },
      { status: 400 }
    )
  }

  const { clinicName, contactName, email, volume } = parsed.data
  const submission = { clinicName, contactName, email, volume }
  const warnings: string[] = []

  try {
    await sendStaffBookingNotification({
      patientName: contactName,
      serviceName: `Demo - ${clinicName}`,
      scheduledAt: new Date(),
      phone: email,
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
        subject: '🚀 New Demo Request',
        html: `
          <h2>New Demo Request</h2>
          <p><strong>Clinic:</strong> ${clinicName}</p>
          <p><strong>Name:</strong> ${contactName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Volume:</strong> ${volume}</p>
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
