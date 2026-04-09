"use client"

import { ChangeEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmation_pending', label: 'Confirmation Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
  { value: 'rescheduled', label: 'Rescheduled' },
] as const

type StatusValue = (typeof STATUS_OPTIONS)[number]['value']

interface AppointmentStatusControlProps {
  appointmentId: string
  initialStatus: StatusValue
}

export function AppointmentStatusControl({ appointmentId, initialStatus }: AppointmentStatusControlProps) {
  const router = useRouter()
  const [status, setStatus] = useState<StatusValue>(initialStatus)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const newStatus = event.target.value as StatusValue
    const previousStatus = status

    setError('')
    setSuccess('')
    setIsSubmitting(true)

    const response = await fetch(`/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setIsSubmitting(false)

    if (!response.ok) {
      const result = await response.json().catch(() => null)
      if (result && result.error) {
        setError(result.error)
      } else if (result && result.message) {
        setError(result.message)
      } else {
        setError(`HTTP ${response.status}: ${response.statusText}`)
      }
      setStatus(previousStatus)
      return
    }

    setStatus(newStatus)
    setSuccess('Status updated.')
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <select
        value={status}
        onChange={handleChange}
        disabled={isSubmitting}
        className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-600">{success}</p>}
    </div>
  )
}
