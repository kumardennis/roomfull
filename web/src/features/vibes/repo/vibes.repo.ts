import type { IncomingVibe } from '../../../core/types/domain'
import { callRpc } from '../../../core/supabase/rpc'
import { participantStore } from '../../../core/session/participant-store'

export const vibesRepo = {
  getIncoming(): Promise<IncomingVibe | null> {
    return callRpc<IncomingVibe | null>('get_incoming_vibe', {
      p_participant_token: participantStore.requireToken(),
    })
  },

  accept(vibeId: string) {
    return callRpc<{ vibe_id: string; status: string; match_id: string | null }>('accept_vibe', {
      p_participant_token: participantStore.requireToken(),
      p_vibe_id: vibeId,
    })
  },

  pass(vibeId: string) {
    return callRpc('pass_vibe', {
      p_participant_token: participantStore.requireToken(),
      p_vibe_id: vibeId,
    })
  },
}
