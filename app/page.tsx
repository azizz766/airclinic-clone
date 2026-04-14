// Velora AI Landing Page — app/page.tsx
// Light SaaS dashboard aesthetic + realistic WhatsApp chat style

import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Velora AI — WhatsApp AI Receptionist",
  description: "Turn WhatsApp into a 24/7 booking machine for your clinic.",
};

function Navbar() {
  return (
    <nav className="sticky top-0 z-30 w-full bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-10 h-16">
      <div className="flex items-center gap-1 font-bold text-xl tracking-tight">
        <span className="text-[#1a1a2e]">Velora</span>
        <span className="text-[#25d366]">AI</span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
        <a href="#how" className="hover:text-[#1a1a2e] transition">How it works</a>
        <a href="#benefits" className="hover:text-[#1a1a2e] transition">Benefits</a>
        <a href="#demo" className="hover:text-[#1a1a2e] transition">Pricing</a>
      </div>
      <a
        href="#demo"
        className="bg-[#1a1a2e] text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition font-medium"
      >
        Book a Demo
      </a>
    </nav>
  );
}

function WhatsAppMockup() {
  return (
    <div className="max-w-sm w-full rounded-2xl overflow-hidden shadow-md">
      {/* Header bar */}
      <div className="bg-[#075e54] rounded-t-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          V
        </div>
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm leading-tight">Velora AI</span>
          <span className="text-[#b2dfdb] text-xs leading-tight">online</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="bg-[#efeae2] px-4 py-4 flex flex-col gap-3">
        {/* User message */}
        <div className="flex flex-col items-start max-w-[75%]">
          <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
            <p className="text-[#303030] text-sm">I want to book a teeth cleaning tomorrow morning</p>
            <p className="text-[10px] text-gray-400 text-right mt-1">9:01 AM</p>
          </div>
        </div>

        {/* AI message */}
        <div className="flex flex-col items-end max-w-[80%] ml-auto">
          <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none px-3 py-2 shadow-sm">
            <p className="text-[#303030] text-sm">
              Hi there 👋<br />
              Here are the available slots:<br />
              1️⃣ Tuesday 9:00 AM<br />
              2️⃣ Tuesday 11:00 AM<br />
              3️⃣ Wednesday 9:30 AM
            </p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px] text-gray-400">9:01 AM</span>
              <span className="text-[10px] text-[#25d366]">✓✓</span>
            </div>
          </div>
        </div>

        {/* User message */}
        <div className="flex flex-col items-start max-w-[75%]">
          <div className="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm">
            <p className="text-[#303030] text-sm">1</p>
            <p className="text-[10px] text-gray-400 text-right mt-1">9:02 AM</p>
          </div>
        </div>

        {/* AI message */}
        <div className="flex flex-col items-end max-w-[80%] ml-auto">
          <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none px-3 py-2 shadow-sm">
            <p className="text-[#303030] text-sm">
              ✅ Booking confirmed<br />
              Service: Teeth cleaning<br />
              Time: Tuesday 9:00 AM
            </p>
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px] text-gray-400">9:02 AM</span>
              <span className="text-[10px] text-[#25d366]">✓✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VeloraLanding() {
  return (
    <div className="bg-[#f8f9fa] min-h-screen text-[#1a1a2e] font-sans">
      <Navbar />

      {/* ── Hero ── */}
      <section
        className="bg-white"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 50%, rgba(37,211,102,0.06) 0%, #ffffff 70%)",
        }}
      >
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-12 md:gap-16">
            {/* Left */}
            <div className="flex-1 flex flex-col items-start">
              <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">
                WhatsApp AI Receptionist
              </span>
              <h1 className="text-4xl md:text-5xl font-bold text-[#1a1a2e] mb-5 leading-tight">
                Turn WhatsApp into a 24/7 Booking Machine
              </h1>
              <p className="text-lg text-gray-500 mb-8 max-w-xl">
                Velora AI automatically replies to patients, finds available slots, and confirms appointments — so your team can focus on care.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <a
                  href="#demo"
                  className="inline-block bg-[#1a1a2e] text-white font-semibold px-6 py-3 rounded-xl hover:bg-gray-800 transition text-sm"
                >
                  Start Free Trial
                </a>
                <a
                  href="#how"
                  className="inline-block border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition text-sm"
                >
                  See How It Works
                </a>
              </div>
              <p className="text-sm text-gray-400">No credit card required · Setup in under 24 hours</p>
            </div>

            {/* Right: WhatsApp mockup */}
            <div className="flex-1 flex justify-center md:justify-end">
              <WhatsAppMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Metrics Strip ── */}
      <section className="bg-white border-y border-gray-100 py-10">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "24/7", label: "Booking availability" },
              { value: "< 3 sec", label: "Average response time" },
              { value: "+30%", label: "Increase in confirmed bookings" },
              { value: "0 missed", label: "Patient inquiries" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span className="text-3xl font-bold text-[#1a1a2e] mb-1">{stat.value}</span>
                <span className="text-sm text-gray-500">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem Section ── */}
      <section className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
        <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 block">The Problem</span>
        <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] mb-4">
          WhatsApp is where your clients book — and where your team gets overwhelmed.
        </h2>
        <p className="text-gray-500 mb-6 max-w-2xl">
          Most clinics still handle WhatsApp manually. That means:
        </p>
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            "Slow replies",
            "Missed inquiries",
            "Repeated questions",
            "Lost bookings",
            "Front desk overload",
          ].map((text) => (
            <span
              key={text}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-600 shadow-sm"
            >
              {text}
            </span>
          ))}
        </div>
        <p className="text-gray-400 mt-4 text-sm">
          Your clients expect fast answers. Your team cannot stay online 24/7.
        </p>
      </section>

      {/* ── Solution Section ── */}
      <section className="bg-[#f1f3f5]">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 block">The Solution</span>
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] mb-4">
            Velora AI handles the conversation for you.
          </h2>
          <p className="text-gray-500 mb-6 max-w-2xl">
            Velora AI works like an AI receptionist inside your WhatsApp. It can:
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
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
                className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-600 shadow-sm"
              >
                {text}
              </span>
            ))}
          </div>
          <p className="text-gray-400 mt-4 text-sm">
            It is fast, simple, and built to reduce friction in the booking journey.
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how" className="bg-white">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 block text-center">
            Process
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] mb-12 text-center">
            How Velora works
          </h2>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 md:gap-2">
            {[
              { step: 1, title: "Patient Message", description: "Patient sends a message on WhatsApp" },
              { step: 2, title: "AI Processing", description: "Velora understands intent and checks availability" },
              { step: 3, title: "Smart Scheduling", description: "Best available slot is suggested instantly" },
              { step: 4, title: "Confirmation", description: "Appointment is confirmed and saved automatically" },
            ].map(({ step, title, description }, idx, arr) => (
              <React.Fragment key={step}>
                <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition flex flex-col items-center text-center">
                  <div className="w-8 h-8 rounded-full bg-[#1a1a2e] text-white text-sm font-bold flex items-center justify-center mb-4">
                    {step}
                  </div>
                  <div className="font-semibold text-[#1a1a2e] mb-1">{title}</div>
                  <div className="text-sm text-gray-500">{description}</div>
                </div>
                {idx < arr.length - 1 && (
                  <div className="hidden md:flex items-center text-gray-300 text-xl px-1">→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section id="benefits" className="bg-[#f1f3f5]">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 block">
            Benefits
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] mb-8">
            Why clinics choose Velora AI
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: "🔔", title: "Never miss a booking", desc: "Capture every patient inquiry — even after working hours" },
              { emoji: "⚡", title: "Reduce front desk workload", desc: "Stop answering repetitive booking messages manually" },
              { emoji: "📈", title: "Increase confirmed appointments", desc: "Convert more conversations into actual bookings" },
              { emoji: "🌙", title: "Available 24/7", desc: "Patients can book anytime, even at night" },
              { emoji: "🎯", title: "Smart escalation", desc: "Only involve staff when necessary" },
              { emoji: "💬", title: "Where patients already are", desc: "No app downloads — works right inside WhatsApp" },
            ].map(({ emoji, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition"
              >
                <div className="text-2xl mb-3">{emoji}</div>
                <h3 className="text-base font-semibold text-[#1a1a2e]">{title}</h3>
                <p className="text-sm text-gray-500 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="bg-white">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 block">
            Use Cases
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] mb-4">
            Built for clinics now. Ready for every booking-based business next.
          </h2>
          <p className="text-gray-500 mb-6 max-w-2xl">Velora AI is starting with:</p>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-[#25d366]/40 shadow-sm p-5 min-w-[200px] max-w-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-[#1a1a2e] text-sm">Dental clinics</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#25d366]/10 border border-[#25d366]/30 text-xs text-[#1a6b3c] font-medium">
                  Live now
                </span>
              </div>
              <span className="text-gray-500 text-sm">Automated bookings, reminders, follow-ups</span>
            </div>
          </div>
          <p className="text-gray-500 mb-4 text-sm">And expanding into:</p>
          <div className="flex flex-wrap gap-4">
            {[
              "Beauty clinics",
              "Dermatology clinics",
              "Salons",
              "Wellness businesses",
              "Any business that books through WhatsApp",
            ].map((name) => (
              <div
                key={name}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 min-w-[180px] max-w-xs"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-[#1a1a2e] text-sm">{name}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-400 font-medium">
                    Coming soon
                  </span>
                </div>
                <span className="text-gray-500 text-sm">Automated bookings, reminders, follow-ups</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Credibility ── */}
      <section className="bg-[#f1f3f5]">
        <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 block">
            Built Different
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a2e] mb-4">
            Designed for real booking workflows — not just chatbot demos
          </h2>
          <p className="text-gray-500 mb-6 max-w-2xl">
            Velora AI is built around actual appointment flows:
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            {[
              "booking",
              "rescheduling",
              "confirmation",
              "human escalation",
              "structured client data collection",
            ].map((text) => (
              <span
                key={text}
                className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-600 shadow-sm"
              >
                {text}
              </span>
            ))}
          </div>
          <p className="text-gray-400 mt-4 text-sm">
            This is not a generic chatbot.<br />
            It is an AI receptionist built for operational use.
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section id="demo" className="bg-[#f8f9fa] px-4 py-8">
        <div className="bg-[#1a1a2e] rounded-3xl mx-auto max-w-5xl p-12 text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4 block">
            Get Started
          </span>
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to automate your bookings?
          </h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Let Velora AI handle WhatsApp so your team can focus on care, not admin. See it in action or book a demo now.
          </p>
          <a
            href="#demo"
            className="inline-block bg-white text-[#1a1a2e] font-semibold px-8 py-3 rounded-xl hover:bg-gray-100 transition text-sm"
          >
            Book a Demo →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-100 text-center text-gray-400 text-sm py-8">
        &copy; 2026 Velora AI. All rights reserved.
      </footer>
    </div>
  );
}
