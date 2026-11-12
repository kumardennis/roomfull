import { callRpc } from '../../../core/supabase/rpc'
import type { SessionPhase } from '../../../core/types/domain'

export type HostRound = {
  id: string
  round_number: number
  status: string
  question_prompt: string
}

export type HostPlanItem = {
  position: number
  question_id: string
  prompt: string
  format: string
  duration_sec: number
}

export type HostSession = {
  session_id: string
  status: string
  phase: SessionPhase
  phase_deadline: string | null
  scheduled_starts_at: string | null
  ends_at: string | null
  paused: boolean
  participant_count: number
  round_progress: { current: number; total: number }
  rounds: HostRound[]
  round_plan: HostPlanItem[]
}

export const hostRepo = {
  getSession(hostPin: string, sessionId: string): Promise<HostSession> {
    return callRpc<HostSession>('get_host_session', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
    })
  },

  pauseSession(hostPin: string, sessionId: string) {
    return callRpc('host_pause_session', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
    })
  },

  resumeSession(hostPin: string, sessionId: string) {
    return callRpc('host_resume_session', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
    })
  },

  forceEndSession(hostPin: string, sessionId: string) {
    return callRpc('host_force_end_session', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
    })
  },

  setRoundCount(hostPin: string, sessionId: string, roundCount: number) {
    return callRpc<{ session_id: string; requested: number; total: number; kept: number }>(
      'host_set_round_count',
      {
        p_host_pin: hostPin,
        p_session_id: sessionId,
        p_round_count: roundCount,
      },
    )
  },

  devResetSession(
    hostPin: string,
    sessionId: string,
    clearParticipantAnswers = true,
    clearSocial = true,
  ) {
    return callRpc<{
      session_id: string
      qr_code: string
      status: string
      phase: string
      phase_deadline: string | null
    }>('dev_reset_session', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
      p_clear_participant_answers: clearParticipantAnswers,
      p_clear_social: clearSocial,
    })
  },

  devSessionTick(hostPin: string, sessionId: string) {
    return callRpc<{
      session_id: string
      phase: string
      noop?: boolean
      reason?: string
    }>('dev_session_tick', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
    })
  },

  devSkipPhaseWait(hostPin: string, sessionId: string, seconds = 5) {
    return callRpc<{
      session_id: string
      phase: string
      phase_deadline: string
    }>('dev_skip_phase_wait', {
      p_host_pin: hostPin,
      p_session_id: sessionId,
      p_seconds: seconds,
    })
  },
}
