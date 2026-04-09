'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type SidebarPatient = {
  id: string
  name: string
  phone: string | null
  totalAppointments: number
}

type SidebarAppointment = {
  id: string
  scheduledAtIso: string
  doctorId: string
  doctorName: string
  serviceId: string
  serviceName: string
  status: 'scheduled' | 'confirmation_pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'
}

type ConversationContextSidebarProps = {
  clinicId: string
  patient: SidebarPatient | null
  appointment: SidebarAppointment | null
  canManageAppointmentActions: boolean
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusBadgeClasses(status: SidebarAppointment['status']) {
  if (status === 'confirmation_pending') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700'
  if (status === 'scheduled') return 'bg-sky-50 text-sky-700'
  if (status === 'completed') return 'bg-stone-100 text-stone-600'
  if (status === 'cancelled') return 'bg-red-50 text-red-700'
  if (status === 'no_show') return 'bg-orange-50 text-orange-700'
  if (status === 'rescheduled') return 'bg-indigo-50 text-indigo-700'
  return 'bg-stone-100 text-stone-600'
}

function statusLabel(status: SidebarAppointment['status']) {
  return status.replace(/_/g, ' ')
}

function toDateInputValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

export function ConversationContextSidebar({ clinicId, patient, appointment, canManageAppointmentActions }: ConversationContextSidebarProps) {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<'confirm' | 'cancel' | null>(null)
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false)
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function toOperatorError(message: string, action: 'confirm' | 'cancel' | 'reschedule' | 'slots') {
    const normalized = message.toLowerCase()

    if (normalized.includes('insufficient permissions')) {
      return 'You do not have permission for this action. Contact a clinic admin if this is unexpected.'
    }

    if (normalized.includes('unauthorized')) {
      return 'Your session has expired. Please sign in again.'
    }

    if (normalized.includes('cannot cancel appointment from status')) {
      return 'This appointment can no longer be cancelled from its current status.'
    }

    if (normalized.includes('cannot confirm appointment from status')) {
      return 'This appointment can no longer be confirmed from its current status.'
    }

    if (normalized.includes('invalid appointment date/time')) {
      return 'Please choose a valid date and time.'
    }

    if (normalized.includes('please select a different time slot')) {
      return 'Choose a different time slot to continue.'
    }

    if (normalized.includes('overlaps an existing appointment')) {
      return 'That time overlaps another booking for this doctor. Choose another slot.'
    }

    if (normalized.includes('doctor is not working')) {
      return 'The selected doctor is not available at that time. Choose another slot.'
    }

    if (action === 'slots') return 'Unable to load available time slots right now.'
    if (action === 'reschedule') return 'Unable to reschedule right now. Please try again.'
    if (action === 'cancel') return 'Unable to cancel right now. Please try again.'
    return 'Unable to confirm right now. Please try again.'
  }

  useEffect(() => {
    if (!appointment) {
      setIsRescheduleOpen(false)
      setRescheduleDate('')
      setSelectedSlot('')
      setAvailableSlots([])
      setSlotsError(null)
      return
    }

    setRescheduleDate(toDateInputValue(appointment.scheduledAtIso))
    setSelectedSlot('')
    setAvailableSlots([])
    setSlotsError(null)
  }, [appointment])

  useEffect(() => {
    if (!appointment || !isRescheduleOpen || !rescheduleDate) {
      return
    }

    let active = true

    const loadSlots = async () => {
      setIsLoadingSlots(true)
      setSlotsError(null)
      setSelectedSlot('')

      const params = new URLSearchParams({
        doctorId: appointment.doctorId,
        serviceId: appointment.serviceId,
        date: rescheduleDate,
        excludeAppointmentId: appointment.id,
      })

      try {
        const response = await fetch(`/api/appointments/slots?${params.toString()}`)
        const payload = await response.json().catch(() => ({}))

        if (!active) {
          return
        }

        if (!response.ok) {
          setAvailableSlots([])
          const rawError = typeof payload.error === 'string' ? payload.error : ''
          setSlotsError(toOperatorError(rawError, 'slots'))
          return
        }

        const slots = Array.isArray(payload.slots)
          ? payload.slots.filter((slot: unknown): slot is string => typeof slot === 'string')
          : []

        setAvailableSlots(slots)
      } catch {
        if (!active) {
          return
        }

        setAvailableSlots([])
        setSlotsError(toOperatorError('', 'slots'))
      } finally {
        if (active) {
          setIsLoadingSlots(false)
        }
      }
    }

    void loadSlots()

    return () => {
      active = false
    }
  }, [appointment, isRescheduleOpen, rescheduleDate])

  async function runMutation(action: 'confirm' | 'cancel') {
    if (!appointment) return

    setPendingAction(action)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch(`/api/appointments/${appointment.id}/${action}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const rawError = payload && typeof payload.error === 'string'
          ? payload.error
          : ''
        const message = toOperatorError(rawError, action)
        throw new Error(message)
      }

      setNotice(action === 'confirm' ? 'Appointment confirmed successfully.' : 'Appointment cancelled successfully.')
      router.refresh()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : toOperatorError('', action))
    } finally {
      setPendingAction(null)
    }
  }

  function requestCancelConfirmation() {
    if (!appointment) return
    setError(null)
    setNotice(null)
    setIsCancelConfirmOpen(true)
  }

  function openReschedulePanel() {
    if (!appointment) {
      return
    }

    setError(null)
    setNotice(null)
    setSlotsError(null)
    setRescheduleDate(toDateInputValue(appointment.scheduledAtIso))
    setSelectedSlot('')
    setIsRescheduleOpen(true)
  }

  async function runReschedule() {
    if (!appointment) {
      return
    }

    if (!rescheduleDate) {
      setError('Please choose a date.')
      return
    }

    if (!selectedSlot) {
      setError('Please select an available time slot.')
      return
    }

    setError(null)
    setNotice(null)
    setIsSubmittingReschedule(true)

    try {
      const response = await fetch(`/api/appointments/${appointment.id}/reschedule`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          scheduledAt: `${rescheduleDate}T${selectedSlot}`,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const rawError = payload && typeof payload.error === 'string'
          ? payload.error
          : ''
        const message = toOperatorError(rawError, 'reschedule')
        throw new Error(message)
      }

      setNotice('Appointment rescheduled successfully.')
      setIsRescheduleOpen(false)
      setSelectedSlot('')
      setAvailableSlots([])
      router.refresh()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : toOperatorError('', 'reschedule'))
    } finally {
      setIsSubmittingReschedule(false)
    }
  }

  return (
    <aside className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="border-b border-stone-100 px-4 py-4">
        <h2 className="text-base font-semibold text-stone-900">Appointment Panel</h2>
        <p className="mt-1 text-xs text-stone-500">Patient information and control</p>
      </div>

      <div className="space-y-3 px-4 py-4">
        {/* Patient info */}
        <section className="rounded-xl bg-white ring-1 ring-stone-200 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Patient</p>
          {patient ? (
            <dl className="space-y-2.5">
              <div>
                <dt className="text-[10px] font-medium text-stone-400 mb-1">Name</dt>
                <dd className="text-base font-semibold text-stone-900">{patient.name}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-stone-400 mb-1">Phone</dt>
                <dd className="text-sm font-medium text-stone-800">{patient.phone || 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-medium text-stone-400 mb-1">Total appointments</dt>
                <dd className="text-sm font-medium text-stone-800">{patient.totalAppointments}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-stone-500">No patient linked to this conversation yet.</p>
          )}
        </section>

        {/* Appointment info */}
        <section className="rounded-xl bg-stone-50/80 ring-1 ring-stone-300 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Latest appointment</p>
          {appointment ? (
            <div className="space-y-2.5">
              <div>
                <p className="text-[10px] font-medium text-stone-400 mb-1">Date &amp; time</p>
                <p className="text-base font-semibold text-stone-900">{formatDateTime(appointment.scheduledAtIso)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-stone-400 mb-1">Doctor</p>
                <p className="text-sm font-medium text-stone-800">{appointment.doctorName}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-stone-400 mb-1">Service</p>
                <p className="text-sm font-medium text-stone-800">{appointment.serviceName}</p>
              </div>
              <div className="pt-1">
                <span className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${statusBadgeClasses(appointment.status)}`}>
                  {statusLabel(appointment.status)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500">No upcoming appointment linked.</p>
          )}
        </section>

        {/* Actions Control Surface */}
        <section className="rounded-xl bg-white ring-1 ring-stone-200 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Actions</p>
          {canManageAppointmentActions ? (
            <div className="space-y-2 flex flex-col">
              <button
                type="button"
                onClick={() => runMutation('confirm')}
                disabled={!appointment || pendingAction !== null}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(5,150,105,0.24)] transition-all duration-150 hover:-translate-y-px hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-sm"
              >
                {pendingAction === 'confirm' ? 'Confirming...' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={openReschedulePanel}
                disabled={!appointment || pendingAction !== null}
                className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition-all duration-150 hover:-translate-y-px hover:bg-stone-50 hover:ring-stone-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingReschedule ? 'Rescheduling...' : 'Reschedule'}
              </button>
              <button
                type="button"
                onClick={requestCancelConfirmation}
                disabled={!appointment || pendingAction !== null || isSubmittingReschedule}
                className="w-full rounded-lg bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 shadow-[0_8px_20px_rgba(220,38,38,0.08)] transition-all duration-150 hover:-translate-y-px hover:bg-red-100 hover:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === 'cancel' ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-stone-500">Actions limited for your role.</p>
          )}

          {canManageAppointmentActions && isCancelConfirmOpen && appointment ? (
            <div className="mt-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 shadow-[0_8px_20px_rgba(220,38,38,0.06)]">
              <p className="text-xs font-semibold text-red-900">Cancel appointment?</p>
              <p className="mt-0.5 text-xs text-red-700">This marks it as cancelled.</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCancelConfirmOpen(false)
                    void runMutation('cancel')
                  }}
                  disabled={pendingAction !== null}
                  className="flex-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_8px_16px_rgba(220,38,38,0.2)] transition-all duration-150 hover:-translate-y-px hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setIsCancelConfirmOpen(false)}
                  disabled={pendingAction !== null}
                  className="flex-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 transition-all duration-150 hover:-translate-y-px hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Keep
                </button>
              </div>
            </div>
          ) : null}

          {canManageAppointmentActions && isRescheduleOpen && appointment ? (
            <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-stone-200 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
              <div className="mb-2.5">
                <p className="text-xs font-semibold text-stone-900">Reschedule</p>
                <p className="mt-0.5 text-[10px] text-stone-500">Current: {formatDateTime(appointment.scheduledAtIso)}</p>
              </div>

              <label className="block text-[10px] font-medium text-stone-500 mb-1\">Select date</label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(event) => setRescheduleDate(event.target.value)}
                className="block w-full rounded-lg border-0 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-900 ring-1 ring-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] focus:outline-none focus:ring-2 focus:ring-violet-400"
              />

              <div className="mt-2">
                <p className="text-[10px] font-medium text-stone-500 mb-1.5\">Time slots</p>
                {isLoadingSlots ? (
                  <p className="text-xs text-stone-400 py-1.5\">Loading...</p>
                ) : slotsError ? (
                  <p className="text-xs font-medium text-red-700 bg-red-50 rounded-lg px-2 py-1.5 ring-1 ring-red-200\">{slotsError}</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-xs text-stone-400 py-1.5\">No slots available.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot === slot

                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-150 ${isSelected ? 'bg-violet-600 text-white shadow-[0_8px_16px_rgba(109,40,217,0.18)]' : 'bg-stone-50 text-stone-700 ring-1 ring-stone-300 hover:-translate-y-px hover:bg-white hover:ring-stone-400'}`}
                        >
                          {formatSlotLabel(slot)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedSlot ? (
                <p className="mt-2 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700\">
                  ✓ {formatSlotLabel(selectedSlot)}
                </p>
              ) : null}

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={runReschedule}
                  disabled={isSubmittingReschedule || isLoadingSlots || !selectedSlot}
                  className="flex-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(109,40,217,0.2)] transition-all duration-150 hover:-translate-y-px hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-sm"
                >
                  {isSubmittingReschedule ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRescheduleOpen(false)}
                  disabled={isSubmittingReschedule}
                  className="flex-1 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 transition-all duration-150 hover:-translate-y-px hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-2.5 rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs font-medium text-red-700 shadow-sm\">{error}</p> : null}
          {notice ? <p className="mt-2.5 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 shadow-sm\">{notice}</p> : null}
        </section>
      </div>
    </aside>
  )
}
