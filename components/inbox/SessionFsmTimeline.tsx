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
}

function fmtState(state: string) {
  return state
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
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

export function SessionFsmTimeline({ sessionId }: Props) {
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
          {transitions.map((t, i) => (
            <li key={i} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium leading-relaxed text-stone-800">
                  <span className="text-stone-500">{fmtState(t.fromState)}</span>
                  {' → '}
                  <span className="text-violet-700">{fmtState(t.toState)}</span>
                </p>
                <p className="shrink-0 text-[11px] text-stone-400">{fmtDate(t.createdAt)}</p>
              </div>
              <p className="mt-0.5 text-xs text-stone-500">{t.triggerType}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
