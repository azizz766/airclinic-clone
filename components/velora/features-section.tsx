export default function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-8 py-32">
      <h2 className="mb-16 text-center text-3xl font-extrabold text-[#1c1c1c] md:text-5xl">
        Operational Features
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
  <span className="material-symbols-outlined text-[20px]">calendar_add_on</span>
</div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">24/7 Instant Replies</h3>
          <p className="text-sm text-[#635f53]">
            Every WhatsApp message gets an immediate response — even outside clinic hours.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">calendar_today</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Smart Appointment Booking</h3>
          <p className="text-sm text-[#635f53]">
            Patients can book, confirm, or change appointments in seconds.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">notifications_active</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Automated Reminders</h3>
          <p className="text-sm text-[#635f53]">
            Reduce no-shows with timely WhatsApp reminders and follow-ups.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">autorenew</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Cancellation & Rescheduling</h3>
          <p className="text-sm text-[#635f53]">
            Handle changes automatically without staff involvement.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Human Handoff</h3>
          <p className="text-sm text-[#635f53]">
            Escalate complex cases to your staff instantly.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">lightbulb</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">No-Show Reduction</h3>
          <p className="text-sm text-[#635f53]">
            Patients are nudged and confirmed before their visit.
          </p>
        </div>
      </div>
    </section>
  )
}