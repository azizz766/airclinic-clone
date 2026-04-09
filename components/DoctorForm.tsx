"use client"

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEFAULT_DOCTOR_AVAILABILITY,
  parseDoctorAvailabilitySchedule,
  WEEK_DAYS,
} from '@/lib/doctor-availability'

interface DoctorRecord {
  id: string
  firstName: string
  lastName: string
  isActive: boolean
  availabilitySchedule: unknown
}

interface DoctorFormProps {
  doctors: DoctorRecord[]
}

const DAY_LABELS: Record<(typeof WEEK_DAYS)[number], string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

export function DoctorForm({ doctors }: DoctorFormProps) {
  const router = useRouter()
  const initialDoctor = doctors[0]
  const initialSchedule = parseDoctorAvailabilitySchedule(initialDoctor?.availabilitySchedule)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [specialty, setSpecialty] = useState('')

  const [workingDays, setWorkingDays] = useState<(typeof WEEK_DAYS)[number][]>(
    DEFAULT_DOCTOR_AVAILABILITY.workingDays
  )
  const [startTime, setStartTime] = useState(DEFAULT_DOCTOR_AVAILABILITY.startTime)
  const [endTime, setEndTime] = useState(DEFAULT_DOCTOR_AVAILABILITY.endTime)
  const [isActive, setIsActive] = useState(true)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctor?.id ?? '')
  const [editWorkingDays, setEditWorkingDays] = useState<(typeof WEEK_DAYS)[number][]>(initialSchedule.workingDays)
  const [editStartTime, setEditStartTime] = useState(initialSchedule.startTime)
  const [editEndTime, setEditEndTime] = useState(initialSchedule.endTime)
  const [editIsActive, setEditIsActive] = useState(initialDoctor?.isActive ?? true)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const resolvedSelectedDoctorId =
    doctors.some((doctor) => doctor.id === selectedDoctorId) ? selectedDoctorId : (doctors[0]?.id ?? '')

  const toggleDay = (
    day: (typeof WEEK_DAYS)[number],
    current: (typeof WEEK_DAYS)[number][],
    setter: (days: (typeof WEEK_DAYS)[number][]) => void
  ) => {
    if (current.includes(day)) {
      setter(current.filter((item) => item !== day))
      return
    }
    setter([...current, day])
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!firstName.trim()) {
      setError('First name is required.')
      return
    }

    if (!lastName.trim()) {
      setError('Last name is required.')
      return
    }

    if (workingDays.length === 0) {
      setError('Select at least one working day.')
      return
    }

    if (startTime >= endTime) {
      setError('Working start time must be earlier than end time.')
      return
    }

    setIsSubmitting(true)

    const formData = new FormData()
    formData.append('firstName', firstName.trim())
    formData.append('lastName', lastName.trim())
    formData.append('specialty', specialty.trim())
    formData.append('startTime', startTime)
    formData.append('endTime', endTime)
    formData.append('isActive', isActive ? '1' : '0')
    for (const day of workingDays) {
      formData.append('workingDays', day)
    }

    const response = await fetch('/api/doctors', {
      method: 'POST',
      body: formData,
    })

    setIsSubmitting(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: 'Unable to add doctor.' }))
      setError(result.error || 'Unable to add doctor.')
      return
    }

    setSuccess('Doctor added successfully.')
    setFirstName('')
    setLastName('')
    setSpecialty('')
    setWorkingDays(DEFAULT_DOCTOR_AVAILABILITY.workingDays)
    setStartTime(DEFAULT_DOCTOR_AVAILABILITY.startTime)
    setEndTime(DEFAULT_DOCTOR_AVAILABILITY.endTime)
    setIsActive(true)
    router.refresh()
  }

  const handleUpdateAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError('')
    setEditSuccess('')

    if (!resolvedSelectedDoctorId) {
      setEditError('Select a doctor to update.')
      return
    }

    if (editWorkingDays.length === 0) {
      setEditError('Select at least one working day.')
      return
    }

    if (editStartTime >= editEndTime) {
      setEditError('Working start time must be earlier than end time.')
      return
    }

    setIsUpdating(true)

    try {
      const formData = new FormData()
      formData.append('doctorId', resolvedSelectedDoctorId)
      formData.append('startTime', editStartTime)
      formData.append('endTime', editEndTime)
      formData.append('isActive', editIsActive ? '1' : '0')
      for (const day of editWorkingDays) {
        formData.append('workingDays', day)
      }

      const response = await fetch('/api/doctors', {
        method: 'PATCH',
        body: formData,
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Unable to update doctor availability.' }))
        setEditError(result.error || 'Unable to update doctor availability.')
        return
      }

      setEditSuccess('Doctor availability updated successfully.')
      router.refresh()
    } catch {
      setEditError('Unable to update doctor availability.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Add Doctor</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">First Name</label>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              name="firstName"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Jane"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Last Name</label>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              name="lastName"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Specialty</label>
            <input
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              name="specialty"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="General Practice"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">Working Days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEK_DAYS.map((day) => (
                <label key={day} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={workingDays.includes(day)}
                    onChange={() => toggleDay(day, workingDays, setWorkingDays)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  {DAY_LABELS[day]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Doctor is active for booking
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
          >
            {isSubmitting ? 'Saving...' : 'Add Doctor'}
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Manage Availability</h2>
        {doctors.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">Add a doctor first to manage availability.</p>
        ) : (
          <form onSubmit={handleUpdateAvailability} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Doctor</label>
              <select
                value={resolvedSelectedDoctorId}
                onChange={(event) => {
                  const nextDoctorId = event.target.value
                  const nextDoctor = doctors.find((doctor) => doctor.id === nextDoctorId)
                  const nextSchedule = parseDoctorAvailabilitySchedule(nextDoctor?.availabilitySchedule)

                  setSelectedDoctorId(nextDoctorId)
                  setEditWorkingDays(nextSchedule.workingDays)
                  setEditStartTime(nextSchedule.startTime)
                  setEditEndTime(nextSchedule.endTime)
                  setEditIsActive(nextDoctor?.isActive ?? true)
                  setEditError('')
                  setEditSuccess('')
                }}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.firstName} {doctor.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">Working Days</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEK_DAYS.map((day) => (
                  <label key={day} className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={editWorkingDays.includes(day)}
                      onChange={() => toggleDay(day, editWorkingDays, setEditWorkingDays)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {DAY_LABELS[day]}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Time</label>
                <input
                  type="time"
                  value={editStartTime}
                  onChange={(event) => setEditStartTime(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Time</label>
                <input
                  type="time"
                  value={editEndTime}
                  onChange={(event) => setEditEndTime(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editIsActive}
                onChange={(event) => setEditIsActive(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Doctor is active for booking
            </label>

            {editError && <p className="text-sm text-red-600">{editError}</p>}
            {editSuccess && <p className="text-sm text-green-600">{editSuccess}</p>}
            <button
              type="submit"
              disabled={isUpdating}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {isUpdating ? 'Updating...' : 'Update Availability'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
