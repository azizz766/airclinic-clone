export default function ProblemSection() {
  const tags = [
    "Slow replies",
    "Missed inquiries",
    "Manual follow-ups",
    "Lost bookings",
    "Front desk overload",
  ]

  return (
    <section id="outcomes" className="mx-auto max-w-7xl px-8 py-32 text-center">
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="text-4xl font-extrabold text-[#1f1c18] md:text-5xl whitespace-nowrap">
          Every delayed reply = a lost patient
        </h2>

        <p className="text-lg leading-relaxed text-[#635f53] md:text-xl">
          Patients don’t wait. They message multiple clinics — and go with whoever replies first.
          You’re not losing leads because of demand. You’re losing them because of response time.
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