// Velora AI Landing Page — app/page.tsx
// Premium SaaS — Linear/Stripe style

import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Velora AI — WhatsApp AI Receptionist",
  description: "Turn WhatsApp into a 24/7 booking machine for your clinic.",
};

// ─── Shared Layout ────────────────────────────────────────────────────────────

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`max-w-6xl mx-auto px-6 ${className}`}>{children}</div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="sticky top-0 z-30 w-full bg-white border-b border-[#E5E7EB]">
      <Container className="flex items-center justify-between h-16">
        {/* Logo */}
        <div className="flex items-center gap-0.5 font-bold text-xl tracking-tight select-none">
          <span className="text-[#0F172A]">Velora</span>
          <span className="text-[#6D5DFC]">AI</span>
        </div>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-[#6B7280]">
          <a href="#how" className="hover:text-[#0F172A] transition-colors">How it works</a>
          <a href="#benefits" className="hover:text-[#0F172A] transition-colors">Benefits</a>
          <a href="#demo" className="hover:text-[#0F172A] transition-colors">Pricing</a>
        </div>

        {/* CTA */}
        <a
          href="#demo"
          className="bg-[#6D5DFC] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#5a4de0] transition-colors"
        >
          Book a Demo
        </a>
      </Container>
    </nav>
  );
}

// ─── WhatsApp Mockup ──────────────────────────────────────────────────────────

