import type { SessionState } from '../types/domain'
import { callRpc } from '../supabase/rpc'
import { participantStore } from './participant-store'

export const sessionRepo = {
  getState(): Promise<SessionState> {
    return callRpc<SessionState>('get_session_state', {
      p_participant_token: participantStore.requireToken(),
    })
  },

  submitOpener(answer: string) {
    return callRpc('submit_opener', {
      p_participant_token: participantStore.requireToken(),
      p_answer: answer,
    })
  },
}
