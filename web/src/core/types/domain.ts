export type Question = {
  id: string
  format: string
  prompt: string
  options: string[]
  self_report_prompt?: string | null
  is_scored?: boolean
}

export type SessionPhase =
  | 'scheduled'
  | 'opener'
  | 'round_live'
  | 'round_interstitial'
  | 'social'
  | 'ended'

export type SessionState = {
  participant: {
    id: string
    handle: string
    avatar_seed: string
    opener_answer: string | null
    needs_opener: boolean
  }
  session: {
    id: string
    status: string
    phase: SessionPhase
    phase_deadline: string | null
    scheduled_starts_at: string | null
    ends_at: string | null
    paused: boolean
    venue_name: string
    leaderboard_scoring: boolean
    round_progress: {
      current: number
      total: number
    }
  }
  opener_question: Question | null
  open_round: {
    id: string
    round_number: number
    opens_at: string
    closes_at: string
    status: string
    question: Question
    my_answer: { chosen_option: string; self_report_value?: string | null } | null
  } | null
}

export type LeaderboardEntry = {
  participant_id: string
  handle: string
  avatar_seed: string
  score: number
  is_me: boolean
  last_answer?: string | null
}

export type LeaderboardFilter = {
  round_id: string
  round_number: number
  prompt: string
  options: string[]
}

export type LeaderboardResult = {
  filter: LeaderboardFilter | null
  entries: LeaderboardEntry[]
}

export type PredictionLiveTally = {
  round_id: string
  locked: boolean
  yes_count?: number
  no_count?: number
  answered_count?: number
  total_participants?: number
  yes_percent?: number
  leading_bucket?: string | null
}

export type AnswerTrail = {
  participant_id: string
  handle: string
  avatar_seed: string
  opener: { prompt: string; answer: string | null } | null
  rounds: Array<{
    round_number: number
    prompt: string
    format: string
    chosen_option: string
    self_report_value?: string | null
  }>
}

export type IncomingVibe = {
  vibe_id: string
  from_participant_id: string
  handle: string
  avatar_seed: string
  answer_trail: AnswerTrail
}

export type MatchSummary = {
  match_id: string
  matched_at: string
  reveal_stage: 'hidden' | 'blurred' | 'revealed'
  reveal_requested_by_me: boolean
  reveal_requested_by_other: boolean
  other_participant: {
    id: string
    handle: string
    avatar_seed: string
  }
}

export type ChatMessage = {
  id: string
  sender_id: string
  body: string
  sent_at: string
  is_mine: boolean
}

export type JoinResult = {
  participant_id: string
  participant_token: string
  session_id: string
  handle: string
  avatar_seed: string
  opener_question_id: string | null
  session_phase: SessionPhase
  needs_opener: boolean
}
