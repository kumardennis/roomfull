import type { ChatMessage, MatchSummary } from '../../../core/types/domain'
import { callRpc } from '../../../core/supabase/rpc'
import { participantStore } from '../../../core/session/participant-store'

export const chatRepo = {
  getMatches(): Promise<MatchSummary[]> {
    return callRpc<MatchSummary[]>('get_my_matches', {
      p_participant_token: participantStore.requireToken(),
    }).then((data) => data ?? [])
  },

  getMessages(matchId: string): Promise<ChatMessage[]> {
    return callRpc<ChatMessage[]>('get_chat_messages', {
      p_participant_token: participantStore.requireToken(),
      p_match_id: matchId,
    }).then((data) => data ?? [])
  },

  sendMessage(matchId: string, body: string) {
    return callRpc('send_message', {
      p_participant_token: participantStore.requireToken(),
      p_match_id: matchId,
      p_body: body,
    })
  },
}
