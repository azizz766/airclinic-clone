const plans = [
  {
    name: "Starter",
    desc: "For small clinics getting started with automation",
    price: "$900",
    note: "/mo",
    highlight: "Recover 10–20 missed patients / month",
    features: [
      "Capture missed WhatsApp bookings",
      "Never miss a patient inquiry again",
      "Keep your clinic responsive 24/7",
      "1 clinic location",
    ],
    featured: false,
  },
  {
    name: "Growth",
    desc: "For clinics ready to scale bookings and reduce staff workload",
    price: "$2000",
    note: "/mo",
    highlight: "Recover 30–80 patients automatically",
    features: [
      "Capture missed WhatsApp bookings",
      "Reduce no-shows with automated reminders",
      "Reduce front-desk workload",
      "Keep your clinic responsive 24/7",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    desc: "Custom solutions for high volume clinics and multi-location groups",
    price: "Custom",
    note: "",
    highlight: "Scale operations across all locations",
    features: [
      "Never miss a patient inquiry again",
      "Reduce front-desk workload at scale",
      "Multi-location support",
      "Custom workflows & dedicated support",
    ],
    featured: false,
  },
]

export default function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
      
      {/* HEADER */}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
          
        </p>

        <h2 className="mb-3 text-3xl font-extrabold text-[#1c1c1c] md:text-4xl">
          Simple pricing for clinics
        </h2>

        <p className="text-base text-[#635f53]">
          Choose the plan that fits your clinic stage and booking volume.
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
            {plan.featured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#674db1] px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
              </div>
            )}

            {/* TOP */}
            <div className="mb-6">
              <h3 className="mb-1 text-xl font-bold">{plan.name}</h3>

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
                <span className="text-3xl font-extrabold">
                  {plan.price}
                </span>
                {plan.note && (
                  <span
                    className={
                      plan.featured
                        ? "text-white/60 text-sm"
                        : "text-[#635f53] text-sm"
                    }
                  >
                    {plan.note}
                  </span>
                )}
              </div>

              <p
                className={
                  plan.featured
                    ? "mt-3 text-xs font-semibold text-[#b095ff]"
                    : "mt-3 text-xs font-semibold text-[#674db1]"
                }
              >
                {plan.highlight}
              </p>
            </div>

            {/* FEATURES */}
            <ul className="mb-6 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm"
                >
                  <span
                    className={
                      plan.featured
                        ? "text-[#b095ff]"
                        : "text-[#674db1]"
                    }
                  >
                    •
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* BUTTON */}
            <button
              className={
                plan.featured
                  ? "w-full rounded-full bg-[#674db1] py-3 text-sm font-semibold text-white hover:opacity-90"
                  : "w-full rounded-full border border-[#1c1c1c] py-3 text-sm font-semibold text-[#1c1c1c] hover:bg-[#1c1c1c] hover:text-white"
              }
            >
              {plan.featured
                ? "See it book patients live"
                : plan.name === "Enterprise"
                ? "Contact Sales"
                : "Get Started"}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}