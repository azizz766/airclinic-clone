'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Service {
  id: string
  name: string
  durationMinutes: number
}

interface Doctor {
  id: string
  firstName: string
  lastName: string
}

interface AvailableSlot {
  isoDateTime: string
  label: string
}

type BookingStep = 'loading' | 'error' | 'service' | 'doctor' | 'datetime' | 'patient' | 'submitting' | 'success'

export default function BookAppointmentPage() {
  const params = useParams()
  const clinicId = typeof params.clinicId === 'string' ? params.clinicId : ''

  // State
  const [step, setStep] = useState<BookingStep>('loading')
  const [services, setServices] = useState<Service[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')

  // Load clinic data on mount
  useEffect(() => {
    const loadClinicData = async () => {
      if (!clinicId) {
        setErrorMessage('Invalid clinic')
        setStep('error')
        return
      }

      try {
        const response = await fetch(`/api/public/clinics/${clinicId}/booking-info`)
        if (!response.ok) {
          throw new Error('Failed to load clinic data')
        }
        const data = await response.json()
        setServices(data.services || [])
        setDoctors(data.doctors || [])
        setStep('service')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load clinic data'
        setErrorMessage(message)
        setStep('error')
      }
    }

    loadClinicData()
  }, [clinicId])

  // Load available slots when service/doctor selected
  useEffect(() => {
    const loadSlots = async () => {
      if (!selectedService) {
        setSlots([])
        return
      }

      try {
        const params = new URLSearchParams({
          serviceId: selectedService,
          ...(selectedDoctor ? { doctorId: selectedDoctor } : {}),
        })

        const response = await fetch(
          `/api/public/clinics/${clinicId}/available-slots?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Failed to load slots')
        }
        const data = await response.json()
        setSlots(data.slots || [])
        setSelectedSlot(null)
      } catch (err) {
        console.error('Error loading slots:', err)
        setSlots([])
      }
    }

    loadSlots()
  }, [clinicId, selectedService, selectedDoctor])

  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId)
    setSelectedDoctor(null)
    setSelectedSlot(null)
    setStep('doctor')
  }

  const handleDoctorSelect = (doctorId: string | null) => {
    setSelectedDoctor(doctorId)
    setSelectedSlot(null)
    setStep('datetime')
  }

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot)
    setStep('patient')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setErrorMessage('All fields required')
      return
    }

    if (!selectedService || !selectedSlot) {
      setErrorMessage('Service and slot required')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          serviceId: selectedService,
          doctorId: selectedDoctor || null,
          scheduledAt: selectedSlot,
          patientFirstName: firstName.trim(),
          patientLastName: lastName.trim(),
          patientPhone: phone.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Booking failed')
      }

      setStep('success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Booking failed'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-4">جاري التحميل...</div>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-600 mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2">خطأ</h1>
          <p className="text-gray-700">{errorMessage}</p>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">تمام 👍</h1>
          <p className="text-gray-700 mb-4">تم حجز موعدك بنجاح</p>
          <p className="text-sm text-gray-600">سيتم إرسال تفاصيل الموعد على بريدك قريباً</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6 text-center">حجز موعد</h1>

        {step === 'service' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">اختر الخدمة</h2>
            <div className="space-y-2">
              {services.length === 0 ? (
                <p className="text-gray-500">لا توجد خدمات متاحة</p>
              ) : (
                services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => handleServiceSelect(service.id)}
                    className="w-full text-right p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-500 transition"
                  >
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-gray-500">{service.durationMinutes} دقيقة</div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === 'doctor' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">اختر الطبيب (اختياري)</h2>
            <button
              onClick={() => handleDoctorSelect(null)}
              className="w-full text-right p-3 border rounded-lg hover:bg-gray-50 mb-2"
            >
              <div className="font-medium">— أي طبيب —</div>
            </button>
            <div className="space-y-2">
              {doctors.length === 0 ? (
                <p className="text-gray-500">لا توجد أطباء متاحين</p>
              ) : (
                doctors.map((doctor) => (
                  <button
                    key={doctor.id}
                    onClick={() => handleDoctorSelect(doctor.id)}
                    className="w-full text-right p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-500 transition"
                  >
                    <div className="font-medium">
                      د. {doctor.firstName} {doctor.lastName}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === 'datetime' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">اختر الموعد</h2>
            {slots.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">لا توجد مواعيد متاحة</p>
                <button
                  onClick={() => setStep('service')}
                  className="mt-4 px-4 py-2 text-blue-600 hover:underline"
                >
                  العودة
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {slots.map((slot) => (
                  <button
                    key={slot.isoDateTime}
                    onClick={() => handleSlotSelect(slot.isoDateTime)}
                    className="w-full text-right p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-500 transition"
                  >
                    <div className="font-medium">{slot.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'patient' && (
          <form onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold mb-4">بيانات المريض</h2>

            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {errorMessage}
              </div>
            )}

            <div className="space-y-3">
              <input
                type="text"
                placeholder="الاسم الأول"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-3 border rounded-lg text-right"
                required
              />
              <input
                type="text"
                placeholder="الاسم الأخير"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-3 border rounded-lg text-right"
                required
              />
              <input
                type="tel"
                placeholder="رقم الهاتف"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-3 border rounded-lg text-right"
                required
              />
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('datetime')}
                className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                عودة
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'جاري...' : 'احجز الآن'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