function WhatsAppMockup() {
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
        {/* User — msg 1 */}
        <div className="max-w-[75%] mb-2">
          <div className="bg-white rounded-xl rounded-tl-none px-3 py-2 shadow-sm">
            <p className="text-[#0F172A] text-[14px]">I want to book a teeth cleaning tomorrow morning</p>
            <p className="text-[10px] text-gray-400 opacity-70 mt-0.5 text-right">9:01 AM</p>
          </div>
        </div>

        {/* AI — slots */}
        <div className="max-w-[80%] ml-auto mb-4">
          <div className="bg-[#DCF8C6] rounded-xl rounded-tr-none px-3 py-2 shadow-sm">
            <p className="text-[#0F172A] text-[14px]">
              Hi there 👋<br />
              Here are the available slots:<br />
              1️⃣ Tuesday 9:00 AM<br />
              2️⃣ Tuesday 11:00 AM<br />
              3️⃣ Wednesday 9:30 AM
            </p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <span className="text-[10px] text-gray-400 opacity-70">9:01 AM</span>
              <span className="text-[10px] text-[#25D366]">✓✓</span>
            </div>
          </div>
        </div>

        {/* User — selection */}
        <div className="max-w-[75%] mb-2">
          <div className="bg-white rounded-xl rounded-tl-none px-3 py-2 shadow-sm">
            <p className="text-[#0F172A] text-[14px]">1</p>
            <p className="text-[10px] text-gray-400 opacity-70 mt-0.5 text-right">9:02 AM</p>
          </div>
        </div>

        {/* AI — confirmation */}
        <div className="max-w-[80%] ml-auto">
          <div className="bg-[#DCF8C6] rounded-xl rounded-tr-none px-3 py-2 shadow-sm">
            <p className="text-[#0F172A] text-[14px]">
              ✅ Booking confirmed<br />
              Service: Teeth cleaning<br />
              Time: Tuesday 9:00 AM
            </p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <span className="text-[10px] text-gray-400 opacity-70">9:02 AM</span>
              <span className="text-[10px] text-[#25D366]">✓✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
            <div className="flex-1 flex flex-col items-start">
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
                <a
                  href="#demo"
                  className="bg-[#6D5DFC] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#5a4de0] transition-colors text-sm"
                >
                  Start Free Trial
                </a>
                <a
                  href="#how"
                  className="border border-[#E5E7EB] text-[#0F172A] font-semibold px-6 py-3 rounded-lg hover:bg-[#F5F6F8] transition-colors text-sm"
                >
                  See How It Works
                </a>
              </div>
              <p className="text-sm text-[#6B7280]">No credit card required · Setup in under 24 hours</p>
            </div>

            {/* Right */}
            <div className="flex-1 flex justify-center md:justify-end">
              <WhatsAppMockup />
            </div>
          </div>
        </Container>
      </section>

      {/* ── Stats Row ────────────────────────────────────────────────────── */}
      <section className="bg-white border-y border-[#E5E7EB]">
        <Container className="py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "24/7", label: "Booking availability" },
              { value: "< 3 sec", label: "Average response time" },
              { value: "+30%", label: "More confirmed bookings" },
              { value: "0 missed", label: "Patient inquiries" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-[#0F172A] mb-1">{stat.value}</p>
                <p className="text-sm text-[#6B7280]">{stat.label}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────────── */}
      <section className="bg-[#F5F6F8]">
        <Container className="py-16">
          <SectionLabel>The Problem</SectionLabel>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4 max-w-2xl">
            WhatsApp is where your clients book — and where your team gets overwhelmed.
          </h2>
          <p className="text-[#6B7280] mb-6 max-w-xl">
            Most clinics still handle WhatsApp manually. That means:
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            {["Slow replies", "Missed inquiries", "Repeated questions", "Lost bookings", "Front desk overload"].map(
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
        </Container>
      </section>

      {/* ── Solution ─────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <Container className="py-24">
          <SectionLabel>The Solution</SectionLabel>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4 max-w-2xl">
            Velora AI handles the conversation for you.
          </h2>
          <p className="text-[#6B7280] mb-6 max-w-xl">
            Velora AI works like an AI receptionist inside your WhatsApp. It can:
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
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
                className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#F5F6F8] border border-[#E5E7EB] text-sm text-[#6B7280] shadow-sm"
              >
                {text}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            It is fast, simple, and built to reduce friction in the booking journey.
          </p>
        </Container>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section id="how" className="bg-white border-t border-[#E5E7EB]">
        <Container className="py-28">
          <div className="text-center mb-12">
            <SectionLabel>Process</SectionLabel>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A]">How Velora works</h2>
          </div>
          <div className="flex flex-col md:flex-row md:items-stretch gap-4 md:gap-2">
            {[
              { step: 1, title: "Patient Message", desc: "Patient sends a WhatsApp message" },
              { step: 2, title: "AI Processing", desc: "Velora understands intent and checks availability" },
              { step: 3, title: "Smart Scheduling", desc: "Best available slot is suggested instantly" },
              { step: 4, title: "Confirmation", desc: "Appointment confirmed and saved automatically" },
            ].map(({ step, title, desc }, idx, arr) => (
              <React.Fragment key={step}>
                <div className="flex-1 bg-white rounded-xl border border-[#E5E7EB] p-7 flex flex-col items-center text-center shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200">
                  <div className="w-8 h-8 rounded-full bg-[#0F172A] text-white text-sm font-bold flex items-center justify-center mb-4 flex-shrink-0">
                    {step}
                  </div>
                  <p className="font-semibold text-[#0F172A] mb-1 text-sm">{title}</p>
                  <p className="text-xs text-[#6B7280]">{desc}</p>
                </div>
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
          <SectionLabel>Benefits</SectionLabel>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-10">
            Why clinics choose Velora AI
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { emoji: "🔔", title: "Never miss a booking", desc: "Capture every patient inquiry — even after working hours" },
              { emoji: "⚡", title: "Reduce front desk workload", desc: "Stop answering repetitive booking messages manually" },
              { emoji: "📈", title: "Increase confirmed appointments", desc: "Convert more conversations into actual bookings" },
              { emoji: "🌙", title: "Available 24/7", desc: "Patients can book anytime, even at night" },
              { emoji: "🎯", title: "Smart escalation", desc: "Only involve staff when necessary" },
              { emoji: "💬", title: "WhatsApp native", desc: "No app downloads — works right inside WhatsApp" },
            ].map(({ emoji, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-xl border border-[#E5E7EB] p-7 flex flex-col gap-2 hover:shadow-md hover:scale-[1.01] transition-all duration-200"
              >
                <div className="text-2xl">{emoji}</div>
                <p className="font-semibold text-[#0F172A] text-sm">{title}</p>
                <p className="text-sm text-[#6B7280]">{desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Use Cases ────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <Container className="py-16">
          <SectionLabel>Use Cases</SectionLabel>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-3 max-w-2xl">
            Built for clinics now. Ready for every booking-based business next.
          </h2>
          <p className="text-[#6B7280] mb-10 max-w-xl">
            Velora AI is starting with dental clinics and expanding fast.
          </p>

          {/* Live now — hero card */}
          <div className="border-2 border-[#6D5DFC] bg-[#F8F7FF] rounded-xl p-6 flex items-center justify-between mb-6 max-w-sm">
            <div>
              <p className="font-semibold text-[#0F172A] text-base mb-1">🦷 Dental Clinics</p>
              <p className="text-sm text-[#6B7280]">Automated bookings, reminders, follow-ups</p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#6D5DFC] text-white text-xs font-semibold flex-shrink-0 ml-4">
              Live now
            </span>
          </div>

          <p className="text-[#6B7280] text-sm mb-5">And expanding into:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { emoji: "🔬", name: "Dermatology Clinics" },
              { emoji: "💆", name: "Aesthetic Clinics" },
              { emoji: "🏥", name: "Medical Centers" },
              { emoji: "📅", name: "Any booking business" },
            ].map(({ emoji, name }) => (
              <div key={name} className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[#0F172A] text-sm">
                    {emoji} {name}
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-400 font-medium">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Credibility ──────────────────────────────────────────────────── */}
      <section className="bg-[#F5F6F8]">
        <Container className="py-24">
          <SectionLabel>Built Different</SectionLabel>
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-4 max-w-2xl">
            Designed for real booking workflows — not just chatbot demos
          </h2>
          <p className="text-[#6B7280] mb-6 max-w-xl">
            Velora AI is built around actual appointment flows:
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            {[
              "booking",
              "rescheduling",
              "confirmation",
              "human escalation",
              "structured client data collection",
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
        </Container>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section id="demo" className="bg-[#F5F6F8] px-4 my-8">
        <div className="max-w-5xl mx-auto bg-[#0F172A] rounded-2xl p-16 md:p-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6D5DFC] mb-4">Get Started</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to automate your bookings?
          </h2>
          <p className="text-[#6B7280] mb-10 max-w-lg mx-auto">
            Let Velora AI handle WhatsApp so your team can focus on care, not admin. See it in action or book a demo now.
          </p>
          <a
            href="#demo"
            className="inline-block bg-white text-[#0F172A] font-bold px-9 py-4 rounded-xl hover:bg-gray-100 transition-colors text-sm"
          >
            Book a Demo →
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-[#E5E7EB] py-8 text-center text-sm text-[#6B7280]">
        &copy; 2026 Velora AI. All rights reserved.
      </footer>
    </div>
  );
}
