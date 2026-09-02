import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { realtimeService } from '../../../core/realtime/realtime.service'
import { participantStore } from '../../../core/session/participant-store'
import { vibesOrchestrator } from '../orchestration/vibes.orchestrator'
import { useVibesStore } from '../store/vibes.store'

export function useVibeQueueScreen() {
  const navigate = useNavigate()

  const { vibe, loading, acting, error } = useVibesStore(
    useShallow((s) => ({
      vibe: s.vibe,
      loading: s.loading,
      acting: s.acting,
      error: s.error,
    })),
  )

  useEffect(() => {
    if (!participantStore.isCheckedIn()) {
      navigate('/join', { replace: true })
      return
    }

    vibesOrchestrator
      .refresh()
      .catch((err) => {
        useVibesStore.setState({
          error: err instanceof Error ? err.message : 'Could not load vibes',
        })
      })
      .finally(() => {
        useVibesStore.setState({ loading: false })
      })

    return () => vibesOrchestrator.reset()
  }, [navigate])

  useEffect(() => {
    const participantId = participantStore.getId()
    if (!participantId) return

    let unsubscribe: (() => void) | undefined

    void realtimeService.onVibeChange(participantId, () => {
      void vibesOrchestrator.refresh()
    }).then((fn) => {
      unsubscribe = fn
    })

    return () => unsubscribe?.()
  }, [])

  async function accept() {
    const result = await vibesOrchestrator.accept()
    if (result.matchId) {
      navigate(`/chat/${result.matchId}`)
      return
    }
    if (result.needsMutualVibe) {
      useVibesStore.setState({
        error: 'Could not open chat — try again or check Matches.',
      })
    }
  }

  return {
    vibe,
    loading,
    acting,
    error,
    accept,
    pass: vibesOrchestrator.pass,
  }
}
