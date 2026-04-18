export default function SocialProofSection() {
  return (
    <section id="outcomes" className="mx-auto max-w-7xl px-8 py-32">
      <h2 className="mb-16 text-center text-3xl font-extrabold text-[#1c1c1c] md:text-5xl">
        Business Outcomes
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-[2rem] bg-[#f3ecff] p-8">
          <h3 className="mb-4 text-2xl font-bold text-[#1c1c1c]">Never Miss a Patient Again</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Capture every inquiry 24/7. Turn middle-of-the-night messages into confirmed morning appointments.
          </p>
        </div>

        <div className="rounded-[2rem] bg-[#f9f3e7] p-8">
          <h3 className="mb-4 text-2xl font-bold text-[#1c1c1c]">Save 15+ Hours / Week</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Save 20+ hours weekly. Eliminate manual WhatsApp management and let your front desk focus on patients in the clinic.
          </p>
        </div>

        <div className="rounded-[2rem] bg-[#eef4ff] p-8">
          <h3 className="mb-4 text-2xl font-bold text-[#1c1c1c]">+30% More Confirmed Bookings</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Boost chair utilization by 25–30% by closing leads while their intent is at its peak.
          </p>
        </div>

        <div className="rounded-[2rem] bg-[#f3ecff] p-8">
          <h3 className="mb-4 text-2xl font-bold text-[#1c1c1c]">Reply in {"<3"} Seconds, 24/7</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Reply in under3 seconds every time, ensuring you are the first clinic to engage with potential patients.
          </p>
        </div>

        <div className="rounded-[2rem] bg-[#f9f3e7] p-8">
          <h3 className="mb-4 text-2xl font-bold text-[#1c1c1c]">Automated Follow-ups = Higher Retention</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Patients value instant communication. Provide a modern, frictionless experience that keeps them coming back.
          </p>
        </div>

        <div className="rounded-[2rem] bg-[#eef4ff] p-8">
          <h3 className="mb-4 text-2xl font-bold text-[#1c1c1c]">Run Your Front Desk on Autopilot</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Manage multiple locations and high-volume inquiry periods without hiring additional administrative staff.
          </p>
        </div>
      </div>
    </section>
  )
}