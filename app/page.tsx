'use client'
// Velora AI Landing Page — app/page.tsx
// Premium SaaS — Linear/Stripe style + Framer Motion animations

import React, { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

// ─── Shared Layout ────────────────────────────────────────────────────────────

function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`max-w-6xl mx-auto px-6 ${className}`}>{children}</div>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  )
}

// ─── Scroll Reveal ────────────────────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="max-w-[75%]">
      <div className="bg-white rounded-xl rounded-tl-none px-4 py-3 shadow-sm inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-gray-400"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Animated WhatsApp Mockup ─────────────────────────────────────────────────

type ChatEntry =
  | { kind: 'msg'; id: number; role: 'user' | 'ai'; content: React.ReactNode; ts: string }
  | { kind: 'typing'; id: number }

const SCHEDULE: { at: number; entry: ChatEntry }[] = [
  {
    at: 500,
    entry: {
      kind: 'msg',
      id: 1,
      role: 'user',
      content: 'I want to book a teeth cleaning tomorrow morning',
      ts: '9:01 AM',
    },
  },
  { at: 1500, entry: { kind: 'typing', id: 98 } },
  {
    at: 2700,
    entry: {
      kind: 'msg',
      id: 2,
      role: 'ai',
      content: (
        <>
          Hi there 👋<br />
          Here are the available slots:<br />
          1️⃣ Tuesday 9:00 AM<br />
          2️⃣ Tuesday 11:00 AM<br />
          3️⃣ Wednesday 9:30 AM
        </>
      ),
      ts: '9:01 AM',
    },
  },
  {
    at: 3500,
    entry: { kind: 'msg', id: 3, role: 'user', content: '1', ts: '9:02 AM' },
  },
  { at: 4500, entry: { kind: 'typing', id: 99 } },
  {
    at: 5500,
    entry: {
      kind: 'msg',
      id: 4,
      role: 'ai',
      content: (
        <>
          ✅ Booking confirmed<br />
          Service: Teeth cleaning<br />
          Time: Tuesday 9:00 AM
        </>
      ),
      ts: '9:02 AM',
    },
  },
]

