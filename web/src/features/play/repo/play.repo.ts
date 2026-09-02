import type { AnswerTrail, LeaderboardResult, PredictionLiveTally } from '../../../core/types/domain'
import { callRpc, callRpcUntyped } from '../../../core/supabase/rpc'
import { participantStore } from '../../../core/session/participant-store'

export const playRepo = {
  getLeaderboard(): Promise<LeaderboardResult> {
    return callRpc<LeaderboardResult>('get_leaderboard', {
      p_participant_token: participantStore.requireToken(),
    }).then((data) => ({
      filter: data?.filter ?? null,
      entries: data?.entries ?? [],
    }))
  },

  getAnswerTrail(targetParticipantId: string): Promise<AnswerTrail> {
    return callRpc<AnswerTrail>('get_answer_trail', {
      p_participant_token: participantStore.requireToken(),
      p_target_participant_id: targetParticipantId,
    })
  },

  submitAnswer(roundId: string, chosenOption: string, selfReportValue?: string) {
    return callRpc('submit_answer', {
      p_participant_token: participantStore.requireToken(),
      p_round_id: roundId,
      p_chosen_option: chosenOption,
      p_self_report_value: selfReportValue,
    })
  },

  sendVibe(toParticipantId: string) {
    return callRpc('send_vibe', {
      p_participant_token: participantStore.requireToken(),
      p_to_participant_id: toParticipantId,
    })
  },

  getPredictionLiveTally(roundId: string) {
    return callRpcUntyped<PredictionLiveTally>('get_prediction_live_tally', {
      p_participant_token: participantStore.requireToken(),
      p_round_id: roundId,
    })
  },
}
