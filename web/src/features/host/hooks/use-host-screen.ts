import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { hostOrchestrator } from '../orchestration/host.orchestrator'
import { useHostStore } from '../store/host.store'

export function useHostScreen() {
  const [searchParams] = useSearchParams()

  const { hostPin, sessionId, session, loading, error } = useHostStore(
    useShallow((s) => ({
      hostPin: s.hostPin,
      sessionId: s.sessionId,
      session: s.session,
      loading: s.loading,
      error: s.error,
    })),
  )

  useEffect(() => {
    const pin = searchParams.get('pin')
    const sessionParam = searchParams.get('session')
    if (pin) hostOrchestrator.setHostPin(pin)
    if (sessionParam) hostOrchestrator.setSessionId(sessionParam)
  }, [searchParams])

  useEffect(() => {
    if (!sessionId || !hostPin) return

    void hostOrchestrator.loadSession()

    return () => hostOrchestrator.reset()
  }, [sessionId, hostPin])

  return {
    hostPin,
    setHostPin: hostOrchestrator.setHostPin,
    sessionId,
    setSessionId: hostOrchestrator.setSessionId,
    session,
    loading,
    error,
    loadSession: hostOrchestrator.loadSession,
    pause: hostOrchestrator.pause,
    resume: hostOrchestrator.resume,
    forceEnd: hostOrchestrator.forceEnd,
    devReset: hostOrchestrator.devReset,
    devTick: hostOrchestrator.devTick,
    devSkipWait: hostOrchestrator.devSkipWait,
    devEndRoundSoon: hostOrchestrator.devEndRoundSoon,
  }
}
