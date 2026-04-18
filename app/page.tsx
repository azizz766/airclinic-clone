'use client'

export default function VeloraLanding() {
  return (
    <div className="bg-surface selection:bg-primary-container selection:text-on-primary-container">

      {/* ── Top Nav ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-8 py-4 max-w-full bg-[#fff9ef] dark:bg-stone-950 border-b border-[#363228]/10">
        <div className="flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-primary text-3xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
          <div className="text-2xl tracking-tight text-[#363228] dark:text-[#f9f3e7]">
            <span className="font-bold">Velora</span>
            <span className="font-extrabold text-[#9C89B8]"> AI</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-10">
          <a className="text-primary dark:text-[#b095ff] font-semibold border-b-2 border-primary transition-colors duration-300" href="#">How it works</a>
          <a className="text-[#363228] dark:text-[#f9f3e7] opacity-80 hover:opacity-100 transition-colors duration-300" href="#">Benefits</a>
          <a className="text-[#363228] dark:text-[#f9f3e7] opacity-80 hover:opacity-100 transition-colors duration-300" href="#">Pricing</a>
        </div>
        <button className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-semibold hover:opacity-90 active:scale-95 transition-all">
          Book a Demo
        </button>
      </nav>

      <main className="pt-24">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-8 py-20 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-sm font-semibold tracking-wide uppercase">
              WhatsApp AI Receptionist
            </div>
            <h1 className="text-6xl font-extrabold text-on-surface leading-[1.1] tracking-tight">
              You&apos;re losing patients on WhatsApp.
            </h1>
            <p className="text-xl text-on-surface-variant max-w-lg leading-relaxed">
              Most clinics reply too late — or not at all. Velora replies instantly, books automatically, and never misses a message.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="bg-primary text-on-primary px-8 py-4 rounded-full text-lg font-bold hover:shadow-lg transition-all active:scale-95">
                Watch it book a patient live
              </button>
              <button className="bg-surface-container-high text-on-surface px-8 py-4 rounded-full text-lg font-bold hover:bg-surface-variant transition-all">
                See how it works
              </button>
            </div>
            <div className="flex items-center gap-4 text-on-surface-variant opacity-70">
              <div className="flex -space-x-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="office manager" className="w-8 h-8 rounded-full border-2 border-surface" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDCsMj1O9N-eTMzQ0uzUT_K-DRKtpMIFHLaW5nhSZcDCDt36PkyE-2EnulIATKgQWsWMLSBJZ0z8VEdeaK0xvc__HAUg5zF8X5XpDHqZS1MJNQ5XlstiW5qyW5koYXTpuqAoNfDJtEKf-Z_5Lh0-0akJUZRvCmThmEDBCFUD5Dz3l_x8AZr6nGggmBAycKfYv4-GloZ26p285W2jIlnmRnQtFJxh_8QXHtbior2AJHcmBhXTpZJcPSbXsPp-ybonlMIqh6nkGhTLkbH" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="healthcare professional" className="w-8 h-8 rounded-full border-2 border-surface" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBfzklfuN0v3LsKzDkOjK4Q2un3PpSBCrfNVuVp03aS-yyJ5BDQq_vEx6w5SGuJ2PUj4klyLXZJ1fcrWEeWot8WAveZgbJPggW3J5WsLu-ED15cF4Z4tgqdT9wEQCFoWOeLHrWa48YN7UYnhEtfnDBbf34wJWgU3e2Oid7faud6fweIHhIQGg46apvOGoaGflE4pyvbigrsg98WxWRCEb-yQ9LtqgiTC3BhNneIVGsdMsv8JdvCf1cICIFFkchlHTZ4mXGEMYmWjOae" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="dentist" className="w-8 h-8 rounded-full border-2 border-surface" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAAerFUlCNyS3RBUNXflh9uq5kov4QJ3sZA4cUxLNzO_ALIdisXfJnD9rEXxbUYdDkMzn3kndSVepgobb9tBz2J6ojarkTCSurFgH9jAOhgFeJx_hQvJYjQgxn0N3cwDcNr-bbbq54QpAwIJdwHLZP8e3IJ-KPFptG-507BNwPIjonYq_IeRSEwV22xx7XzQmR0fBK6BljUvQh2OrfjkmW-96XStk2-2z_6CFzgsAnJmDc8qryr1U9YVs4hbOBWKy3Xl-BYlTz4X8lM" />
              </div>
              <span className="text-xs font-medium">Trusted by 200+ clinics • Setup in under 24 hours • No credit card required</span>
            </div>
          </div>

          {/* WhatsApp Mockup */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="w-[340px] h-[640px] bg-[#e5ddd5] rounded-[2rem] overflow-hidden ambient-shadow flex flex-col relative border border-black/5 ring-1 ring-black/5">
              {/* Header */}
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
                    <p className="text-[11px] text-white/80">Active &amp; Online</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="material-symbols-outlined text-xl opacity-80">videocam</span>
                  <span className="material-symbols-outlined text-xl opacity-80">call</span>
                </div>
              </div>

              {/* Chat Area */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4"
                style={{
                  backgroundImage: 'url("https://lh3.googleusercontent.com/aida/ADBb0uicbQo9GNZXVi_MdW50yKySqG5Kq2ADFKMd3HA9nRN1e-7L8gJ6LubVtGIsIZatAf2sBWSgQ3hRiVvqTYWHnSFSEGB-4Csa1Z_U8-b-9KwbDDoBOFPm4oz_CNCqfW73j6W--2jK5yFVsSADEuO7hAQ28yKNxuBvw20AqEUcapTWXVKB6Vb7oQt3a2zDOVfSYuz0P1U_jLvV8LIgcl3heiA-TKMPfm7CWvxCXyJHq7-m0wiCLJliYhvfbkPv8Q0SidcxZimnQ76LXLU")',
                  backgroundRepeat: 'repeat',
                  backgroundSize: '320px auto',
                  backgroundColor: '#f1ebe1',
                  backgroundBlendMode: 'multiply',
                }}
              >
                {/* Patient bubble */}
                <div className="flex justify-start">
                  <div className="relative bg-white text-[#303030] px-4 py-2.5 rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug">
                    Hi! I&apos;d like to book a teeth cleaning for this Thursday afternoon if possible?
                    <div className="text-[10px] text-black/40 text-right mt-1">10:42 AM</div>
                  </div>
                </div>
                {/* AI bubble */}
                <div className="flex justify-end">
                  <div className="relative bg-[#e1ffc7] text-[#303030] px-4 py-2.5 rounded-lg rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug">
                    Hi Sarah! Let me check Dr. Aris&apos;s schedule for Thursday. 🦷
                    <br /><br />
                    We have two spots: 2:30 PM or 4:15 PM. Which one works best for you?
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-black/40">10:43 AM</span>
                      <span className="material-symbols-outlined text-[16px] text-[#4fc3f7]">done_all</span>
                    </div>
                  </div>
                </div>
                {/* Patient bubble */}
                <div className="flex justify-start">
                  <div className="relative bg-white text-[#303030] px-4 py-2.5 rounded-lg rounded-tl-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug">
                    4:15 PM is perfect!
                    <div className="text-[10px] text-black/40 text-right mt-1">10:44 AM</div>
                  </div>
                </div>
                {/* AI bubble */}
                <div className="flex justify-end">
                  <div className="relative bg-[#e1ffc7] text-[#303030] px-4 py-2.5 rounded-lg rounded-tr-none shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[85%] text-[13px] leading-snug">
                    Done! You&apos;re booked for Thursday, Oct 24th at 4:15 PM. ✨
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-black/40">10:44 AM</span>
                      <span className="material-symbols-outlined text-[16px] text-[#4fc3f7]">done_all</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Area */}
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

        {/* ── Stats Row ────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-primary-container/30 p-8 rounded-lg flex flex-col justify-between h-48">
              <span className="text-sm font-bold uppercase tracking-widest text-on-primary-container opacity-60">Availability</span>
              <div className="text-4xl font-extrabold text-on-primary-container">24/7</div>
              <span className="text-xs font-medium text-on-primary-container">Booking availability</span>
            </div>
            <div className="bg-secondary-container/50 p-8 rounded-lg flex flex-col justify-between h-48">
              <span className="text-sm font-bold uppercase tracking-widest text-on-secondary-container opacity-60">Speed</span>
              <div className="text-4xl font-extrabold text-on-secondary-container">&lt; 3 sec</div>
              <span className="text-xs font-medium text-on-secondary-container">Average response time</span>
            </div>
            <div className="bg-tertiary-container/30 p-8 rounded-lg flex flex-col justify-between h-48">
              <span className="text-sm font-bold uppercase tracking-widest text-on-tertiary-container opacity-60">Growth</span>
              <div className="text-4xl font-extrabold text-on-tertiary-container">+30%</div>
              <span className="text-xs font-medium text-on-tertiary-container">More confirmed bookings</span>
            </div>
            <div className="bg-[#e8f5e9] p-8 rounded-lg flex flex-col justify-between h-48">
              <span className="text-sm font-bold uppercase tracking-widest text-green-800 opacity-60">Reliability</span>
              <div className="text-4xl font-extrabold text-green-800">0</div>
              <span className="text-xs font-medium text-green-800">missed Patient inquiries</span>
            </div>
          </div>
        </section>

        {/* ── Problem & Solutions ───────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-8 py-32 space-y-20">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <h2 className="text-4xl font-extrabold text-on-surface">Every delayed reply = a lost patient.</h2>
            <p className="text-xl text-on-surface-variant leading-relaxed">
              Patients don&apos;t wait. They message multiple clinics — and go with whoever replies first. You&apos;re not losing leads because of demand. You&apos;re losing them because of response time.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <span className="px-6 py-2 rounded-full bg-error-container/20 text-error-dim font-medium text-sm">Slow replies</span>
              <span className="px-6 py-2 rounded-full bg-error-container/20 text-error-dim font-medium text-sm">Missed inquiries</span>
              <span className="px-6 py-2 rounded-full bg-error-container/20 text-error-dim font-medium text-sm">Manual follow-ups</span>
              <span className="px-6 py-2 rounded-full bg-error-container/20 text-error-dim font-medium text-sm">Lost bookings</span>
              <span className="px-6 py-2 rounded-full bg-error-container/20 text-error-dim font-medium text-sm">Front desk overload</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-surface-container-low p-12 rounded-xl flex flex-col gap-8">
              <div className="space-y-4">
                <h2 className="text-3xl font-extrabold">Velora handles the conversation — and closes the booking.</h2>
                <p className="text-on-surface-variant leading-relaxed text-lg">
                  It works inside your WhatsApp like a real receptionist, but faster and always on.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  'Replies instantly',
                  'Understands booking intent',
                  'Collects patient details',
                  'Shows available slots',
                  'Confirms automatically',
                  'Escalates when needed',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                    <span className="font-medium text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface-container-low p-12 rounded-xl flex flex-col gap-6 justify-center items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                <span className="material-symbols-outlined text-5xl" data-weight="fill">bolt</span>
              </div>
              <h3 className="text-2xl font-bold">Instant Activation</h3>
              <p className="text-on-surface-variant leading-relaxed">Get Velora running on your existing WhatsApp Business number in less than 24 hours. No technical team required.</p>
            </div>
          </div>
        </section>

        {/* ── How It Works ─────────────────────────────────────────────────── */}
        <section className="bg-surface-container-low py-32">
          <div className="max-w-7xl mx-auto px-8">
            <h2 className="text-4xl font-extrabold text-center mb-20">From message to confirmed booking — automatically</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
              {[
                { n: 1, icon: 'chat',                 title: 'Patient sends a message',  desc: 'They text your business WhatsApp for an appointment.' },
                { n: 2, icon: 'neurology',            title: 'Velora understands intent', desc: 'The AI identifies the request and scans your live calendar.' },
                { n: 3, icon: 'calendar_month',       title: 'Suggests slots',            desc: 'Available times are offered for the patient to choose from.' },
                { n: 4, icon: 'check_circle',         title: 'Confirms instantly',        desc: 'The appointment is secured in your system without human help.' },
                { n: 5, icon: 'notifications_active', title: 'Revenue Recovery',          desc: 'Automatic follow-ups and reminders ensure high show-up rates.', badge: true },
              ].map(({ n, icon, title, desc, badge }) => (
                <div
                  key={n}
                  className={`bg-surface-container-lowest p-8 rounded-lg ambient-shadow relative overflow-hidden group${badge ? ' ring-2 ring-primary/20' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-lg mb-6 shadow-md relative z-10">{n}</div>
                  <span
                    className="material-symbols-outlined text-primary mb-6 text-3xl block"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {icon}
                  </span>
                  <h4 className="font-bold mb-2 text-lg">{title}</h4>
                  <p className="text-sm text-on-surface-variant">{desc}</p>
                  {badge && (
                    <div className="absolute bottom-0 right-0 p-2 bg-primary/5 rounded-tl-[32px]">
                      <span className="text-[10px] font-bold text-primary uppercase">Revenue feature</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Benefits Grid ─────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-8 py-32">
          <h2 className="text-4xl font-extrabold text-center mb-20">Why clinics switch to Velora</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-primary-container/20 p-10 rounded-xl hover:bg-primary-container/30 transition-all cursor-default benefit-card-shadow">
              <h4 className="text-xl font-bold mb-4">Never miss a booking</h4>
              <p className="text-on-surface-variant text-sm">Every patient gets a reply — even after hours. No more lost inquiries at night.</p>
            </div>
            <div className="bg-secondary-container/25 p-10 rounded-xl hover:bg-secondary-container/35 transition-all cursor-default benefit-card-shadow">
              <h4 className="text-xl font-bold mb-4">Reduce front desk workload</h4>
              <p className="text-on-surface-variant text-sm">No more repetitive WhatsApp replies. Free your team for in-person care.</p>
            </div>
            <div className="bg-tertiary-container/20 p-10 rounded-xl hover:bg-tertiary-container/30 transition-all cursor-default benefit-card-shadow">
              <h4 className="text-xl font-bold mb-4">Increase confirmed bookings</h4>
              <p className="text-on-surface-variant text-sm">Turn conversations into real revenue by booking patients while they&apos;re most interested.</p>
            </div>
            <div className="bg-primary-container/20 p-10 rounded-xl hover:bg-primary-container/30 transition-all cursor-default benefit-card-shadow">
              <h4 className="text-xl font-bold mb-4">Available 24/7</h4>
              <p className="text-on-surface-variant text-sm">Patients can book anytime, anywhere. Velora never takes a day off.</p>
            </div>
            <div className="bg-secondary-container/25 p-10 rounded-xl hover:bg-secondary-container/35 transition-all cursor-default benefit-card-shadow">
              <h4 className="text-xl font-bold mb-4">Smart escalation</h4>
              <p className="text-on-surface-variant text-sm">Only involve staff when needed. Complex cases are handed over with full context.</p>
            </div>
            <div className="bg-tertiary-container/20 p-10 rounded-xl hover:bg-tertiary-container/30 transition-all cursor-default benefit-card-shadow">
              <h4 className="text-xl font-bold mb-4">Works inside WhatsApp</h4>
              <p className="text-on-surface-variant text-sm">No new apps. No friction. Patients book on the platform they already love and use.</p>
            </div>
          </div>
        </section>

        {/* ── Use Cases & Differentiation ──────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-8 py-32 grid grid-cols-1 lg:grid-cols-2 gap-24 items-start">

          {/* Left: Use Cases */}
          <div className="space-y-10">
            <h2 className="text-4xl font-extrabold text-left">Built for clinics. Expanding to everything that books.</h2>
            <div className="flex flex-col gap-6 w-full">

              <div className="bg-surface-container-lowest p-8 rounded-xl border-2 border-primary ambient-shadow w-full h-[180px] flex flex-col justify-center text-left">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-primary text-3xl">dentistry</span>
                    <h4 className="text-2xl font-bold">Dental Clinics</h4>
                  </div>
                  <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold">Live now</span>
                </div>
                <p className="text-on-surface-variant text-sm">Optimized for dental workflows, emergency consultations, and routine hygiene bookings.</p>
              </div>

              {[
                { icon: 'content_cut',     color: 'text-secondary',             name: 'Hair Salons',     desc: 'Automated scheduling for stylists, color treatments, and barber services.' },
                { icon: 'brush',           color: 'text-tertiary',              name: 'Nail & Beauty',   desc: 'Manage high-volume bookings for manicures, lash extensions, and facials.' },
                { icon: 'medical_services',color: 'text-on-tertiary-container', name: 'Medical Centers', desc: 'Streamlining triage and appointments for general practice and specialists.' },
                { icon: 'spa',             color: 'text-primary',               name: 'Wellness & Spa',  desc: 'Seamless booking for massages, therapy sessions, and yoga classes.' },
              ].map(({ icon, color, name, desc }) => (
                <div key={name} className="bg-surface-container-lowest p-8 rounded-xl border border-black/5 ambient-shadow w-full h-[180px] flex flex-col justify-center text-left">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <span className={`material-symbols-outlined ${color} text-3xl`}>{icon}</span>
                      <h4 className="text-2xl font-bold">{name}</h4>
                    </div>
                    <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant rounded-full text-xs font-semibold opacity-60">Coming soon</span>
                  </div>
                  <p className="text-on-surface-variant text-sm">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Differentiators */}
          <div className="space-y-10">
            <h2 className="text-4xl font-extrabold">Not a chatbot. A booking system.</h2>
            <div className="flex flex-col gap-6 w-full">

              <div className="bg-secondary-container/20 p-8 rounded-xl border border-secondary/10 ambient-shadow w-full h-[180px] flex flex-col justify-center text-left">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                    <span className="material-symbols-outlined text-3xl">calendar_today</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary opacity-70">Core Engine</span>
                    <h4 className="text-xl font-bold">Handles real booking flows</h4>
                  </div>
                </div>
                <p className="text-on-surface-variant text-sm">Beyond simple replies, Velora manages the entire scheduling logic, checking availability and securing slots.</p>
              </div>

              {[
                { icon: 'edit_calendar', color: 'text-tertiary',              bg: 'bg-tertiary/10',              hover: 'group-hover:bg-tertiary/20',              title: 'Rescheduling & Cancellations', desc: 'Allows patients to manage their existing appointments via chat without calling your desk.' },
                { icon: 'psychology',    color: 'text-primary',               bg: 'bg-primary/10',               hover: 'group-hover:bg-primary/20',               title: 'Intent Understanding',         desc: 'Advanced NLP that understands medical context, not just simple keywords or commands.' },
                { icon: 'support_agent', color: 'text-secondary',             bg: 'bg-secondary/10',             hover: 'group-hover:bg-secondary/20',             title: 'Human Escalation Logic',       desc: 'Intelligently identifies when a human needs to step in for complex patient inquiries.' },
                { icon: 'database',      color: 'text-on-tertiary-container', bg: 'bg-on-tertiary-container/10', hover: 'group-hover:bg-on-tertiary-container/20', title: 'Captures Structured Data',     desc: 'Automatically syncs patient info, preferences, and visit history into your CRM or PMS.' },
              ].map(({ icon, color, bg, hover, title, desc }) => (
                <div key={title} className="bg-surface-container-lowest p-8 rounded-xl border border-black/5 ambient-shadow w-full h-[180px] flex flex-col justify-center text-left hover:bg-surface-container-low transition-colors group">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-lg ${bg} flex items-center justify-center ${color} ${hover}`}>
                      <span className="material-symbols-outlined text-3xl">{icon}</span>
                    </div>
                    <h4 className="text-xl font-bold">{title}</h4>
                  </div>
                  <p className="text-on-surface-variant text-sm">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-8 mb-32">
          <div className="bg-on-surface rounded-xl p-16 text-center space-y-8 relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-full opacity-10"
              style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, var(--primary) 0%, transparent 40%), radial-gradient(circle at 80% 70%, var(--secondary) 0%, transparent 40%)' }}
            />
            <h2 className="text-5xl font-extrabold text-surface relative z-10">Stop losing patients on WhatsApp.</h2>
            <p className="text-surface-variant text-xl max-w-2xl mx-auto relative z-10 opacity-80">Let Velora reply instantly, book automatically, and free up your team.</p>
            <div className="relative z-10 flex flex-wrap justify-center gap-4">
              <button className="bg-primary text-on-primary px-10 py-5 rounded-full text-lg font-bold hover:shadow-xl transition-all">
                Book a demo
              </button>
              <button className="bg-white/10 text-white backdrop-blur-md px-10 py-5 rounded-full text-lg font-bold hover:bg-white/20 transition-all border border-white/20">
                Start free trial
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-[#363228] text-[#fff9ef] py-20 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-5 space-y-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#b095ff] text-2xl">auto_awesome</span>
              <div className="text-2xl font-bold">Velora AI</div>
            </div>
            <p className="text-[#fff9ef]/70 max-w-sm leading-relaxed">
              The leading WhatsApp booking automation platform for high-end clinics. We turn conversations into confirmed appointments while you sleep.
            </p>
            <div className="text-sm text-[#fff9ef]/40">
              &copy; 2024 Velora AI. The Tactile Sanctuary.
            </div>
          </div>
          <div className="md:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-8">
            {[
              { heading: 'Product', links: ['How it works', 'Case Studies', 'Pricing'] },
              { heading: 'Company', links: ['About Us', 'Contact Support', 'Book a Demo'] },
              { heading: 'Legal',   links: ['Privacy Policy', 'Terms of Service', 'Cookies'] },
            ].map(({ heading, links }) => (
              <div key={heading} className="space-y-4">
                <h5 className="font-bold text-sm tracking-widest uppercase opacity-40">{heading}</h5>
                <ul className="space-y-3 text-sm font-medium">
                  {links.map((link) => (
                    <li key={link}>
                      <a className="hover:text-primary-fixed transition-colors" href="#">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </footer>

    </div>
  )
}
