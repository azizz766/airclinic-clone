import Link from "next/link"

export default function HeroFull() {
  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-8 py-24 lg:grid-cols-2 lg:gap-24">
      <div className="space-y-8">
        <div className="inline-flex items-center rounded-full bg-primary-container px-4 py-2 text-sm font-semibold uppercase tracking-wide text-on-primary-container">
          WhatsApp AI Receptionist
        </div>

        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight text-[#1f1c18] md:text-6xl">
          Your clinic is losing bookings on WhatsApp.
          <br />
          Even after hours.
        </h1>

        <p className="max-w-2xl text-2xl font-extrabold text-[#674db1]">
          Velora is a 24/7 WhatsApp receptionist that replies instantly, books appointments, reduces no-shows, and follows up with patients automatically.
        </p>

        <p className="max-w-lg text-xl leading-relaxed text-on-surface-variant">
          Most clinics miss bookings when staff are busy, offline, or closed. Velora keeps your WhatsApp active 24/7 — so every message gets handled before it becomes a lost patient.
        </p>

        <div className="flex flex-wrap gap-4">
          <Link href="/start-free-trial">
            <button
              style={{ backgroundColor: "#674db1" }}
              className="rounded-full px-8 py-4 text-lg font-bold text-white"
            >
              Try it on WhatsApp
            </button>
          </Link>

          <button className="rounded-full bg-surface-container-high px-8 py-4 text-lg font-bold text-on-surface transition hover:bg-surface-variant">
            See how it works in 30 seconds
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-on-surface-variant opacity-70">
          • Setup in under 24 hours • No credit card required
        </div>
      </div>

      <div className="relative flex justify-center lg:justify-end">
        <div className="ambient-shadow relative flex h-[640px] w-[340px] flex-col overflow-hidden rounded-[2rem] border border-black/5 bg-[#e5ddd5] ring-1 ring-black/5">
          <div className="flex shrink-0 items-center justify-between bg-[#075e54] p-4 pt-6 text-white">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "#9C89B8" }}
              >
                <span className="material-symbols-outlined text-xl text-white">
                  smart_toy
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold leading-tight">
                  Velora AI Receptionist
                </h4>
                <p className="text-[11px] text-white/80">Online</p>
              </div>
            </div>

            <div className="flex gap-4">
              <span className="material-symbols-outlined text-xl opacity-80">
                videocam
              </span>
              <span className="material-symbols-outlined text-xl opacity-80">
                call
              </span>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 !space-y-1 space-y-2"
            style={{
              backgroundImage:
                'url("https://lh3.googleusercontent.com/aida/ADBb0uicbQo9GNZXVi_MdW50yKySqG5Kq2ADFKMd3HA9nRN1e-7L8gJ6LubVtGIsIZatAf2sBWSgQ3hRiVvqTYWHnSFSEGB-4Csa1Z_U8-b-9KwbDDoBOFPm4oz_CNCqfW73j6W--2jK5yFVsSADEuO7hAQ28yKNxuBvw20AqEUcapTWXVKB6Vb7oQt3a2zDOVfSYuz0P1U_jLvV8LIgcl3heiA-TKMPfm7CWvxCXyJHq7-m0wiCLJliYhvfbkPv8Q0SidcxZimnQ76LXLU")',
              backgroundRepeat: "repeat",
              backgroundSize: "320px auto",
              backgroundColor: "#f1ebe1",
              backgroundBlendMode: "multiply",
            }}
          >
            <div className="flex justify-start">
              <div className="relative max-w-[85%] rounded-lg rounded-tl-none border border-black/5 bg-white px-3 py-1.5 text-[13px] text-[#303030] shadow-sm">
                Hi, I’d like to book a teeth cleaning tomorrow.
                <div className="mt-1 text-right text-[10px] text-black/40">
                  10:42 AM
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="relative max-w-[85%] rounded-lg rounded-tr-none border border-black/5 bg-[#e1ffc7] px-3 py-1.5 text-[13px] text-[#303030] shadow-sm">
                Sure, I found these available times for tomorrow: 🦷
                <br />
                1. 3:00 PM
                <br />
                2. 5:15 PM
                <br />
                3. 7:00 PM
                  <br />
                  <br />
                  Reply with the number that works best.
                <div className="mt-1 flex items-center justify-end gap-1">
                  <span className="text-[10px] text-black/40">10:43 AM</span>
                  <span className="material-symbols-outlined text-[16px] text-[#4fc3f7]">
                    done_all
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-start">
              <div className="relative max-w-[85%] rounded-lg rounded-tl-none border border-black/5 bg-white px-3 py-1.5 text-[13px] text-[#303030] shadow-sm">
                2
                <div className="mt-1 text-right text-[10px] text-black/40">
                  10:43 AM
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="relative max-w-[85%] rounded-lg rounded-tr-none border border-black/5 bg-[#e1ffc7] px-3 py-1.5 text-[13px] text-[#303030] shadow-sm">
                Booked. Your appointment is confirmed for tomorrow at 5:15 PM ✨
                <br />
                We’ll send a reminder before your visit.
                <div className="mt-1 flex items-center justify-end gap-1">
                  <span className="text-[10px] text-black/40">10:44 AM</span>
                  <span className="material-symbols-outlined text-[16px] text-[#4fc3f7]">
                    done_all
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 bg-[#f0f2f5] p-3">
            <div className="flex-1 rounded-full border border-black/5 bg-white px-5 py-2.5 text-[13px] text-on-surface-variant shadow-sm">
              Type a message...
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#128c7e] text-white shadow-md">
              <span className="material-symbols-outlined text-xl">mic</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}