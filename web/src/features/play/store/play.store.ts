import { create } from 'zustand'
import type { AnswerTrail, LeaderboardEntry, LeaderboardFilter, PredictionLiveTally, SessionState } from '../../../core/types/domain'

export const ANSWER_FILTER_PENDING = '__pending__'

export type PlayState = {
  sessionState: SessionState | null
  leaderboard: LeaderboardEntry[]
  leaderboardFilter: LeaderboardFilter | null
  answerFilter: string | null
  expandedId: string | null
  trail: AnswerTrail | null
  chosenOption: string
  selfReport: string
  loading: boolean
  submitting: boolean
  vibing: boolean
  error: string | null
  predictionTally: PredictionLiveTally | null
}

type PlayStoreActions = {
  patch: (partial: Partial<PlayState>) => void
  reset: () => void
}

export type PlayStore = PlayState & PlayStoreActions

export const initialPlayState: PlayState = {
  sessionState: null,
  leaderboard: [],
  leaderboardFilter: null,
  answerFilter: null,
  expandedId: null,
  trail: null,
  chosenOption: '',
  selfReport: '',
  loading: true,
  submitting: false,
  vibing: false,
  error: null,
  predictionTally: null,
}

export const usePlayStore = create<PlayStore>((set) => ({
  ...initialPlayState,
  patch: (partial) => set(partial),
  reset: () => set(initialPlayState),
}))

/** Imperative access for orchestration (no React). */
export const playStore = {
  getState: () => usePlayStore.getState(),
  patch: (partial: Partial<PlayState>) => usePlayStore.getState().patch(partial),
  reset: () => usePlayStore.getState().reset(),
}
