import { create } from 'zustand'
import type { ChatMessage, MatchSummary } from '../../../core/types/domain'

export type ChatThreadState = {
  match: MatchSummary | null
  messages: ChatMessage[]
  body: string
  loading: boolean
  sending: boolean
  error: string | null
}

type ChatThreadStoreActions = {
  patch: (partial: Partial<ChatThreadState>) => void
  reset: () => void
}

export type ChatThreadStore = ChatThreadState & ChatThreadStoreActions

export const initialChatThreadState: ChatThreadState = {
  match: null,
  messages: [],
  body: '',
  loading: true,
  sending: false,
  error: null,
}

export const useChatThreadStore = create<ChatThreadStore>((set) => ({
  ...initialChatThreadState,
  patch: (partial) => set(partial),
  reset: () => set(initialChatThreadState),
}))

export const chatThreadStore = {
  getState: () => useChatThreadStore.getState(),
  patch: (partial: Partial<ChatThreadState>) => useChatThreadStore.getState().patch(partial),
  reset: () => useChatThreadStore.getState().reset(),
}
