/**
 * app/api/whatsapp/webhook-v2/route.ts
 *
 * WhatsApp FSM Webhook — Production Entry Point
 *
 * Dispatch is STATE-driven, not intent-driven.
 * AI intent detection feeds INTO the FSM — it never replaces it.
 *
 * Every message produces exactly one of:
 *   ✅ Confirmed booking (persisted to DB)
 *   ✅ Clean escalation (staff notified, user informed)
 *   ✅ Continued flow (next FSM step prompted)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/lib/prisma-client/client'
import { resolveSession, transitionSession, persistMessage } from '@/lib/whatsapp/session'
import {
	runAiInterpretationPipeline,
	type AiInterpretation,
	type AiDecisionRecord,
} from '@/lib/whatsapp/ai-interpretation-pipeline'
import {
	processBooking,
	SlotConflictError,
	BookingValidationError,
} from '@/lib/whatsapp/booking-handler'
import { ConversationState } from '@/lib/prisma-client/enums'
import twilio from 'twilio'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Session = Awaited<ReturnType<typeof resolveSession>>

type HandlerContext = {
	session: Session
	clinicId: string
	from: string         // patient WhatsApp number  e.g. "+966XXXXXXXXX"
	clinicNumber: string // clinic Twilio number      e.g. "+9660XXXXXXXX"
	body: string         // raw user message text
	messageSid: string
	interpretation: AiInterpretation
}

type HandlerResult = {
	reply: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Twilio — Client & Sender
// ─────────────────────────────────────────────────────────────────────────────

const twilioClient = twilio(
	process.env.TWILIO_ACCOUNT_SID!,
	process.env.TWILIO_AUTH_TOKEN!,
)

async function sendWhatsAppReply(
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

// ─────────────────────────────────────────────────────────────────────────────
// Input Parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse Arabic-Indic digits, Arabic ordinal words, and Latin digits
 * into a 1-based integer. Returns null on failure.
 */
function parseSelection(text: string): number | null {
	const t = text.trim()

	// Latin digits: "1", "2", ...
	const latin = parseInt(t, 10)
	if (!isNaN(latin) && String(latin) === t && latin > 0) return latin

	// Arabic-Indic digits: ١, ٢, ...
	const normalized = t.replace(/[٠-٩]/g, (d) =>
		String(d.charCodeAt(0) - 0x0660),
	)
	const fromIndic = parseInt(normalized, 10)
	if (!isNaN(fromIndic) && fromIndic > 0) return fromIndic

	// Arabic ordinal words
	const ordinals: Record<string, number> = {
		'الأول': 1, 'الاول': 1, 'أول': 1, 'اول': 1, 'الأولى': 1, 'الاولى': 1, 'واحد': 1,
		'الثاني': 2, 'الثانية': 2, 'ثاني': 2, 'ثانية': 2, 'اثنين': 2, 'اثنان': 2,
		'الثالث': 3, 'الثالثة': 3, 'ثالث': 3, 'ثلاثة': 3,
		'الرابع': 4, 'الرابعة': 4, 'رابع': 4, 'أربعة': 4,
		'الخامس': 5, 'الخامسة': 5, 'خامس': 5, 'خمسة': 5,
	}
	return ordinals[t] ?? null
}

function isAffirmative(text: string): boolean {
	const t = text.trim()
	return [
		'نعم', 'اي', 'آي', 'أي', 'ايوا', 'ايوه', 'ايه', 'أيه',
		'تمام', 'صح', 'صحيح', 'اكيد', 'أكيد', 'بالتأكيد',
		'موافق', 'موافقة', 'احجز', 'أحجز', 'تأكيد', 'تاكيد',
		'yes', 'y', 'ok', 'okay', 'yep', '1',
	].some((a) => t === a || t.toLowerCase().includes(a))
}

function isNegative(text: string): boolean {
	const t = text.trim()
	return [
		'لا', 'لأ', 'لأه', 'لاه', 'كلا',
		'مو', 'مب', 'ما ابي', 'ما أبي',
		'no', 'n', 'نو', 'الغ',
	].some((n) => t === n || t.toLowerCase().startsWith(n))
}

function isEscalationRequest(text: string): boolean {
	const t = text.trim()
	return [
		'ابي احد يكلمني', 'أبي أحد يكلمني', 'ابغى احد يكلمني',
		'وصلني لموظف', 'وصلني موظف', 'كلمني موظف',
		'تكلم موظف', 'اريد موظف', 'أريد موظف',
		'human', 'agent', 'موظف بشري',
	].some((trigger) => t.includes(trigger))
}

function parseDateInput(raw: string): Date | null {
	const t = raw.trim()

	// DD/MM/YYYY or DD-MM-YYYY
	const dmy = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
	if (dmy) {
		const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
		if (!isNaN(d.getTime())) return d
	}

	// YYYY-MM-DD or YYYY/MM/DD
	const ymd = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
	if (ymd) {
		const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
		if (!isNaN(d.getTime())) return d
	}

	return null
}
// ...rest of file omitted for brevity (full content will be written in actual operation) ...

