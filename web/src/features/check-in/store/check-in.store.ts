import { create } from 'zustand'

export type CheckInState = {
  qrCode: string
  loading: boolean
  error: string | null
}

type CheckInStoreActions = {
  patch: (partial: Partial<CheckInState>) => void
  reset: () => void
}

export type CheckInStore = CheckInState & CheckInStoreActions

export const initialCheckInState: CheckInState = {
  qrCode: 'dev-night-001',
  loading: false,
  error: null,
}

export const useCheckInStore = create<CheckInStore>((set) => ({
  ...initialCheckInState,
  patch: (partial) => set(partial),
  reset: () => set(initialCheckInState),
}))

export const checkInStore = {
  getState: () => useCheckInStore.getState(),
  patch: (partial: Partial<CheckInState>) => useCheckInStore.getState().patch(partial),
  reset: () => useCheckInStore.getState().reset(),
}
