import { create } from 'zustand'
import type { MatchSummary } from '../../../core/types/domain'

export type MatchesState = {
  matches: MatchSummary[]
  loading: boolean
  error: string | null
}

type MatchesStoreActions = {
  patch: (partial: Partial<MatchesState>) => void
  reset: () => void
}

export type MatchesStore = MatchesState & MatchesStoreActions

export const initialMatchesState: MatchesState = {
  matches: [],
  loading: true,
  error: null,
}

export const useMatchesStore = create<MatchesStore>((set) => ({
  ...initialMatchesState,
  patch: (partial) => set(partial),
  reset: () => set(initialMatchesState),
}))

export const matchesStore = {
  getState: () => useMatchesStore.getState(),
  patch: (partial: Partial<MatchesState>) => useMatchesStore.getState().patch(partial),
  reset: () => useMatchesStore.getState().reset(),
}
