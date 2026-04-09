"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface NotificationJobSendButtonProps {
  jobId: string
}

export function NotificationJobSendButton({ jobId }: NotificationJobSendButtonProps) {
  const router = useRouter()
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async () => {
    setError('')
    setIsSending(true)

    try {
      const response = await fetch(`/api/notification-jobs/${jobId}/send`, {
        method: 'POST',
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(typeof result.error === 'string' ? result.error : 'Unable to send notification job.')
        return
      }

      router.refresh()
    } catch {
      setError('Unable to send notification job.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSend}
        disabled={isSending}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
      >
        {isSending ? 'Sending...' : 'Send Now'}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
