import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { realtimeService } from '../../../core/realtime/realtime.service'
import { participantStore } from '../../../core/session/participant-store'
import { matchesOrchestrator } from '../orchestration/matches.orchestrator'
import { useMatchesStore } from '../store/matches.store'

export function useMatchesScreen() {
  const navigate = useNavigate()

  const { matches, loading, error } = useMatchesStore(
    useShallow((s) => ({
      matches: s.matches,
      loading: s.loading,
      error: s.error,
    })),
  )

  useEffect(() => {
    if (!participantStore.isCheckedIn()) {
      navigate('/join', { replace: true })
      return
    }

    matchesOrchestrator
      .refresh()
      .catch((err) => {
        useMatchesStore.setState({
          error: err instanceof Error ? err.message : 'Could not load matches',
        })
      })
      .finally(() => {
        useMatchesStore.setState({ loading: false })
      })

    return () => matchesOrchestrator.reset()
  }, [navigate])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    void realtimeService.onMatchChange(() => {
      void matchesOrchestrator.refresh()
    }).then((fn) => {
      unsubscribe = fn
    })

    return () => unsubscribe?.()
  }, [])

  return { matches, loading, error }
}
