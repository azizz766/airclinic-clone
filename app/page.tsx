// Velora AI Landing Page — app/page.tsx
// High-conversion SaaS landing for clinics — Tailwind CSS only

import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Velora AI — WhatsApp AI Receptionist",
  description: "Turn WhatsApp into a 24/7 booking machine for your clinic.",
};

type SectionProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
  bg?: boolean;
  alt?: boolean;
};
function Section({ children, className = "", id, bg = false, alt = false }: SectionProps) {
  let bgClass = "";
  if (alt) bgClass = "bg-[#0d1421]";
  else if (bg) bgClass = "bg-[#0d1117]";
  return (
    <section
      id={id}
      className={`w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20 ${bgClass} ${className}`}
    >
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // Card: dark bg, border, consistent with section
  return (
    <div className={`rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl p-6 md:p-8 ${className}`}>
      {children}
    </div>
  );
}

function Navbar() {
  return (
    <nav className="sticky top-0 z-30 w-full bg-neutral-950/90 border-b border-neutral-800 backdrop-blur flex items-center justify-between px-4 md:px-10 h-16">
      <div className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
        <span className="text-green-400">Velora</span>
        <span className="text-white">AI</span>
      </div>
      <a href="#demo" className="px-5 py-2 rounded-full bg-green-500 hover:bg-green-400 text-neutral-950 font-semibold shadow transition text-sm">Book a Demo</a>
    </nav>
  );
}

function WhatsAppMockup({ large = false }: { large?: boolean }) {
  // Realistic WhatsApp mockup
  const phone = large
    ? "w-[370px] h-[600px]"
    : "w-[260px] h-[420px]";
  return (
    <div
      className={`rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col ${phone}`}
      style={{ boxShadow: "0 8px 32px 0 rgba(0,0,0,0.35)" }}
    >
      {/* WhatsApp header bar */}
      <div className="bg-[#005c4b] px-4 py-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-green-300" />
        <div className="flex flex-col">
          <span className="text-white font-semibold leading-tight text-sm">Velora AI 🤖</span>
          <span className="text-green-200 text-xs leading-tight">online</span>
        </div>
      </div>
      {/* Chat area */}
      <div className="flex-1 flex flex-col justify-end bg-[#0b141a] px-3 py-4 gap-2">
        {/* User bubble */}
        <div className="max-w-[80%] self-start">
          <div className="bg-[#202c33] text-white rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
            أبغى أحجز تنظيف أسنان بكرة الصبح
          </div>
          <div className="text-[10px] text-zinc-400 mt-1 ml-1">09:01</div>
        </div>
        {/* AI bubble */}
        <div className="max-w-[80%] self-end ml-auto">
          <div className="bg-[#005c4b] text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
            أهلاً! 😊 عندنا المواعيد التالية:<br />
            1️⃣ الثلاثاء 9:00 ص<br />
            2️⃣ الثلاثاء 11:00 ص<br />
            3️⃣ الأربعاء 9:30 ص
          </div>
          <div className="text-[10px] text-zinc-400 mt-1 ml-1">09:01</div>
        </div>
        {/* User bubble */}
        <div className="max-w-[80%] self-start">
          <div className="bg-[#202c33] text-white rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
            1
          </div>
          <div className="text-[10px] text-zinc-400 mt-1 ml-1">09:02</div>
        </div>
        {/* AI bubble */}
        <div className="max-w-[80%] self-end ml-auto">
          <div className="bg-[#005c4b] text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
            ✅ تم الحجز!<br />الخدمة: تنظيف أسنان<br />الموعد: الثلاثاء 9:00 صباحاً
          </div>
          <div className="text-[10px] text-zinc-400 mt-1 ml-1">09:02</div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppMockupLarge() {
  // For the "See it in Action" section
  const phone = "w-[420px] h-[700px]";
  const frame = `rounded-[2.5rem] bg-neutral-900 border-2 border-neutral-800 shadow-2xl p-6 flex flex-col justify-end ${phone}`;
  const bubble = "px-5 py-3 rounded-2xl text-base max-w-[80%]";
  const ai = `self-end bg-gradient-to-br from-green-500/90 to-emerald-500/80 text-neutral-900 ${bubble}`;
  const user = `self-start bg-neutral-800 text-neutral-100 ${bubble}`;
  const time = "text-xs text-neutral-400 mt-1 ml-1";
  return (
    <div className={frame} style={{ boxShadow: "0 12px 48px 0 rgba(0,0,0,0.40)" }}>
      <div className="flex flex-col gap-3 w-full">
        <div className={user}>
          أبغى أحجز تنظيف أسنان بكرة الصبح
          <div className={time}>09:01</div>
        </div>
        <div className={ai}>
          أهلاً! 😊 عندنا المواعيد التالية:<br />
          1️⃣ الثلاثاء 9:00 ص<br />
          2️⃣ الثلاثاء 11:00 ص<br />
          3️⃣ الأربعاء 9:30 ص
          <div className={time}>09:01</div>
        </div>
        <div className={user}>
          1
          <div className={time}>09:02</div>
        </div>
        <div className={ai}>
          ✅ تم الحجز!<br />الخدمة: تنظيف أسنان<br />الموعد: الثلاثاء 9:00 صباحاً
          <div className={time}>09:02</div>
        </div>
      </div>
      <div className="mt-6 text-xs text-neutral-400 text-center">Powered by Velora AI</div>
    </div>
  );
}

export default function VeloraLanding() {
  return (
    <div className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 min-h-screen text-white font-sans">
      <Navbar />
      {/* Hero Section */}
      <Section className="pt-14 pb-14 md:pt-16 md:pb-16">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-12 md:gap-20">
          {/* Left: Headline & CTA */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 bg-clip-text text-transparent">
              Turn WhatsApp into a 24/7 Booking Machine
            </h1>
            <p className="text-lg md:text-2xl text-neutral-200 mb-8 max-w-xl">
              Velora AI automatically replies to patients, finds available slots, and confirms appointments
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-2 w-full md:w-auto justify-center md:justify-start">
              <a href="#demo" className="inline-block px-8 py-3 rounded-full bg-green-500 hover:bg-green-400 text-neutral-950 font-semibold shadow transition">Start Free Trial</a>
              <a href="#how" className="inline-block px-8 py-3 rounded-full border border-green-500 text-green-300 hover:bg-green-900/40 font-semibold shadow transition">See How It Works</a>
            </div>
            <div className="text-sm text-neutral-400 mt-4">
              No credit card required • Setup in under 24 hours
            </div>
          </div>
          {/* Right: WhatsApp Mockup */}
          <div className="flex-1 flex justify-center md:justify-end">
            <WhatsAppMockup />
          </div>
        </div>
      </Section>

      {/* See it in Action Section */}
      <Section className="pt-0 pb-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-12 md:gap-20">
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold mb-6">From message to confirmed booking — in seconds</h2>
            <p className="text-neutral-300 mb-8 max-w-xl">
              See how Velora AI guides your clients from inquiry to appointment with zero friction.
            </p>
          </div>
          <div className="flex-1 flex justify-center md:justify-end">
            <WhatsAppMockupLarge />
          </div>
        </div>
      </Section>

      {/* Stats Bar Section */}
      <Section className="mt-8">
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { label: "Avg. reply time", value: "<2 min" },
            { label: "Bookings automated", value: "1,200+" },
            { label: "WhatsApp messages handled", value: "30,000+" },
            { label: "Clinics onboarded", value: "15+" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <div className="text-3xl md:text-4xl font-extrabold text-green-400 mb-1">{stat.value}</div>
              <div className="text-zinc-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Problem Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">WhatsApp is where your clients book — and where your team gets overwhelmed.</h2>
        <p className="text-zinc-300 mb-6 max-w-2xl">
          Most clinics still handle WhatsApp manually. That means:
        </p>
        <div className="flex flex-wrap gap-3 mb-2 max-w-xl mx-auto">
          {[
            "Slow replies",
            "Missed inquiries",
            "Repeated questions",
            "Lost bookings",
            "Front desk overload",
          ].map((text) => (
            <span
              key={text}
              className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
            >
              {text}
            </span>
          ))}
        </div>
        <p className="text-zinc-500 mt-4">Your clients expect fast answers. Your team cannot stay online 24/7.</p>
      </Section>

      {/* Solution Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Velora AI handles the conversation for you.</h2>
        <p className="text-zinc-300 mb-6 max-w-2xl">
          Velora AI works like an AI receptionist inside your WhatsApp. It can:
        </p>
        <div className="flex flex-wrap gap-3 mb-2 max-w-xl mx-auto">
          {[
            "Reply instantly",
            "Understand booking intent",
            "Collect client details",
            "Show available slots",
            "Confirm appointments",
            "Escalate to staff when needed",
          ].map((text) => (
            <span
              key={text}
              className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
            >
              {text}
            </span>
          ))}
        </div>
        <p className="text-zinc-500 mt-4">It is fast, simple, and built to reduce friction in the booking journey.</p>
      </Section>

      {/* How It Works Section */}
      <Section id="how" className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-12 text-center text-white">How Velora works</h2>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 md:gap-4">
          {[
            {
              step: 1,
              title: "Patient Message",
              description: "Patient sends a message on WhatsApp",
            },
            {
              step: 2,
              title: "AI Processing",
              description: "Velora understands intent and checks availability",
            },
            {
              step: 3,
              title: "Smart Scheduling",
              description: "Best available slot is suggested instantly",
            },
            {
              step: 4,
              title: "Confirmation",
              description: "Appointment is confirmed and saved automatically",
            },
          ].map(({ step, title, description }, idx, arr) => (
            <React.Fragment key={step}>
              <div className="flex-1 flex flex-col items-center">
                <div className="relative flex flex-col items-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500 text-neutral-950 font-bold text-xl mb-2">{step}</div>
                  <div className="font-semibold text-lg mb-1 text-white">{title}</div>
                  <div className="text-zinc-300 text-base text-center mb-2">{description}</div>
                </div>
              </div>
              {idx < arr.length - 1 && (
                <div className="hidden md:block w-12 h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 rounded-full mx-2" />
              )}
            </React.Fragment>
          ))}
        </div>
      </Section>

      {/* Benefits Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white">Why clinics choose Velora AI</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <div className="text-2xl mb-3">🔔</div>
            <h3 className="font-semibold text-lg mb-2 text-white">Never miss a booking</h3>
            <p className="text-zinc-300 text-base">Capture every patient inquiry — even after working hours</p>
          </Card>
          <Card>
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="font-semibold text-lg mb-2 text-white">Reduce front desk workload</h3>
            <p className="text-zinc-300 text-base">Stop answering repetitive booking messages manually</p>
          </Card>
          <Card>
            <div className="text-2xl mb-3">📈</div>
            <h3 className="font-semibold text-lg mb-2 text-white">Increase confirmed appointments</h3>
            <p className="text-zinc-300 text-base">Convert more conversations into actual bookings</p>
          </Card>
          <Card>
            <div className="text-2xl mb-3">🌙</div>
            <h3 className="font-semibold text-lg mb-2 text-white">Available 24/7</h3>
            <p className="text-zinc-300 text-base">Patients can book anytime, even at night</p>
          </Card>
          <Card>
            <div className="text-2xl mb-3">🎯</div>
            <h3 className="font-semibold text-lg mb-2 text-white">Smart escalation</h3>
            <p className="text-zinc-300 text-base">Only involve staff when necessary</p>
          </Card>
        </div>
      </Section>

      {/* Use Cases Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Built for clinics now. Ready for every booking-based business next.</h2>
        <p className="text-zinc-300 mb-4 max-w-2xl">
          Velora AI is starting with:
        </p>
        <div className="flex flex-wrap gap-4 mb-4">
          {/* Dental clinics: live now */}
          <div className="flex flex-col items-start border border-green-500/50 bg-green-950/30 rounded-2xl p-4 min-w-[180px] max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-white">Dental clinics</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-900 border border-green-500/50 text-xs text-green-200 font-medium">Live now</span>
            </div>
            <span className="text-zinc-300 text-sm">Automated bookings, reminders, follow-ups</span>
          </div>
        </div>
        <p className="text-zinc-300 mt-4 mb-2">And expanding into:</p>
        <div className="flex flex-wrap gap-4">
          {/* Other use cases: coming soon */}
          {[
            "Beauty clinics",
            "Dermatology clinics",
            "Salons",
            "Wellness businesses",
            "Any business that books through WhatsApp",
          ].map((name) => (
            <div key={name} className="flex flex-col items-start border border-zinc-700 bg-zinc-900 rounded-2xl p-4 min-w-[180px] max-w-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-white">{name}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-500 font-medium">Coming soon</span>
              </div>
              <span className="text-zinc-300 text-sm">Automated bookings, reminders, follow-ups</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Credibility Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Designed for real booking workflows — not just chatbot demos</h2>
        <p className="text-zinc-300 mb-4 max-w-2xl">
          Velora AI is built around actual appointment flows:
        </p>
        <div className="flex flex-wrap gap-3 mb-2 max-w-xl mx-auto">
          {[
            "booking",
            "rescheduling",
            "confirmation",
            "human escalation",
            "structured client data collection",
          ].map((text) => (
            <span
              key={text}
              className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
            >
              {text}
            </span>
          ))}
        </div>
        <p className="text-zinc-500 mt-4">This is not a generic chatbot.<br/>It is an AI receptionist built for operational use.</p>
      </Section>

      {/* Final CTA Section */}
      <Section id="demo" className="relative mt-20 overflow-hidden" bg>
        {/* Subtle green radial gradient */}
        <div className="absolute inset-0 pointer-events-none" style={{background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34,197,94,0.10) 0%, #0d1117 100%)"}} />
        <div className="relative flex flex-col items-center justify-center py-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 text-center">Ready to automate your bookings?</h2>
          <p className="text-lg text-[#8b949e] mb-8 text-center max-w-2xl">Let Velora AI handle WhatsApp so your team can focus on care, not admin. See it in action or book a demo now.</p>
          <a href="#demo" className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#22c55e] hover:bg-green-400 text-black font-bold text-lg shadow transition">
            Book a Demo <span className="text-2xl">→</span>
          </a>
        </div>
      </Section>

      <footer className="text-center text-[#8b949e] text-sm py-8 mt-8">
        &copy; {new Date().getFullYear()} Velora AI. All rights reserved.
      </footer>
    </div>
  );
}
