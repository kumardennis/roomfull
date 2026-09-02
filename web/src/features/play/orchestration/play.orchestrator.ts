import { sessionRepo } from '../../../core/session/session.repo'
import type { SessionState } from '../../../core/types/domain'
import { playRepo } from '../repo/play.repo'
import { playStore, type PlayState } from '../store/play.store'

export type PlayRefreshResult = {
  sessionState: SessionState
  needsOpener: boolean
}

function vibeErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Could not send vibe'
  if (message.includes('vibe_passed_wait_next_round')) {
    return 'They passed this round — try again after the next round.'
  }
  if (message.includes('vibe_window_closed')) {
    return 'Vibes can only be sent during round breaks.'
  }
  if (message.includes('already_pending')) {
    return 'Vibe already sent — waiting for their response.'
  }
  return message
}

export const playOrchestrator = {
  setChosenOption(value: string) {
    playStore.patch({ chosenOption: value })
  },

  setSelfReport(value: string) {
    playStore.patch({ selfReport: value })
  },

  setAnswerFilter(value: string | null) {
    playStore.patch({ answerFilter: value })
  },

  async refresh(): Promise<PlayRefreshResult | null> {
    const [sessionState, leaderboardResult] = await Promise.all([
      sessionRepo.getState(),
      playRepo.getLeaderboard(),
    ])

    const prevFilterRoundId = playStore.getState().leaderboardFilter?.round_id
    const patch: Partial<PlayState> = {
      sessionState,
      leaderboard: leaderboardResult.entries,
      leaderboardFilter: leaderboardResult.filter,
      error: null,
    }
    if (leaderboardResult.filter?.round_id !== prevFilterRoundId) {
      patch.answerFilter = null
    }
    playStore.patch(patch)

    const round = sessionState.open_round
    if (
      round?.question.format === 'prediction' &&
      round.my_answer &&
      round.status === 'open'
    ) {
      await playOrchestrator.refreshPredictionTally(round.id)
    } else {
      playStore.patch({ predictionTally: null })
    }

    return {
      sessionState,
      needsOpener: sessionState.participant.needs_opener,
    }
  },

  async expandParticipant(participantId: string) {
    const { expandedId } = playStore.getState()

    if (expandedId === participantId) {
      playStore.patch({ expandedId: null, trail: null })
      return
    }

    const trail = await playRepo.getAnswerTrail(participantId)
    playStore.patch({ expandedId: participantId, trail })
  },

  async refreshPredictionTally(roundId: string) {
    try {
      const tally = await playRepo.getPredictionLiveTally(roundId)
      if (tally.locked) {
        playStore.patch({ predictionTally: null })
        return
      }
      playStore.patch({ predictionTally: tally })
    } catch {
      playStore.patch({ predictionTally: null })
    }
  },

  clearPredictionTally() {
    playStore.patch({ predictionTally: null })
  },

  async submitAnswer() {
    const { sessionState, chosenOption, selfReport } = playStore.getState()
    const round = sessionState?.open_round
    if (!round || !chosenOption) return

    if (round.question.self_report_prompt && !selfReport.trim()) {
      playStore.patch({ error: 'Your self-report is required before submitting.' })
      return
    }

    playStore.patch({ submitting: true, error: null })
    try {
      await playRepo.submitAnswer(
        round.id,
        chosenOption,
        round.question.self_report_prompt ? selfReport : undefined,
      )
      await playOrchestrator.refresh()
      playStore.patch({ chosenOption: '', selfReport: '' })
    } catch (err) {
      playStore.patch({
        error: err instanceof Error ? err.message : 'Could not submit answer',
      })
    } finally {
      playStore.patch({ submitting: false })
    }
  },

  async sendVibe(participantId: string) {
    playStore.patch({ vibing: true, error: null })
    try {
      await playRepo.sendVibe(participantId)
      playStore.patch({ expandedId: null, trail: null })
    } catch (err) {
      playStore.patch({
        error: vibeErrorMessage(err),
      })
    } finally {
      playStore.patch({ vibing: false })
    }
  },

  reset() {
    playStore.reset()
  },
}
