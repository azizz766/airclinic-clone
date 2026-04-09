"use client"

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PatientOption {
  id: string
  firstName: string
  lastName: string
}

interface DoctorOption {
  id: string
  firstName: string
  lastName: string
  specialty?: string | null
}

interface ServiceOption {
  id: string
  name: string
  durationMinutes: number
  price: number | null
}

interface AppointmentFormProps {
  patients: PatientOption[]
  doctors: DoctorOption[]
  services: ServiceOption[]
}

export function AppointmentForm({ patients, doctors, services }: AppointmentFormProps) {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setSelectedSlot('')
    setAvailableSlots([])
    setSlotsError('')

    if (!doctorId || !serviceId || !appointmentDate) {
      return
    }

    let isActive = true

    const loadSlots = async () => {
      setIsLoadingSlots(true)

      const params = new URLSearchParams({
        doctorId,
        serviceId,
        date: appointmentDate,
      })

      try {
        const response = await fetch(`/api/appointments/slots?${params.toString()}`)
        const result = await response.json().catch(() => ({}))

        if (!isActive) {
          return
        }

        if (!response.ok) {
          setSlotsError(typeof result.error === 'string' ? result.error : 'Unable to load available slots.')
          setAvailableSlots([])
          return
        }

        const slots = Array.isArray(result.slots)
          ? result.slots.filter((slot: unknown): slot is string => typeof slot === 'string')
          : []

        setAvailableSlots(slots)
      } catch {
        if (!isActive) {
          return
        }

        setSlotsError('Unable to load available slots.')
        setAvailableSlots([])
      } finally {
        if (isActive) {
          setIsLoadingSlots(false)
        }
      }
    }

    void loadSlots()

    return () => {
      isActive = false
    }
  }, [appointmentDate, doctorId, serviceId])

  function formatSlotLabel(slot: string) {
    const date = new Date(`2000-01-01T${slot}:00`)
    if (Number.isNaN(date.getTime())) {
      return slot
    }

    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!patientId) {
      setError('Please select a patient.')
      return
    }

    if (!appointmentDate) {
      setError('Please choose an appointment date.')
      return
    }

    if (!selectedSlot) {
      setError('Please select an available time slot.')
      return
    }

    if (!doctorId) {
      setError('Please select a doctor.')
      return
    }

    if (!serviceId) {
      setError('Please select a service.')
      return
    }

    setIsSubmitting(true)

    const scheduledAt = `${appointmentDate}T${selectedSlot}`

    const formData = new FormData()
    formData.append('patientId', patientId)
    formData.append('doctorId', doctorId)
    formData.append('serviceId', serviceId)
    formData.append('scheduledAt', scheduledAt)
    formData.append('notes', notes)

    const response = await fetch('/api/appointments', {
      method: 'POST',
      body: formData,
    })

    setIsSubmitting(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: 'Unable to schedule appointment.' }))
      setError(result.error || 'Unable to schedule appointment.')
      return
    }

    setSuccess('Appointment scheduled successfully.')
    setPatientId('')
    setDoctorId('')
    setServiceId('')
    setAppointmentDate('')
    setSelectedSlot('')
    setAvailableSlots([])
    setSlotsError('')
    setNotes('')
    router.refresh()
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Schedule Appointment</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Patient</label>
          <select
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Select a patient...</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.firstName} {patient.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Doctor</label>
          <select
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            disabled={doctors.length === 0}
          >
            <option value="">Select a doctor...</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.firstName} {doctor.lastName}{doctor.specialty ? ` — ${doctor.specialty}` : ''}
              </option>
            ))}
          </select>
          {doctors.length === 0 && (
            <p className="mt-2 text-sm text-yellow-700">Add doctors first on the Doctors page.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Service</label>
          <select
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            disabled={services.length === 0}
          >
            <option value="">Select a service...</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — {service.durationMinutes} min
              </option>
            ))}
          </select>
          {services.length === 0 && (
            <p className="mt-2 text-sm text-yellow-700">Add services first on the Services page.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            value={appointmentDate}
            onChange={(event) => setAppointmentDate(event.target.value)}
            name="appointmentDate"
            type="date"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div>
          <p className="block text-sm font-medium text-gray-700">Available Time Slots</p>
          {!doctorId || !serviceId || !appointmentDate ? (
            <p className="mt-2 text-sm text-gray-600">Select doctor, service, and date to load slots.</p>
          ) : isLoadingSlots ? (
            <p className="mt-2 text-sm text-gray-600">Loading available slots...</p>
          ) : slotsError ? (
            <p className="mt-2 text-sm text-red-600">{slotsError}</p>
          ) : availableSlots.length === 0 ? (
            <p className="mt-2 text-sm text-yellow-700">No available slots for this doctor on the selected date.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {availableSlots.map((slot) => {
                const isSelected = selectedSlot === slot

                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800 hover:border-indigo-500 hover:text-indigo-700'}`}
                  >
                    {formatSlotLabel(slot)}
                  </button>
                )
              })}
            </div>
          )}
          {selectedSlot ? (
            <p className="mt-2 text-sm text-green-700">Selected slot: {formatSlotLabel(selectedSlot)}</p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            name="notes"
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            placeholder="Additional notes..."
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
        <button
          type="submit"
          disabled={isSubmitting || doctors.length === 0 || services.length === 0 || !selectedSlot}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {isSubmitting ? 'Scheduling...' : 'Schedule Appointment'}
        </button>
      </form>
    </div>
  )
}
