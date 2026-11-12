import { create } from 'zustand'
import type { HostSession } from '../repo/host.repo'

export type HostState = {
  hostPin: string
  sessionId: string
  session: HostSession | null
  roundCountInput: string
  notice: string | null
  loading: boolean
  error: string | null
}

type HostStoreActions = {
  patch: (partial: Partial<HostState>) => void
  reset: () => void
}

export type HostStore = HostState & HostStoreActions

export const initialHostState: HostState = {
  hostPin: 'fox2026',
  sessionId: '',
  session: null,
  roundCountInput: '',
  notice: null,
  loading: false,
  error: null,
}

export const useHostStore = create<HostStore>((set) => ({
  ...initialHostState,
  patch: (partial) => set(partial),
  reset: () => set(initialHostState),
}))

export const hostStore = {
  getState: () => useHostStore.getState(),
  patch: (partial: Partial<HostState>) => useHostStore.getState().patch(partial),
  reset: () => useHostStore.getState().reset(),
}
