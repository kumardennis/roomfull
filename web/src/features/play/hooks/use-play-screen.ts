import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCountdown } from '../../../core/hooks/use-countdown'
import { useSessionRealtime } from '../../../core/hooks/use-session-realtime'
import { realtimeService } from '../../../core/realtime/realtime.service'
import { participantStore } from '../../../core/session/participant-store'
import { playOrchestrator } from '../orchestration/play.orchestrator'
import { usePlayStore } from '../store/play.store'

/**
 * React adapter: subscribes to the store, delegates logic to orchestration,
 * owns routing / realtime / countdown side effects.
 */
export function usePlayScreen() {
  const navigate = useNavigate()

  const {
    sessionState,
    leaderboard,
    leaderboardFilter,
    answerFilter,
    expandedId,
    trail,
    chosenOption,
    selfReport,
    loading,
    submitting,
    vibing,
    error,
    predictionTally,
  } = usePlayStore(
    useShallow((s) => ({
      sessionState: s.sessionState,
      leaderboard: s.leaderboard,
      leaderboardFilter: s.leaderboardFilter,
      answerFilter: s.answerFilter,
      expandedId: s.expandedId,
      trail: s.trail,
      chosenOption: s.chosenOption,
      selfReport: s.selfReport,
      loading: s.loading,
      submitting: s.submitting,
      vibing: s.vibing,
      error: s.error,
      predictionTally: s.predictionTally,
    })),
  )

  const secondsLeft = useCountdown(sessionState?.open_round?.closes_at)
  const phaseSecondsLeft = useCountdown(
    sessionState?.session.phase === 'round_interstitial' ||
      sessionState?.session.phase === 'scheduled' ||
      sessionState?.session.phase === 'opener'
      ? sessionState.session.phase_deadline
      : null,
  )

  const refresh = useCallback(() => {
    return playOrchestrator
      .refresh()
      .then((result) => {
        if (!result?.needsOpener) return result

        // Only gate on opener while that window is open. After the session
        // advances, forcing /opener causes a play↔opener redirect loop.
        const phase = result.sessionState.session.phase
        if (phase === 'scheduled' || phase === 'opener') {
          navigate('/opener', { replace: true })
        }
        return result
      })
      .catch((err) => {
        usePlayStore.setState({
          error: err instanceof Error ? err.message : 'Could not load play state',
        })
      })
  }, [navigate])

  useEffect(() => {
    if (!participantStore.isCheckedIn()) {
      navigate('/join', { replace: true })
      return
    }

    playOrchestrator.reset()
    usePlayStore.setState({ loading: true, error: null })

    void refresh().finally(() => {
      usePlayStore.setState({ loading: false })
    })

    return () => playOrchestrator.reset()
  }, [navigate, refresh])

  useSessionRealtime(() => {
    void refresh()
  })

  const openRound = sessionState?.open_round
  const joinedAt = participantStore.getJoinedAt()
  const waitingForNextRound = Boolean(
    sessionState?.session.phase === 'round_live' &&
      openRound &&
      !openRound.my_answer &&
      joinedAt !== null &&
      joinedAt > Date.parse(openRound.opens_at),
  )
  const showPredictionTally =
    openRound?.question.format === 'prediction' &&
    Boolean(openRound.my_answer) &&
    openRound.status === 'open'

  useEffect(() => {
    const roundId = openRound?.id
    if (!roundId || !showPredictionTally) {
      playOrchestrator.clearPredictionTally()
      return
    }

    void playOrchestrator.refreshPredictionTally(roundId)

    let unsubscribe: (() => void) | undefined
    void realtimeService.onRoundAnswersChange(roundId, () => {
      void playOrchestrator.refreshPredictionTally(roundId)
    }).then((fn) => {
      unsubscribe = fn
    })

    return () => {
      unsubscribe?.()
    }
  }, [openRound?.id, showPredictionTally])

  async function selectOption(option: string) {
    playOrchestrator.setChosenOption(option)
    const { sessionState } = usePlayStore.getState()
    if (sessionState?.open_round?.question.self_report_prompt) {
      return
    }
    await playOrchestrator.submitAnswer()
  }

  return {
    state: sessionState,
    leaderboard,
    leaderboardFilter,
    answerFilter,
    setAnswerFilter: playOrchestrator.setAnswerFilter,
    expandedId,
    trail,
    chosenOption,
    setChosenOption: playOrchestrator.setChosenOption,
    selfReport,
    setSelfReport: playOrchestrator.setSelfReport,
    loading,
    submitting,
    vibing,
    error,
    predictionTally,
    secondsLeft,
    phaseSecondsLeft,
    waitingForNextRound,
    expandParticipant: playOrchestrator.expandParticipant,
    submitAnswer: playOrchestrator.submitAnswer,
    selectOption,
    sendVibe: playOrchestrator.sendVibe,
  }
}