function AnimatedWhatsAppMockup() {
  const [entries, setEntries] = useState<ChatEntry[]>([])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    SCHEDULE.forEach(({ at, entry }, idx) => {
      timers.push(
        setTimeout(() => {
          setEntries((prev) => {
            // Remove typing indicator when a real message follows
            const next = prev.filter((e) => e.kind !== 'typing')
            return [...next, entry]
          })

          // Auto-remove typing indicator after 1.2 s
          if (entry.kind === 'typing') {
            timers.push(
              setTimeout(() => {
                setEntries((prev) => prev.filter((e) => e.kind !== 'typing' || e.id !== entry.id))
              }, 1200)
            )
          }
        }, at)
      )
    })

    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="max-w-md w-full rounded-2xl overflow-hidden shadow-lg border border-[#E5E7EB]">
      {/* Header */}
      <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          V
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">Velora AI</p>
          <p className="text-[#B2DFDB] text-xs leading-tight">online</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="bg-[#EFEAE2] p-5 flex flex-col min-h-[400px]">
        {entries.map((entry) => {
          if (entry.kind === 'typing') {
            return (
              <motion.div
                key={`typing-${entry.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="mb-2"
              >
                <TypingDots />
              </motion.div>
            )
          }

          const isUser = entry.role === 'user'
          const bubbleSpace =
            entry.id === 1 ? 'mb-2' : entry.id === 2 ? 'mb-4' : entry.id === 3 ? 'mb-2' : ''

          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={`${isUser ? 'max-w-[75%]' : 'max-w-[80%] ml-auto'} ${bubbleSpace}`}
            >
              <div
                className={`${
                  isUser
                    ? 'bg-white rounded-xl rounded-tl-none'
                    : 'bg-[#DCF8C6] rounded-xl rounded-tr-none'
                } px-3 py-2 shadow-sm`}
              >
                <p className="text-[#0F172A] text-[14px]">{entry.content}</p>
                {isUser ? (
                  <p className="text-[10px] text-gray-400 opacity-70 mt-0.5 text-right">{entry.ts}</p>
                ) : (
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[10px] text-gray-400 opacity-70">{entry.ts}</span>
                    <span className="text-[10px] text-[#25D366]">✓✓</span>
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="sticky top-0 z-30 w-full bg-white border-b border-[#E5E7EB]">
      <Container className="flex items-center justify-between h-16">
        <div className="flex items-center gap-0.5 font-bold text-xl tracking-tight select-none">
          <span className="text-[#0F172A]">Velora</span>
          <span className="text-[#6D5DFC]">AI</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-[#6B7280]">
          <a href="#how" className="hover:text-[#0F172A] transition-colors">How it works</a>
          <a href="#benefits" className="hover:text-[#0F172A] transition-colors">Benefits</a>
          <a href="#demo" className="hover:text-[#0F172A] transition-colors">Pricing</a>
        </div>

        <motion.a
          href="#demo"
          className="bg-[#6D5DFC] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#5a4de0] transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15 }}
        >
          Book a Demo
        </motion.a>
      </Container>
    </nav>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VeloraLanding() {
  return (
    <div className="bg-[#F5F6F8] min-h-screen text-[#0F172A] font-sans">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <Container className="py-24 md:py-28">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-14 md:gap-20">
            {/* Left */}
            <FadeIn className="flex-1 flex flex-col items-start">
              <span className="inline-block bg-[#E9E5FF] text-[#6D5DFC] text-sm font-semibold rounded-full px-3 py-1 mb-6">
                WhatsApp AI Receptionist
              </span>
              <h1 className="text-4xl md:text-5xl font-bold text-[#0F172A] leading-[1.08] mb-5">
                Turn WhatsApp into a 24/7 Booking Machine
              </h1>
              <p className="text-lg text-[#6B7280] leading-relaxed mb-8 max-w-lg">
                Velora AI automatically replies to patients, finds available slots, and confirms appointments — so your team can focus on care.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <motion.a
                  href="#demo"
                  className="bg-[#6D5DFC] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#5a4de0] transition-colors text-sm text-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  Start Free Trial
                </motion.a>
                <motion.a
                  href="#how"
                  className="border border-[#E5E7EB] text-[#0F172A] font-semibold px-6 py-3 rounded-lg hover:bg-[#F5F6F8] transition-colors text-sm text-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  See How It Works
                </motion.a>
              </div>
              <p className="text-sm text-[#6B7280]">No credit card required · Setup in under 24 hours</p>
              {/* Trust avatars */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <div style={{ display: 'flex' }}>
                  {['#6D5DFC', '#25D366', '#0F172A'].map((c, i) => (
                    <div
                      key={i}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: c,
                        border: '2px solid #fff',
                        marginLeft: i > 0 ? -8 : 0,
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 13, color: '#6B7280' }}>
                  Trusted by 120+ clinics · 10,000+ bookings handled
                </span>
              </div>
            </FadeIn>

            {/* Right */}
            <FadeIn delay={0.15} className="flex-1 flex justify-center md:justify-end">
              <AnimatedWhatsAppMockup />
            </FadeIn>
          </div>
        </Container>
      </section>

      {/* ── Stats Row ────────────────────────────────────────────────────── */}
      <section className="bg-white border-y border-[#E5E7EB]">
        <Container className="py-12">
          <FadeIn>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: '24/7', label: 'Booking availability' },
                { value: '< 3 sec', label: 'Average response time' },
                { value: '+30%', label: 'More confirmed bookings' },
                { value: '0 missed', label: 'Patient inquiries' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-3xl font-bold text-[#0F172A] mb-1">{stat.value}</p>
                  <p className="text-sm text-[#6B7280]">{stat.label}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </Container>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────────── */}
      <section className="bg-[#F5F6F8]">
        <Container className="py-16">
          <FadeIn>
            <SectionLabel>The Problem</SectionLabel>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4 max-w-2xl">
              WhatsApp is where your clients book — and where your team gets overwhelmed.
            </h2>
            <p className="text-[#6B7280] mb-6 max-w-xl">
              Most clinics still handle WhatsApp manually. That means:
            </p>
            <div className="flex flex-wrap gap-3 mb-5">
              {['Slow replies', 'Missed inquiries', 'Repeated questions', 'Lost bookings', 'Front desk overload'].map(
                (text) => (
                  <span
                    key={text}
                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-[#E5E7EB] text-sm text-[#6B7280] shadow-sm"
                  >
                    {text}
                  </span>
                )
              )}
            </div>
            <p className="text-sm text-gray-400">
              Your clients expect fast answers. Your team cannot stay online 24/7.
            </p>
          </FadeIn>
        </Container>
      </section>

      {/* ── Solution ─────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <Container className="py-24">
          <FadeIn>
            <SectionLabel>The Solution</SectionLabel>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4 max-w-2xl">
              Velora AI handles the conversation for you.
            </h2>
            <p className="text-[#6B7280] mb-6 max-w-xl">
              Velora AI works like an AI receptionist inside your WhatsApp. It can:
            </p>
            <div className="flex flex-wrap gap-3 mb-5">
              {[
                'Reply instantly',
                'Understand booking intent',
                'Collect client details',
                'Show available slots',
                'Confirm appointments',
                'Escalate to staff when needed',
              ].map((text) => (
                <span
                  key={text}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#F5F6F8] border border-[#E5E7EB] text-sm text-[#6B7280] shadow-sm"
                >
                  {text}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-400">
              It is fast, simple, and built to reduce friction in the booking journey.
            </p>
          </FadeIn>
        </Container>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section id="how" className="bg-white border-t border-[#E5E7EB]">
        <Container className="py-28">
          <FadeIn>
            <div className="text-center mb-12">
              <SectionLabel>Process</SectionLabel>
              <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A]">How Velora works</h2>
            </div>
          </FadeIn>
          <div className="flex flex-col md:flex-row md:items-stretch gap-4 md:gap-2">
            {[
              { step: 1, title: 'Patient Message', desc: 'Patient sends a WhatsApp message' },
              { step: 2, title: 'AI Processing', desc: 'Velora understands intent and checks availability' },
              { step: 3, title: 'Smart Scheduling', desc: 'Best available slot is suggested instantly' },
              { step: 4, title: 'Confirmation', desc: 'Appointment confirmed and saved automatically' },
            ].map(({ step, title, desc }, idx, arr) => (
              <React.Fragment key={step}>
                <FadeIn delay={idx * 0.1} className="flex-1">
                  <motion.div
                    className="h-full bg-white rounded-xl border border-[#E5E7EB] p-7 flex flex-col items-center text-center shadow-sm"
                    whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#0F172A] text-white text-sm font-bold flex items-center justify-center mb-4 flex-shrink-0">
                      {step}
                    </div>
                    <p className="font-semibold text-[#0F172A] mb-1 text-sm">{title}</p>
                    <p className="text-xs text-[#6B7280]">{desc}</p>
                  </motion.div>
                </FadeIn>
                {idx < arr.length - 1 && (
                  <div className="hidden md:flex items-center text-gray-300 text-xl px-1 flex-shrink-0">→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────────────── */}
      <section id="benefits" className="bg-[#F5F6F8]">
        <Container className="py-24">
          <FadeIn>
            <SectionLabel>Benefits</SectionLabel>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-10">
              Why clinics choose Velora AI
            </h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { emoji: '🔔', title: 'Never miss a booking', desc: 'Capture every patient inquiry — even after working hours' },
              { emoji: '⚡', title: 'Reduce front desk workload', desc: 'Stop answering repetitive booking messages manually' },
              { emoji: '📈', title: 'Increase confirmed appointments', desc: 'Convert more conversations into actual bookings' },
              { emoji: '🌙', title: 'Available 24/7', desc: 'Patients can book anytime, even at night' },
              { emoji: '🎯', title: 'Smart escalation', desc: 'Only involve staff when necessary' },
              { emoji: '💬', title: 'WhatsApp native', desc: 'No app downloads — works right inside WhatsApp' },
            ].map(({ emoji, title, desc }, index) => (
              <FadeIn key={title} delay={index * 0.08}>
                <motion.div
                  className="bg-white rounded-xl border border-[#E5E7EB] p-7 flex flex-col gap-2 h-full"
                  whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-2xl">{emoji}</div>
                  <p className="font-semibold text-[#0F172A] text-sm">{title}</p>
                  <p className="text-sm text-[#6B7280]">{desc}</p>
                </motion.div>
              </FadeIn>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Use Cases ────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <Container className="py-16">
          <FadeIn>
            <SectionLabel>Use Cases</SectionLabel>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-3 max-w-2xl">
              Built for clinics now. Ready for every booking-based business next.
            </h2>
            <p className="text-[#6B7280] mb-10 max-w-xl">
              Velora AI is starting with dental clinics and expanding fast.
            </p>

            {/* Live now */}
            <motion.div
              className="border-2 border-[#6D5DFC] bg-[#F8F7FF] rounded-xl p-6 flex items-center justify-between mb-6 max-w-sm"
              whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
              transition={{ duration: 0.2 }}
            >
              <div>
                <p className="font-semibold text-[#0F172A] text-base mb-1">🦷 Dental Clinics</p>
                <p className="text-sm text-[#6B7280]">Automated bookings, reminders, follow-ups</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#6D5DFC] text-white text-xs font-semibold flex-shrink-0 ml-4">
                Live now
              </span>
            </motion.div>

            <p className="text-[#6B7280] text-sm mb-5">And expanding into:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {[
                { emoji: '🔬', name: 'Dermatology Clinics' },
                { emoji: '💆', name: 'Aesthetic Clinics' },
                { emoji: '🏥', name: 'Medical Centers' },
                { emoji: '📅', name: 'Any booking business' },
              ].map(({ emoji, name }) => (
                <motion.div
                  key={name}
                  className="bg-white border border-[#E5E7EB] rounded-xl p-5"
                  whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="font-semibold text-[#0F172A] text-sm mb-2">
                    {emoji} {name}
                  </p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-400 font-medium">
                    Coming soon
                  </span>
                </motion.div>
              ))}
            </div>
          </FadeIn>
        </Container>
      </section>

      {/* ── Credibility ──────────────────────────────────────────────────── */}
      <section className="bg-[#F5F6F8]">
        <Container className="py-24">
          <FadeIn>
            <SectionLabel>Built Different</SectionLabel>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4 max-w-2xl">
              Designed for real booking workflows — not just chatbot demos
            </h2>
            <p className="text-[#6B7280] mb-6 max-w-xl">
              Velora AI is built around actual appointment flows:
            </p>
            <div className="flex flex-wrap gap-3 mb-5">
              {[
                'booking',
                'rescheduling',
                'confirmation',
                'human escalation',
                'structured client data collection',
              ].map((text) => (
                <span
                  key={text}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-[#E5E7EB] text-sm text-[#6B7280] shadow-sm"
                >
                  {text}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-400">
              This is not a generic chatbot.<br />
              It is an AI receptionist built for operational use.
            </p>
          </FadeIn>
        </Container>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section id="demo" className="bg-[#F5F6F8] px-4 my-8">
        <FadeIn>
          <div className="max-w-5xl mx-auto bg-[#0F172A] rounded-2xl p-16 md:p-20 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6D5DFC] mb-4">Get Started</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to automate your bookings?
            </h2>
            <p className="text-[#6B7280] mb-10 max-w-lg mx-auto">
              Let Velora AI handle WhatsApp so your team can focus on care, not admin. See it in action or book a demo now.
            </p>
            <motion.a
              href="#demo"
              className="inline-block bg-white text-[#0F172A] font-bold px-9 py-4 rounded-xl hover:bg-gray-100 transition-colors text-sm"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              Book a Demo →
            </motion.a>
          </div>
        </FadeIn>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-[#E5E7EB] py-8 text-center text-sm text-[#6B7280]">
        &copy; 2026 Velora AI. All rights reserved.
      </footer>
    </div>
  )
}
