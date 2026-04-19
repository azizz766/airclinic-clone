'use client'

import { createClient } from '@/lib/supabase/client'
import FooterSection from '@/components/velora/footer-section'
import TopNav from '@/components/velora/top-nav'
import { ShieldCheck, Zap } from 'lucide-react'
import { useState } from 'react'

export default function BookDemoPage() {
  const supabase = createClient()

  const [clinicName, setClinicName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [volume, setVolume] = useState('')

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[#F5EFE6] text-[#363228]">
      <TopNav />

      <main className="mx-auto flex w-full max-w-7xl flex-grow items-center px-6 pb-20 pt-32">
        <div className="grid w-full items-center gap-12 lg:grid-cols-12">
          <div className="flex flex-col gap-8 lg:col-span-5">
            <div className="space-y-6">
              <h1 className="text-5xl font-bold leading-[1.02] tracking-tighter md:text-6xl">
                The future of clinical intelligence is{' '}
                <span className="italic text-[#674db1]">tactile.</span>
              </h1>

              <p className="max-w-md text-lg leading-relaxed text-[#635f53]">
                Join elite clinics using Velora AI to reduce administrative burnout and reclaim 12+ hours every week.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-4">
  <div className="flex items-center gap-3 rounded-full bg-[#e6dece] px-5 py-3">
    <ShieldCheck className="h-4 w-4 text-[#674db1]" />
    <span className="text-sm font-semibold text-[#2f2b25]">
      HIPAA Compliant
    </span>
  </div>

  <div className="flex items-center gap-3 rounded-full bg-[#e6dece] px-5 py-3">
    <Zap className="h-4 w-4 text-[#674db1]" />
    <span className="text-sm font-semibold text-[#2f2b25]">
      Fast Integration
    </span>
  </div>
</div>

            <div className="mt-12 hidden opacity-70 lg:block">
              <div className="mb-2 h-1 w-24 rounded-full bg-[#b095ff]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8778]">
                THE SANCTUARY STANDARD
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="relative overflow-hidden rounded-[3rem] bg-[#f7f4fb] p-8 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.08)] md:p-12">
              <div className="relative z-10">
                <div className="mb-10">
                  <h2 className="mb-2 text-3xl font-bold tracking-tight text-[#2d2a26]">
                    Book a Demo
                  </h2>
                  <p className="text-[#635f53]">
                    Choose a time and see the sanctuary in action.
                  </p>
                </div>

                <form
                  className="space-y-6"
                  onSubmit={async (e) => {
                    e.preventDefault()

                    const { error } = await supabase.from('demo_requests').insert([
                      {
                        clinic_name: clinicName,
                        contact_name: contactName,
                        work_email: email,
                        monthly_patient_volume: volume,
                      },
                    ])

                    if (error) {
                      alert('Error submitting form')
                      console.error(error)
                    } else {
                      await fetch('/api/book-demo', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          clinicName,
                          contactName,
                          email,
                          volume,
                        }),
                      })

                      alert('Submitted successfully 🚀')
                      setClinicName('')
                      setContactName('')
                      setEmail('')
                      setVolume('')
                    }
                  }}
                >
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                        Clinic Name
                      </label>
                      <input
                        type="text"
                        placeholder="Wellness Collective"
                        value={clinicName}
                        onChange={(e) => setClinicName(e.target.value)}
                        className="w-full rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] placeholder:text-[#a39b8c] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        placeholder="Dr. Sarah Chen"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] placeholder:text-[#a39b8c] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                      Work Email
                    </label>
                    <input
                      type="email"
                      placeholder="sarah@wellnesscollective.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] placeholder:text-[#a39b8c] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                      Estimated Monthly Patient Volume
                    </label>
                    <select
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      className="w-full appearance-none rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] focus:outline-none"
                    >
                      <option value="">Select volume range</option>
                      <option value="0-100">0 - 100 Patients</option>
                      <option value="101-500">101 - 500 Patients</option>
                      <option value="501-1000">501 - 1,000 Patients</option>
                      <option value="1000+">1,000+ Patients</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full rounded-full bg-[#674db1] py-5 text-lg font-bold text-white shadow-[0_10px_30px_-5px_rgba(93,50,222,0.35)] transition-all duration-300 hover:opacity-95"
                    >
                      Schedule My Demo
                    </button>

                    <p className="mt-5 text-center text-xs font-medium text-[#9a9286]">
                      No credit card required. Dedicated onboarding specialist included.
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

      <FooterSection />
    </div>
  )
}