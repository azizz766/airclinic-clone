export default function UseCasesSection() {
  return (
    <section id="use-cases" className="scroll-mt-32 mx-auto max-w-6xl px-8 py-24">
      <h2 className="mb-10 text-3xl font-extrabold text-[#1c1c1c] md:text-5xl">
        Built for clinics. Expanding to everything that books.
      </h2>

      <div className="space-y-4 w-full">
        <div className="flex w-full items-center justify-between rounded-[1.5rem] border border-[#674db1] bg-white px-6 py-5 min-h-[88px] shadow-[0_0_0_2px_rgba(103,77,177,0.15)]">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-[26px] leading-none text-[#674db1]">
              dentistry
            </span>

            <div>
              <p className="font-semibold text-[#1c1c1c]">Dental Clinics</p>
              <p className="text-sm text-[#6b665c]">
                Optimized for dental workflows, emergency consultations, and routine hygiene bookings.
              </p>
            </div>
          </div>

          <span className="inline-flex w-[112px] justify-center rounded-[0.5rem] bg-[#674db1]/10 px-4 py-1 text-center text-xs font-semibold text-[#674db1]">
            Live now
          </span>
        </div>

        {[
          {
            title: "Hair Salons",
            desc: "Automated scheduling for stylists, color treatments, and barber services.",
            icon: "content_cut",
          },
          {
            title: "Nail & Beauty",
            desc: "Manage high-volume bookings for manicures, lash extensions, and facials.",
            icon: "auto_awesome",
          },
          {
            title: "Medical Centers",
            desc: "Streamlining triage and appointments for general practice and specialists.",
            icon: "medical_services",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex w-full items-center justify-between rounded-[1.5rem] border border-black/10 bg-white px-6 py-5 min-h-[88px]"
          >
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-[24px] leading-none text-[#674db1]">
                {item.icon}
              </span>

              <div>
                <p className="font-semibold text-[#1c1c1c]">{item.title}</p>
                <p className="text-sm text-[#6b665c]">{item.desc}</p>
              </div>
            </div>

            <span className="inline-flex w-[112px] justify-center rounded-[0.5rem] bg-black/5 px-4 py-1 text-center text-xs text-gray-500">
              Coming soon
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}