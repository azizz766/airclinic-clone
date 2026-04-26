'use client'

import FooterSection from '@/components/velora/footer-section'
import TopNav from '@/components/velora/top-nav'
import { CheckCircle, Clock, CreditCard } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export default function BookDemoPage() {
  const [clinicName, setClinicName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [locations, setLocations] = useState('')
  const [whatsappVolume, setWhatsappVolume] = useState('')
  const [bookingMethod, setBookingMethod] = useState('')
  const [mainGoal, setMainGoal] = useState('')

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitState('loading')
    setMessage('')

    try {
      const response = await fetch('/api/book-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName,
          contactName,
          phone,
          email,
          city,
          locations,
          whatsappVolume,
          bookingMethod,
          mainGoal,
        }),
      })

      if (!response.ok) {
        setSubmitState('error')
        setMessage('Your request was saved, but notification delivery failed.')
        return
      }

      setSubmitState('success')
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
                Start your 30-day WhatsApp receptionist{' '}
                <span className="italic text-[#674db1]">trial.</span>
              </h1>

              <p className="max-w-md text-lg leading-relaxed text-[#635f53]">
                We'll set up Velora for your clinic so you can test 24/7 replies, bookings, reminders, and no-show reduction before committing.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-[#674db1]" />
                <span className="text-sm font-semibold text-[#2f2b25]">No credit card required</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-[#674db1]" />
                <span className="text-sm font-semibold text-[#2f2b25]">Setup support included</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-[#674db1]" />
                <span className="text-sm font-semibold text-[#2f2b25]">Ready in 24 hours</span>
              </div>
            </div>

            <div className="mt-12 hidden opacity-70 lg:block">
              <div className="mb-2 h-1 w-24 rounded-full bg-[#b095ff]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8f8778]">
                THE WHATSAPP-FIRST CLINIC TRIAL
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="relative overflow-hidden rounded-[3rem] bg-[#f7f4fb] p-8 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.08)] md:p-12">
              <div className="relative z-10">
                {submitState === 'success' ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#e7f6ec] text-2xl font-bold text-[#1f6b3b]">
                      ✓
                    </div>
                    <h3 className="mb-3 text-2xl font-bold text-[#2d2a26]">
                      Your free trial request is in.
                    </h3>
                    <p className="max-w-md text-[#635f53]">
                      We'll review your clinic details and contact you shortly to set up Velora on WhatsApp.
                    </p>
                    <Link
                      href="/"
                      className="mt-8 rounded-full bg-[#674db1] px-6 py-3 font-bold text-white"
                    >
                      Back to Home
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="mb-10">
                      <h2 className="mb-2 text-3xl font-bold tracking-tight text-[#2d2a26]">
                        Start Your Free Clinic Trial
                      </h2>
                      <p className="text-[#635f53]">
                        Tell us about your clinic. We'll set up your WhatsApp receptionist within 24 hours.
                      </p>
                    </div>

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

                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                            WhatsApp / Phone Number
                          </label>
                          <input
                            type="tel"
                            placeholder="+971 50 000 0000"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] placeholder:text-[#a39b8c] focus:outline-none"
                            required
                          />
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
                      </div>

                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                            City
                          </label>
                          <input
                            type="text"
                            placeholder="Dubai"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="w-full rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] placeholder:text-[#a39b8c] focus:outline-none"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                            Number of Locations
                          </label>
                          <select
                            value={locations}
                            onChange={(e) => setLocations(e.target.value)}
                            className="w-full appearance-none rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] focus:outline-none"
                            required
                          >
                            <option value="">Select</option>
                            <option value="1">1 location</option>
                            <option value="2">2 locations</option>
                            <option value="3">3 locations</option>
                            <option value="4+">4+ locations</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                          Monthly WhatsApp Inquiries
                        </label>
                        <select
                          value={whatsappVolume}
                          onChange={(e) => setWhatsappVolume(e.target.value)}
                          className="w-full appearance-none rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] focus:outline-none"
                          required
                        >
                          <option value="">Select range</option>
                          <option value="under-50">Under 50</option>
                          <option value="50-150">50–150</option>
                          <option value="150-300">150–300</option>
                          <option value="300+">300+</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                          Current Booking Method
                        </label>
                        <select
                          value={bookingMethod}
                          onChange={(e) => setBookingMethod(e.target.value)}
                          className="w-full appearance-none rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] focus:outline-none"
                          required
                        >
                          <option value="">Select method</option>
                          <option value="whatsapp-only">WhatsApp only</option>
                          <option value="phone-calls">Phone calls</option>
                          <option value="receptionist-manual">Receptionist manually books</option>
                          <option value="website-booking">Website booking</option>
                          <option value="clinic-system">Clinic system / PMS</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="ml-3 block text-[11px] font-bold uppercase tracking-[0.18em] text-[#7c766b]">
                          Main Goal
                        </label>
                        <select
                          value={mainGoal}
                          onChange={(e) => setMainGoal(e.target.value)}
                          className="w-full appearance-none rounded-full bg-[#e8e0d1] px-6 py-4 text-[#363228] focus:outline-none"
                          required
                        >
                          <option value="">Select goal</option>
                          <option value="capture-bookings">Capture more bookings</option>
                          <option value="reduce-no-shows">Reduce no-shows</option>
                          <option value="reply-after-hours">Reply after hours</option>
                          <option value="reduce-front-desk">Reduce front-desk workload</option>
                          <option value="automate-whatsapp">Automate WhatsApp</option>
                        </select>
                      </div>

                      {submitState !== 'idle' && message && (
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

                      {submitState === 'loading' && (
                        <div className="rounded-2xl bg-[#ece8f8] px-5 py-4 text-sm font-medium text-[#5d32de]">
                          Submitting your request...
                        </div>
                      )}

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={submitState === 'loading'}
                          className="w-full rounded-full bg-[#5d32de] py-5 text-lg font-bold text-white shadow-[0_10px_30px_-5px_rgba(93,50,222,0.35)] transition-all duration-300 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {submitState === 'loading' ? 'Submitting...' : 'Start Free Trial'}
                        </button>

                        <p className="mt-5 text-center text-xs font-medium text-[#9a9286]">
                          No credit card required. Setup support included.
                        </p>
                      </div>
                    </form>
                  </>
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
