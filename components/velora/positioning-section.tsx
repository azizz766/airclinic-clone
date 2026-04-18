export default function PositioningSection() {
  const points = [
    "Understands patient intent",
    "Checks real availability",
    "Confirms bookings automatically",
    "Escalates when needed",
    "Sends reminders & follow-ups",
    "Works inside WhatsApp",
  ]

  return (
  <section id="features" className="mx-auto max-w-7xl px-8 py-32">
    <div className="rounded-[2.5rem] border border-black/5 bg-white px-10 py-16 text-center shadow-sm md:px-16">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
        
      </p>

      <h2 className="mb-4 text-3xl font-extrabold text-[#1c1c1c] md:text-5xl">
        Not a chatbot. A digital receptionist.
      </h2>

      <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-[#635f53]">
        Built for real clinic workflows — not just generic replies.
      </p>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-y-8 text-left md:grid-cols-3 md:gap-x-12">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          </div>
          <p className="text-[15px] font-medium text-[#1c1c1c]">Understands intent</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          </div>
          <p className="text-[15px] font-medium text-[#1c1c1c]">Escalates when needed</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          </div>
          <p className="text-[15px] font-medium text-[#1c1c1c]">Sends automatic reminders</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          </div>
          <p className="text-[15px] font-medium text-[#1c1c1c]">Confirms instantly</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          </div>
          <p className="text-[15px] font-medium text-[#1c1c1c]">Checks real availability</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20,6 9,17 4,12" />
          </svg>
          </div>
          <p className="text-[15px] font-medium text-[#1c1c1c]">Secure &amp; HIPAA compliant</p>
        </div>
      </div>

      <p className="mt-10 text-2xl font-semibold text-[#674db1]">
        All inside WhatsApp.
      </p>
    </div>
  </section>
)
}