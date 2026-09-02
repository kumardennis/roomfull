import { useEffect, useRef } from 'react'
import { realtimeService } from '../realtime/realtime.service'
import { participantStore } from '../session/participant-store'

/**
 * Subscribes to session / round / answer changes for the checked-in participant.
 * Calls `onChange` when Postgres notifies — typically triggers orchestrator.refresh().
 */
export function useSessionRealtime(onChange: () => void) {
  const handlerRef = useRef(onChange)
  handlerRef.current = onChange

  useEffect(() => {
    const sessionId = participantStore.getSessionId()
    if (!sessionId) return

    let unsubscribe: (() => void) | undefined

    void realtimeService
      .onSessionPlayStateChange(sessionId, () => {
        handlerRef.current()
      })
      .then((fn) => {
        unsubscribe = fn
      })

    return () => unsubscribe?.()
  }, [])
}
