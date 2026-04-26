export default function ProblemSection() {
  const tags = [
    "After-hours messages ignored",
    "Staff reply too late",
    "WhatsApp inquiries missed",
    "Weak reminders cause no-shows",
    "Lost bookings every week",
  ]

  return (
    <section id="outcomes" className="mx-auto max-w-7xl px-8 py-32 text-center">
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="text-4xl font-extrabold text-[#1f1c18] md:text-5xl whitespace-nowrap">
          Every delayed reply = a lost patient
        </h2>

        <p className="text-lg leading-relaxed text-[#635f53] md:text-xl">
          Patients message after hours and get no reply. Staff reply the next morning — but the patient already booked elsewhere. WhatsApp inquiries fall through the cracks. No-shows pile up because reminders never went out. You’re not losing patients because of demand. You’re losing them because nothing is running when your team isn’t.
        </p>

        <div className="flex flex-wrap justify-center gap-3 pt-4">
          {tags.map((item) => (
            <span
              key={item}
              className="rounded-full bg-[#f7dfe1] px-5 py-2 text-sm font-medium text-[#9d4b57]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}