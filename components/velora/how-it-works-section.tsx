const steps = [
  {
    number: "01",
    title: "Patient sends a message",
    description:
      "A patient messages your clinic on WhatsApp asking for an appointment.",
  },
  {
    number: "02",
    title: "Velora understands the intent",
    description:
      "It identifies the request, understands the service and time preference, and checks real availability.",
  },
  {
    number: "03",
    title: "Booking gets confirmed",
    description:
      "The patient selects a slot and Velora confirms the appointment automatically.",
  },
]

export default function HowItWorksSection() {
  return (
  <section id="how-it-works" className="mx-auto max-w-7xl px-8 py-32">
    <div className="rounded-[2.5rem] bg-[#f9f3e7] px-10 py-16 md:px-14">
      <p className="mb-4 text-center text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
        
      </p>

      <h2 className="mx-auto mb-16 max-w-4xl text-center text-3xl font-extrabold leading-tight text-[#1c1c1c] md:text-5xl">
        From message to confirmed booking — automatically
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4 xl:grid-cols-5">
        <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
            1
          </div>
          <div className="mb-5 text-[#674db1]">
            <span className="material-symbols-outlined text-xl">chat</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#1c1c1c]">Patient sends a message</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            They text your business WhatsApp for an appointment.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
            2
          </div>
          <div className="mb-5 text-[#674db1]">
            <span className="material-symbols-outlined text-xl">neurology</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#1c1c1c]">Velora understands intent</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            The AI identifies the request and scans your live calendar.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
            3
          </div>
          <div className="mb-5 text-[#674db1]">
            <span className="material-symbols-outlined text-xl">calendar_month</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#1c1c1c]">Suggests best available slots instantly</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Available times are offered for the patient to choose from.
          </p>
        </div>

        <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
            4
          </div>
          <div className="mb-5 text-[#674db1]">
            <span className="material-symbols-outlined text-xl">check_circle</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#1c1c1c]">Confirms instantly</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            The appointment is secured in your system without human help.
          </p>
        </div>

        <div className="relative rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[#674db1] text-sm font-bold text-white">
            5
          </div>
          <div className="mb-5 text-[#674db1]">
            <span className="material-symbols-outlined text-xl">notifications_active</span>
          </div>
          <h3 className="mb-3 text-xl font-bold text-[#1c1c1c]">Automated reminders &amp; follow-ups</h3>
          <p className="text-sm leading-relaxed text-[#635f53]">
            Automatic follow-ups and reminders ensure high show-up rates.
          </p>

          <div className="mt-4 inline-flex rounded-full bg-[#f3ecff] px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-[#674db1]">
            Revenue feature
          </div>
        </div>
      </div>
    </div>
  </section>
)
}