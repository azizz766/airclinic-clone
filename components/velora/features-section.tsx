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
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Smart Booking Automation</h3>
          <p className="text-sm text-[#635f53]">
            Advanced logic to handle multi-step scheduling across different treatments automatically.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">calendar_today</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Calendar-Aware Scheduling</h3>
          
          <p className="text-sm text-[#635f53]">
            Real-time sync with your PMS (Dentrix, Cliniko, Jane, etc.) for live availability checking.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">notifications_active</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Automated Reminders</h3>
          <p className="text-sm text-[#635f53]">
            Proactive WhatsApp notifications to reduce no-shows and keep chairs filled.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">autorenew</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Recovery Flows</h3>
          <p className="text-sm text-[#635f53]">
            Re-engage patients who didn’t complete booking.Automatically re-engage patients who dropped off during the booking process.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Human Handoff</h3>
          <p className="text-sm text-[#635f53]">
            Seamlessly escalate complex medical inquiries to your team with full context.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-[#f9f3e7] p-8 shadow-sm">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede7ff] text-[#674db1]">
            <span className="material-symbols-outlined text-[20px]">lightbulb</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#674db1]">Instant Activation</h3>
          <p className="text-sm text-[#635f53]">
            Go live on your existing number in under 24 hours. No complex coding required.
          </p>
        </div>
      </div>
    </section>
  )
}