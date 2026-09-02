import { create } from 'zustand'
import type { IncomingVibe } from '../../../core/types/domain'

export type VibesState = {
  vibe: IncomingVibe | null
  loading: boolean
  acting: boolean
  error: string | null
}

type VibesStoreActions = {
  patch: (partial: Partial<VibesState>) => void
  reset: () => void
}

export type VibesStore = VibesState & VibesStoreActions

export const initialVibesState: VibesState = {
  vibe: null,
  loading: true,
  acting: false,
  error: null,
}

export const useVibesStore = create<VibesStore>((set) => ({
  ...initialVibesState,
  patch: (partial) => set(partial),
  reset: () => set(initialVibesState),
}))

export const vibesStore = {
  getState: () => useVibesStore.getState(),
  patch: (partial: Partial<VibesState>) => useVibesStore.getState().patch(partial),
  reset: () => useVibesStore.getState().reset(),
}
