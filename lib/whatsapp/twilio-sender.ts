import twilio from 'twilio'

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

export async function sendWhatsAppReply(
  to: string,
  from: string,
  body: string,
): Promise<string> {
  const msg = await twilioClient.messages.create({
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    body,
  })
  return msg.sid
}
