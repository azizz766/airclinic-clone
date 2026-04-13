// Velora AI Landing Page — app/page.tsx
// Premium SaaS landing for clinics — Tailwind CSS only

import React from "react";

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`w-full max-w-5xl mx-auto px-4 md:px-8 py-12 md:py-20 ${className}`}>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-neutral-900/80 border border-neutral-800 shadow-lg p-6 md:p-8 ${className}`}>
      {children}
    </div>
  );
}

export default function VeloraLanding() {
  return (
    <main className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 min-h-screen text-white font-sans">
      {/* Hero Section */}
      <Section className="pt-24 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-green-400 via-emerald-400 to-green-300 bg-clip-text text-transparent">
          Turn Your WhatsApp Into a 24/7 Booking Machine
        </h1>
        <p className="text-lg md:text-2xl text-neutral-200 mb-8 max-w-2xl mx-auto">
          Velora AI replies, qualifies, books, and follows up automatically — so your clinic saves time and captures more appointments.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
          <a href="#demo" className="inline-block px-8 py-3 rounded-full bg-green-500 hover:bg-green-400 text-neutral-950 font-semibold shadow transition">Book a Demo</a>
          <a href="#how" className="inline-block px-8 py-3 rounded-full border border-green-500 text-green-300 hover:bg-green-900/40 font-semibold shadow transition">See How It Works</a>
        </div>
        <div className="text-sm text-neutral-400 mt-2">
          Built for dental clinics now — designed to scale across beauty clinics, salons, and service businesses.
        </div>
      </Section>

      {/* Problem Section */}
      <Section className="bg-neutral-950/80 rounded-2xl mt-8">
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
      <Section className="mt-8">
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
      <Section id="how" className="mt-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">How Velora AI works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <div className="text-green-400 text-3xl mb-2">1</div>
            <h3 className="font-semibold text-lg mb-1">Client messages your WhatsApp</h3>
            <p className="text-neutral-300 text-base">They ask to book, reschedule, confirm, or speak to someone.</p>
          </Card>
          <Card>
            <div className="text-green-400 text-3xl mb-2">2</div>
            <h3 className="font-semibold text-lg mb-1">Velora AI handles the flow</h3>
            <p className="text-neutral-300 text-base">It understands the message, collects missing details, and guides the client step by step.</p>
          </Card>
          <Card>
            <div className="text-green-400 text-3xl mb-2">3</div>
            <h3 className="font-semibold text-lg mb-1">Appointment gets booked</h3>
            <p className="text-neutral-300 text-base">The system confirms the booking, updates the session, and keeps the process moving.</p>
          </Card>
        </div>
      </Section>

      {/* Benefits Section */}
      <Section className="mt-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Why clinics use Velora AI</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <h3 className="font-semibold text-lg mb-2">Reply instantly</h3>
            <p className="text-neutral-300 text-base">No more waiting hours to answer booking inquiries.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Reduce front desk pressure</h3>
            <p className="text-neutral-300 text-base">Your team stops wasting time on repetitive WhatsApp messages.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Increase confirmed bookings</h3>
            <p className="text-neutral-300 text-base">Guide clients from message to appointment with less drop-off.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Stay available 24/7</h3>
            <p className="text-neutral-300 text-base">Capture booking intent even outside working hours.</p>
          </Card>
          <Card>
            <h3 className="font-semibold text-lg mb-2">Escalate only when needed</h3>
            <p className="text-neutral-300 text-base">Human staff step in only for exceptions, not every message.</p>
          </Card>
        </div>
      </Section>

      {/* Use Cases Section */}
      <Section className="mt-8">
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
      <Section className="mt-8">
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
      <Section id="demo" className="mt-12 text-center">
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
    </main>
  );
}
