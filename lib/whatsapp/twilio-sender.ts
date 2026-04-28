import twilio from 'twilio'

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

export function normalizeDigitsToEnglish(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
              .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
}

export async function sendWhatsAppReply(
  to: string,
  from: string,
  body: string,
): Promise<string> {
  const msg = await twilioClient.messages.create({
    from: `whatsapp:${from}`,
    to: `whatsapp:${to}`,
    body: normalizeDigitsToEnglish(body),
  })
  return msg.sid
}
