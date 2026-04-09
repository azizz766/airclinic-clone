'use client'

import { useEffect, useRef } from 'react'

interface FlashCookieConsumerProps {
  clearAction: () => Promise<void>
}

export default function FlashCookieConsumer({ clearAction }: FlashCookieConsumerProps) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.requestSubmit()
  }, [])

  return <form ref={formRef} action={clearAction} className="hidden" aria-hidden="true" />
}
