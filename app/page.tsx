// Velora AI Landing Page — app/page.tsx
// High-conversion SaaS landing for clinics — Tailwind CSS only

import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Velora AI — WhatsApp AI Receptionist",
  description: "Turn WhatsApp into a 24/7 booking machine for your clinic.",
};

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-28 ${className}`}>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-neutral-900/80 border border-neutral-800 shadow-xl p-6 md:p-8 ${className}`}>
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
  // Conversation bubbles
  const base = "flex flex-col gap-2 w-full";
  const phone = large
    ? "w-[370px] h-[600px]"
    : "w-[260px] h-[420px]";
  const frame = `rounded-[2.5rem] bg-neutral-900 border-2 border-neutral-800 shadow-2xl p-4 flex flex-col justify-end ${phone}`;
  const bubble = "px-4 py-2 rounded-2xl text-sm max-w-[80%]";
  const ai = `self-end bg-gradient-to-br from-green-500/90 to-emerald-500/80 text-neutral-900 ${bubble}`;
  const user = `self-start bg-neutral-800 text-neutral-100 ${bubble}`;
  const time = "text-xs text-neutral-400 mt-1 ml-1";
  return (
    <div className={frame} style={{ boxShadow: "0 8px 32px 0 rgba(0,0,0,0.35)" }}>
      <div className={base}>
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
      <Section className="pt-24 pb-16 md:pt-32 md:pb-24">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-12 md:gap-20">
          {/* Left: Headline & CTA */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 bg-clip-text text-transparent">
              Turn Your WhatsApp Into a 24/7 Booking Machine
            </h1>
            <p className="text-lg md:text-2xl text-neutral-200 mb-8 max-w-xl">
              Velora AI replies, qualifies, books, and follows up automatically — so your clinic saves time and captures more appointments.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-2 w-full md:w-auto justify-center md:justify-start">
              <a href="#demo" className="inline-block px-8 py-3 rounded-full bg-green-500 hover:bg-green-400 text-neutral-950 font-semibold shadow transition">Book a Demo</a>
              <a href="#how" className="inline-block px-8 py-3 rounded-full border border-green-500 text-green-300 hover:bg-green-900/40 font-semibold shadow transition">See How It Works</a>
            </div>
            <div className="text-sm text-neutral-400 mt-4">
              Built for dental clinics now — designed to scale across beauty clinics, salons, and service businesses.
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

      {/* Problem Section */}
      <Section className="bg-neutral-950/80 rounded-2xl mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">WhatsApp is where your clients book — and where your team gets overwhelmed.</h2>
        <p className="text-neutral-300 mb-6 max-w-2xl">
          Most clinics still handle WhatsApp manually. That means:
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-neutral-400 text-base mb-2 max-w-xl mx-auto">
          <li>• Slow replies</li>
          <li>• Missed inquiries</li>
          <li>• Repeated questions</li>
          <li>• Lost bookings</li>
          <li>• Front desk overload</li>
        </ul>
        <p className="text-neutral-400 mt-4">Your clients expect fast answers. Your team cannot stay online 24/7.</p>
      </Section>

      {/* Solution Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Velora AI handles the conversation for you.</h2>
        <p className="text-neutral-300 mb-6 max-w-2xl">
          Velora AI works like an AI receptionist inside your WhatsApp. It can:
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-neutral-400 text-base mb-2 max-w-xl mx-auto">
          <li>• Reply instantly</li>
          <li>• Understand booking intent</li>
          <li>• Collect client details</li>
          <li>• Show available slots</li>
          <li>• Confirm appointments</li>
          <li>• Escalate to staff when needed</li>
        </ul>
        <p className="text-neutral-400 mt-4">It is fast, simple, and built to reduce friction in the booking journey.</p>
      </Section>

      {/* How It Works Section */}
      <Section id="how" className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-12 text-center">How Velora AI works</h2>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 md:gap-4">
          <div className="flex-1 flex flex-col items-center">
            <div className="relative flex flex-col items-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500 text-neutral-950 font-bold text-xl mb-2">1</div>
              <div className="font-semibold text-lg mb-1">Client messages your WhatsApp</div>
              <div className="text-neutral-400 text-base text-center mb-2">They ask to book, reschedule, confirm, or speak to someone.</div>
            </div>
          </div>
          <div className="hidden md:block w-12 h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 rounded-full mx-2" />
          <div className="flex-1 flex flex-col items-center">
            <div className="relative flex flex-col items-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500 text-neutral-950 font-bold text-xl mb-2">2</div>
              <div className="font-semibold text-lg mb-1">Velora AI handles the flow</div>
              <div className="text-neutral-400 text-base text-center mb-2">It understands the message, collects missing details, and guides the client step by step.</div>
            </div>
          </div>
          <div className="hidden md:block w-12 h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 rounded-full mx-2" />
          <div className="flex-1 flex flex-col items-center">
            <div className="relative flex flex-col items-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500 text-neutral-950 font-bold text-xl mb-2">3</div>
              <div className="font-semibold text-lg mb-1">Appointment gets booked</div>
              <div className="text-neutral-400 text-base text-center mb-2">The system confirms the booking, updates the session, and keeps the process moving.</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Benefits Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Why clinics use Velora AI</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <h3 className="font-semibold text-lg mb-2">Respond in seconds, not hours</h3>
            <p className="text-neutral-300 text-base">No more waiting hours to answer booking inquiries.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Stop answering the same questions manually</h3>
            <p className="text-neutral-300 text-base">Your team stops wasting time on repetitive WhatsApp messages.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Less drop-off, more completed bookings</h3>
            <p className="text-neutral-300 text-base">Guide clients from message to appointment with less drop-off.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Capture demand even after working hours</h3>
            <p className="text-neutral-300 text-base">Capture booking intent even outside working hours.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Your team focuses on care, not admin</h3>
            <p className="text-neutral-300 text-base">Human staff step in only for exceptions, not every message.</p>
          </Card>
        </div>
      </Section>

      {/* Use Cases Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Built for clinics now. Ready for every booking-based business next.</h2>
        <p className="text-neutral-300 mb-4 max-w-2xl">
          Velora AI is starting with:
        </p>
        <ul className="text-neutral-400 text-base mb-2 max-w-xl mx-auto">
          <li>• Dental clinics</li>
        </ul>
        <p className="text-neutral-300 mt-4 mb-2">And expanding into:</p>
        <ul className="text-neutral-400 text-base mb-2 max-w-xl mx-auto">
          <li>• Beauty clinics</li>
          <li>• Dermatology clinics</li>
          <li>• Salons</li>
          <li>• Wellness businesses</li>
          <li>• Any business that books through WhatsApp</li>
        </ul>
      </Section>

      {/* Credibility Section */}
      <Section className="mt-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Designed for real booking workflows — not just chatbot demos</h2>
        <p className="text-neutral-300 mb-4 max-w-2xl">
          Velora AI is built around actual appointment flows:
        </p>
        <ul className="text-neutral-400 text-base mb-2 max-w-xl mx-auto">
          <li>• booking</li>
          <li>• rescheduling</li>
          <li>• confirmation</li>
          <li>• human escalation</li>
          <li>• structured client data collection</li>
        </ul>
        <p className="text-neutral-400 mt-4">This is not a generic chatbot.<br/>It is an AI receptionist built for operational use.</p>
      </Section>

      {/* Final CTA Section */}
      <Section id="demo" className="mt-20 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 bg-clip-text text-transparent">
          Let WhatsApp handle more of your bookings
        </h2>
        <p className="text-lg md:text-2xl text-neutral-200 mb-8 max-w-2xl mx-auto">
          See how Velora AI can turn conversations into confirmed appointments.
        </p>
        <a href="#" className="inline-block px-10 py-4 rounded-full bg-green-500 hover:bg-green-400 text-neutral-950 font-semibold shadow transition text-lg">Book a Demo</a>
      </Section>

      <footer className="text-center text-neutral-600 text-sm py-8 mt-8">
        &copy; {new Date().getFullYear()} Velora AI. All rights reserved.
      </footer>
    </div>
  );
}
