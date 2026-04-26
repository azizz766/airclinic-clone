const plans = [
  {
    name: "Starter",
    label: null,
    headline: "Never miss a WhatsApp booking again",
    desc: "Velora replies instantly, captures every inquiry, and turns interest into confirmed bookings.",
    price: "1,500 SAR",
    note: "/ month",
    whatImproves: [
      "No missed WhatsApp messages after hours",
      "More patients converted from inquiries",
      "Less pressure on your front desk",
    ],
    features: [
      "24/7 WhatsApp replies",
      "Appointment booking",
      "Cancel / reschedule",
      "Lead capture",
      "Booking confirmations",
      "Staff inbox",
      "Basic human handoff",
    ],
    limits: ["1 location", "2 users", "50 conversations / month"],
    cta: "Start Free Trial",
    featured: false,
  },
  {
    name: "Growth",
    label: "Most Popular",
    headline: "Turn WhatsApp into a consistent revenue channel",
    desc: "Go beyond replying — actively drive bookings, reduce no-shows, and recover lost patients.",
    price: "3,500 SAR",
    note: "/ month",
    whatImproves: [
      "More confirmed bookings every week",
      "Fewer missed appointments",
      "Higher patient return rate",
      "Less manual follow-up from staff",
    ],
    features: [
      "Everything in Starter",
      "150 conversations / month",
      "Up to 2 locations",
      "Up to 4 users",
      "Automated appointment reminders",
      "No-show reduction",
      "Patient follow-ups",
      "Abandoned chat recovery",
      "Rebooking prompts",
      "Smart nudging to book",
      "Slot optimization",
      "Booking & performance analytics",
      "Priority support (4–12h)",
    ],
    limits: [],
    cta: "Start Growing Bookings",
    featured: true,
  },
  {
    name: "Enterprise",
    label: null,
    headline: "Built for multi-location clinics and groups",
    desc: "Full control, custom workflows, and complete visibility across your operations.",
    price: "12,000+ SAR",
    note: "/ month",
    whatImproves: [
      "Centralized booking across all locations",
      "Clear revenue visibility from WhatsApp",
      "Fully tailored workflows to match your operations",
    ],
    features: [
      "Everything in Growth",
      "Custom / fair-use conversations",
      "Custom locations & users",
      "Advanced analytics",
      "Revenue tracking",
      "Custom workflows",
      "API access & system integrations",
      "SLA support",
      "Dedicated onboarding",
      "Account manager",
    ],
    limits: [],
    cta: "Talk to Sales",
    featured: false,
  },
]

export default function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">

      {/* HEADER */}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="mb-3 text-3xl font-extrabold text-[#1c1c1c] md:text-4xl">
          Turn WhatsApp into a daily booking engine — not just a chat
        </h2>
        <p className="text-base text-[#635f53]">
          Capture every patient, increase bookings, and reduce no-shows — without adding more front-desk work.
        </p>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={
              plan.featured
                ? "relative flex flex-col rounded-[1.75rem] bg-[#2a2621] p-7 text-white shadow-xl"
                : "flex flex-col rounded-[1.75rem] border border-black/5 bg-white p-7 shadow-sm"
            }
          >
            {/* LABEL */}
            {plan.featured && plan.label && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#674db1] px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
                {plan.label}
              </div>
            )}

            {/* TOP */}
            <div className="mb-5">
              <p
                className={
                  plan.featured
                    ? "mb-0.5 text-xs font-semibold uppercase tracking-widest text-white/50"
                    : "mb-0.5 text-xs font-semibold uppercase tracking-widest text-[#9b9690]"
                }
              >
                {plan.name}
              </p>

              <h3 className="mb-2 text-lg font-bold leading-snug">
                {plan.headline}
              </h3>

              <p
                className={
                  plan.featured
                    ? "mb-4 text-sm text-white/70"
                    : "mb-4 text-sm text-[#635f53]"
                }
              >
                {plan.desc}
              </p>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold">{plan.price}</span>
                {plan.note && (
                  <span
                    className={
                      plan.featured ? "text-sm text-white/60" : "text-sm text-[#635f53]"
                    }
                  >
                    {plan.note}
                  </span>
                )}
              </div>
            </div>

            {/* WHAT IMPROVES */}
            <div className="mb-4">
              <p
                className={
                  plan.featured
                    ? "mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#b095ff]"
                    : "mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#674db1]"
                }
              >
                What improves
              </p>
              <ul className="space-y-1.5">
                {plan.whatImproves.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <span className={plan.featured ? "text-[#b095ff]" : "text-[#674db1]"}>
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* INCLUDES */}
            <div className="mb-4 flex-1">
              <p
                className={
                  plan.featured
                    ? "mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/50"
                    : "mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#9b9690]"
                }
              >
                Includes
              </p>
              <ul className="space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <span className={plan.featured ? "text-white/40" : "text-black/30"}>
                      •
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* LIMITS */}
            {plan.limits.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#9b9690]">
                  Limits
                </p>
                <ul className="space-y-1">
                  {plan.limits.map((limit) => (
                    <li key={limit} className="text-xs text-[#9b9690]">
                      {limit}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* BUTTON */}
            <button
              className={
                plan.featured
                  ? "w-full rounded-full bg-[#674db1] py-3 text-sm font-semibold text-white hover:opacity-90"
                  : "w-full rounded-full border border-[#1c1c1c] py-3 text-sm font-semibold text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white"
              }
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* SETUP FEE NOTE */}
      <p className="mt-8 text-center text-xs text-[#9b9690]">
        One-time setup: 1,500 – 3,000 SAR &nbsp;·&nbsp; Covers full clinic setup, WhatsApp configuration, services, scheduling, and team onboarding.
      </p>
    </section>
  )
}
