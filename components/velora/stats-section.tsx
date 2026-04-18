const stats = [
  {
    label: "Availability",
    value: "24/7",
    sub: "Booking availability",
    cardClass: "bg-[#d9ccff]",
    textClass: "text-[#2e0877]",
  },
  {
    label: "Speed",
    value: "< 3 sec",
    sub: "Average response time",
    cardClass: "bg-[#ffdbcd]",
    textClass: "text-[#7b432a]",
  },
  {
    label: "Growth",
    value: "+30%",
    sub: "More confirmed bookings",
    cardClass: "bg-[#d7e7ff]",
    textClass: "text-[#103d6f]",
  },
  {
    label: "Reliability",
    value: "100%",
    sub: "missed patient inquiries",
    cardClass: "bg-[#e8f5e9]",
    textClass: "text-[#166534]",
  },
]

export default function StatsSection() {
  return (
    <section className="mx-auto max-w-7xl px-8 pb-32">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.cardClass} flex h-52 flex-col justify-between rounded-[2rem] p-8 shadow-sm`}
          >
            <span className={`text-sm font-bold uppercase tracking-[0.18em] opacity-60 ${stat.textClass}`}>
              {stat.label}
            </span>

            <div className={`text-5xl font-extrabold ${stat.textClass}`}>
              {stat.value}
            </div>

            <span className={`text-sm font-medium ${stat.textClass}`}>
              {stat.sub}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}