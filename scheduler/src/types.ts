export type SessionDeadlineStatus =
  | "scheduled"
  | "fired"
  | "cancelled"
  | "superseded";

export type SessionDeadlineKind =
  | "event_start"
  | "opener_end"
  | "round_close"
  | "interstitial_end"
  | "session_end";

export type SessionDeadline = {
  id: string;
  session_id: string;
  kind: SessionDeadlineKind;
  expected_event: string;
  fire_at: string;
  round_id: string | null;
  status: SessionDeadlineStatus;
};
