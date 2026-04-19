'use client'

import { createClient } from '@/lib/supabase/client'
import FooterSection from '@/components/velora/footer-section'
import TopNav from '@/components/velora/top-nav'
import { ShieldCheck, Zap } from 'lucide-react'
import { useState } from 'react'

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export default function BookDemoPage() {
  const supabase = createClient()

  const [clinicName, setClinicName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [volume, setVolume] = useState('')

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setSubmitState('loading')
    setMessage('')

    try {
      const { error } = await supabase.from('demo_requests').insert([
        {
          clinic_name: clinicName,
          contact_name: contactName,
          work_email: email,
          monthly_patient_volume: volume,
        },
      ])

      if (error) {
        console.error(error)
        setSubmitState('error')
        setMessage('Something went wrong while saving your request.')
        return
      }

      const response = await fetch('/api/book-demo', {
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

      if (!response.ok) {
        setSubmitState('error')
        setMessage('Your request was saved, but notification delivery failed.')
        return
      }

      setSubmitState('success')
      setMessage("You're all set. We'll reach out to you shortly.")

      setClinicName('')
      setContactName('')
      setEmail('')
      setVolume('')
    } catch (error) {
      console.error(error)
      setSubmitState('error')
      setMessage('Something unexpected happened. Please try again.')
    }
  }

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

                {submitState === 'success' ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#e7f6ec] text-2xl font-bold text-[#1f6b3b]">
                      ✓
                    </div>

                    <h3 className="mb-2 text-2xl font-bold text-[#2d2a26]">
                      You're booked 🎉
                    </h3>

                    <p className="max-w-md text-[#635f53]">
                      We&apos;ve received your request. Our team will reach out to you shortly to schedule your demo.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setSubmitState('idle')
                        setMessage('')
                      }}
                      className="mt-8 rounded-full bg-[#5d32de] px-6 py-3 font-bold text-white"
                    >
                      Submit another request
                    </button>
                  </div>
                ) : (
                  <form className="space-y-6" onSubmit={handleSubmit}>
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
                          required
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
                          required
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
                        required
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
                        required
                      >
                        <option value="">Select volume range</option>
                        <option value="0-100">0 - 100 Patients</option>
                        <option value="101-500">101 - 500 Patients</option>
                        <option value="501-1000">501 - 1,000 Patients</option>
                        <option value="1000+">1,000+ Patients</option>
                      </select>
                    </div>

                    {submitState !== 'idle' && (
                      <div
                        className={`rounded-2xl px-5 py-4 text-sm font-medium ${
                          submitState === 'error'
                            ? 'bg-[#fdecec] text-[#9f2d2d]'
                            : 'bg-[#ece8f8] text-[#5d32de]'
                        }`}
                      >
                        {submitState === 'loading' ? 'Submitting your request...' : message}
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={submitState === 'loading'}
                        className="w-full rounded-full bg-[#5d32de] py-5 text-lg font-bold text-white shadow-[0_10px_30px_-5px_rgba(93,50,222,0.35)] transition-all duration-300 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {submitState === 'loading' ? 'Submitting...' : 'Schedule My Demo'}
                      </button>

                      <p className="mt-5 text-center text-xs font-medium text-[#9a9286]">
                        No credit card required. Dedicated onboarding specialist included.
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <FooterSection />
    </div>
  )
}