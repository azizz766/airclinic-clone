'use client'

import { useEffect, useState } from 'react'

type Transition = {
  fromState: string
  toState: string
  triggerType: string
  createdAt: string
}

type Props = {
  sessionId: string | null
  isAdmin: boolean
}

function fmtState(state: string) {
  return state
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function triggerColor(t: string): string {
  if (t.startsWith('INTENT_')) return 'bg-blue-50 text-blue-700'
  if (t === 'DATE_OVERRIDE') return 'bg-purple-50 text-purple-700'
  if (t === 'USER_REQUESTED_ESCALATION') return 'bg-amber-50 text-amber-700'
  if (t === 'AFFIRM' || t === 'SLOT_VALID') return 'bg-green-50 text-green-700'
  if (t.startsWith('SYSTEM') || t.startsWith('SESSION_')) return 'bg-stone-100 text-stone-500'
  return 'bg-stone-50 text-stone-500'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SessionFsmTimeline({ sessionId, isAdmin }: Props) {
  if (!isAdmin) return null
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')

  useEffect(() => {
    if (!sessionId) {
      setStatus('done')
      setTransitions([])
      return
    }

    setStatus('loading')
    setTransitions([])

    fetch(`/api/debug/session/${sessionId}/timeline`)
      .then((res) => {
        if (!res.ok) throw new Error('non-ok response')
        return res.json() as Promise<{ timeline: Transition[] }>
      })
      .then((data) => {
        setTransitions(data.timeline ?? [])
        setStatus('done')
      })
      .catch(() => setStatus('error'))
  }, [sessionId])

  return (
    <div className="overflow-hidden rounded-2xl bg-white/95 ring-1 ring-stone-200 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="border-b border-stone-100 px-4 py-4">
        <h2 className="text-sm font-semibold text-stone-900">FSM State Transitions</h2>
        <p className="mt-0.5 text-xs text-stone-400">Session state machine history</p>
      </div>

      {status === 'loading' && (
        <p className="px-4 py-8 text-center text-sm text-stone-400">Loading…</p>
      )}

      {status === 'error' && (
        <p className="px-4 py-8 text-center text-sm text-red-400">Could not load timeline.</p>
      )}

      {status === 'done' && transitions.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-stone-400">No state transitions recorded for this session.</p>
      )}

      {status === 'done' && transitions.length > 0 && (
        <ul className="divide-y divide-stone-100">
          {transitions.map((t, i) => {
            const isLatest = i === transitions.length - 1
            return (
              <li
                key={i}
                className={`px-4 py-3 ${isLatest ? 'border-l-2 border-violet-400 bg-violet-50/40' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium leading-relaxed text-stone-800">
                    <span className="text-stone-500">{fmtState(t.fromState)}</span>
                    {' → '}
                    <span className="text-violet-700">{fmtState(t.toState)}</span>
                  </p>
                  <p className="shrink-0 text-[11px] text-stone-400">{fmtDate(t.createdAt)}</p>
                </div>
                <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${triggerColor(t.triggerType)}`}>
                  {t.triggerType}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
