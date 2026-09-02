import { create } from 'zustand'
import type { SessionPhase } from '../../../core/types/domain'

export type OpenerState = {
  prompt: string
  options: string[]
  answer: string
  handle: string
  phase: SessionPhase
  startsAt: string | null
  phaseDeadline: string | null
  loading: boolean
  submitting: boolean
  error: string | null
}

type OpenerStoreActions = {
  patch: (partial: Partial<OpenerState>) => void
  reset: () => void
}

export type OpenerStore = OpenerState & OpenerStoreActions

export const initialOpenerState: OpenerState = {
  prompt: '',
  options: [],
  answer: '',
  handle: '',
  phase: 'scheduled',
  startsAt: null,
  phaseDeadline: null,
  loading: true,
  submitting: false,
  error: null,
}

export const useOpenerStore = create<OpenerStore>((set) => ({
  ...initialOpenerState,
  patch: (partial) => set(partial),
  reset: () => set(initialOpenerState),
}))

export const openerStore = {
  getState: () => useOpenerStore.getState(),
  patch: (partial: Partial<OpenerState>) => useOpenerStore.getState().patch(partial),
  reset: () => useOpenerStore.getState().reset(),
}
