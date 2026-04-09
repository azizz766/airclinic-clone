"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type NotificationJobRetryButtonProps = {
  clinicId: string
  jobId: string
}

export function NotificationJobRetryButton({ clinicId, jobId }: NotificationJobRetryButtonProps) {
  const router = useRouter()
  const [isRetrying, setIsRetrying] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function toOperatorMessage(message: string) {
    const normalized = message.toLowerCase()
    if (normalized.includes('insufficient permissions')) {
      return 'You do not have permission to retry notifications. Contact a clinic admin.'
    }

    if (normalized.includes('invalidated jobs cannot be retried')) {
      return 'This notification is outdated and cannot be retried.'
    }

    if (normalized.includes('only failed jobs can be retried')) {
      return 'Only failed notifications can be retried.'
    }

    if (normalized.includes('unauthorized')) {
      return 'Your session expired. Please sign in again.'
    }

    return message
  }

  const handleRetry = async () => {
    setError('')
    setNotice('')
    setIsRetrying(true)

    try {
      const response = await fetch(`/api/clinics/${clinicId}/notification-jobs/${jobId}/retry`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const rawError = typeof payload.error === 'string' ? payload.error : 'Retry failed.'
        setError(toOperatorMessage(rawError))
        return
      }

      setNotice('Notification retried successfully.')
      router.refresh()
    } catch {
      setError('Unable to retry notification right now. Please try again.')
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleRetry}
        disabled={isRetrying}
        className="w-24 rounded-lg bg-violet-600 px-3.5 py-2 text-center text-xs font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-400"
      >
        {isRetrying ? 'Retrying...' : 'Retry'}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      {notice ? <p className="mt-1 text-xs text-emerald-700">{notice}</p> : null}
    </div>
  )
}
