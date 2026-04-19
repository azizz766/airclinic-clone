import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { sendStaffBookingNotification } from '@/lib/notifications/staff-whatsapp'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { clinicName, contactName, email, volume } = body

    await sendStaffBookingNotification({
      patientName: contactName,
      serviceName: `Demo - ${clinicName}`,
      scheduledAt: new Date(),
      phone: email || 'N/A',
    })

    const emailResult = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'fantokhai@gmail.com',
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
      console.error('[book-demo] resend error:', emailResult.error)
    } else {
      console.log('[book-demo] email sent:', emailResult.data)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[book-demo] error:', err)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}