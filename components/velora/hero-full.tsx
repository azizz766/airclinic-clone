export default function HeroFull() {
  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-8 py-24 lg:grid-cols-2 lg:gap-24">
      <div className="space-y-8">
        <div className="inline-flex items-center rounded-full bg-primary-container px-4 py-2 text-sm font-semibold uppercase tracking-wide text-on-primary-container">
          WhatsApp AI Receptionist
        </div>

        <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight text-[#1f1c18] md:text-6xl">
          You’re losing patients on WhatsApp.
        </h1>

        <p className="max-w-2xl text-2xl font-extrabold text-[#674db1]">
          Turn every message into a confirmed booking — automatically.
        </p>

        <p className="max-w-lg text-xl leading-relaxed text-on-surface-variant">
          Most clinics reply too late — or not at all. Velora replies instantly, books automatically, and never misses a message.
        </p>

        <div className="flex flex-wrap gap-4">
                    <button style={{ backgroundColor: "#674db1" }} className="rounded-full px-8 py-4 text-lg font-bold text-white">
            Watch it handle a real booking
          </button>

          <button className="rounded-full bg-surface-container-high px-8 py-4 text-lg font-bold text-on-surface transition hover:bg-surface-variant">
            See how it works in 60 seconds
          </button>
        </div>

                <div className="flex items-center gap-4 text-xs font-medium text-on-surface-variant opacity-70">
           • Setup in under 24 hours 
           • No credit card required
        </div>
      </div>

      <div className="relative flex justify-center lg:justify-end">
  <div className="w-[340px] h-[640px] bg-[#e5ddd5] rounded-[2rem] overflow-hidden ambient-shadow flex flex-col relative border border-black/5 ring-1 ring-black/5">
    <div className="bg-[#075e54] text-white p-4 pt-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#9C89B8' }}
        >
          <span className="material-symbols-outlined text-white text-xl">smart_toy</span>
        </div>

        <div>
          <h4 className="font-bold text-[14px] leading-tight">Velora AI Receptionist</h4>
          <p className="text-[11px] text-white/80"> Online</p>
        </div>
      </div>

      <div className="flex gap-4">
        <span className="material-symbols-outlined text-xl opacity-80">videocam</span>
        <span className="material-symbols-outlined text-xl opacity-80">call</span>
      </div>
    </div>

    <div
      className="flex-1 overflow-y-auto p-4 space-y-2 !space-y-1"
      style={{
        backgroundImage:
          'url("https://lh3.googleusercontent.com/aida/ADBb0uicbQo9GNZXVi_MdW50yKySqG5Kq2ADFKMd3HA9nRN1e-7L8gJ6LubVtGIsIZatAf2sBWSgQ3hRiVvqTYWHnSFSEGB-4Csa1Z_U8-b-9KwbDDoBOFPm4oz_CNCqfW73j6W--2jK5yFVsSADEuO7hAQ28yKNxuBvw20AqEUcapTWXVKB6Vb7oQt3a2zDOVfSYuz0P1U_jLvV8LIgcl3heiA-TKMPfm7CWvxCXyJHq7-m0wiCLJliYhvfbkPv8Q0SidcxZimnQ76LXLU")',
        backgroundRepeat: 'repeat',
        backgroundSize: '320px auto',
        backgroundColor: '#f1ebe1',
        backgroundBlendMode: 'multiply',
      }}
    >
      <div className="flex justify-start">
        <div className="relative bg-white text-[#303030] px-4 py-2.5 rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug shadow-md !py-1.5 !px-3 shadow-sm border border-black/5">
          Hi! I&apos;d like to book a teeth cleaning for this Thursday afternoon if possible?
          <div className="text-[10px] text-black/40 text-right mt-1">10:42 AM</div>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="relative bg-[#e1ffc7] text-[#303030] px-4 py-2.5 rounded-lg rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug shadow-md !py-1.5 !px-3 shadow-sm border border-black/5">
          Hi Sarah! Let me check Dr. Aris&apos;s schedule for Thursday. 🦷
          <br />
          <br />
          We have two spots: 2:30 PM or 4:15 PM. Which one works best for you?
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-black/40">10:43 AM</span>
            <span className="material-symbols-outlined text-[16px] text-[#4fc3f7]">done_all</span>
          </div>
        </div>
      </div>

      <div className="flex justify-start">
        <div className="relative bg-white text-[#303030] px-4 py-2.5 rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug shadow-md !py-1.5 !px-3 shadow-sm border border-black/5">
          4:15 PM is perfect!
          <div className="text-[10px] text-black/40 text-right mt-1">10:44 AM</div>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="relative bg-[#e1ffc7] text-[#303030] px-4 py-2.5 rounded-lg rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug shadow-md !py-1.5 !px-3 shadow-sm border border-black/5">
          Done! You&apos;re booked for Thursday, Oct 24th at 4:15 PM. ✨
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-black/40">10:44 AM</span>
            <span className="material-symbols-outlined text-[16px] text-[#4fc3f7]">done_all</span>
          </div>
        </div>
      </div>
    </div>

    <div className="p-3 bg-[#f0f2f5] flex items-center gap-2 shrink-0">
      <div className="flex-1 bg-white rounded-full px-5 py-2.5 text-[13px] text-on-surface-variant shadow-sm border border-black/5">
        Type a message...
      </div>

      <div className="w-10 h-10 rounded-full bg-[#128c7e] flex items-center justify-center text-white shadow-md">
        <span className="material-symbols-outlined text-xl">mic</span>
      </div>
    </div>
  </div>
</div>
</section>
  )
}