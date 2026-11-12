
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          answered_at: string
          chosen_option: string
          id: string
          is_correct: boolean | null
          participant_id: string
          round_id: string
          self_report_value: string | null
        }
        Insert: {
          answered_at?: string
          chosen_option: string
          id?: string
          is_correct?: boolean | null
          participant_id: string
          round_id: string
          self_report_value?: string | null
        }
        Update: {
          answered_at?: string
          chosen_option?: string
          id?: string
          is_correct?: boolean | null
          participant_id?: string
          round_id?: string
          self_report_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_participant_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          session_id: string
        }
        Insert: {
          actor_participant_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          session_id: string
        }
        Update: {
          actor_participant_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_actor_participant_id_fkey"
            columns: ["actor_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          first_message_at: string | null
          id: string
          matched_at: string
          participant_a: string
          participant_b: string
          reveal_requested_by_a: boolean
          reveal_requested_by_b: boolean
          reveal_stage: Database["public"]["Enums"]["reveal_stage"]
          session_id: string
        }
        Insert: {
          first_message_at?: string | null
          id?: string
          matched_at?: string
          participant_a: string
          participant_b: string
          reveal_requested_by_a?: boolean
          reveal_requested_by_b?: boolean
          reveal_stage?: Database["public"]["Enums"]["reveal_stage"]
          session_id: string
        }
        Update: {
          first_message_at?: string | null
          id?: string
          matched_at?: string
          participant_a?: string
          participant_b?: string
          reveal_requested_by_a?: boolean
          reveal_requested_by_b?: boolean
          reveal_stage?: Database["public"]["Enums"]["reveal_stage"]
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_participant_a_fkey"
            columns: ["participant_a"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_participant_b_fkey"
            columns: ["participant_b"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          id: string
          match_id: string
          sender_id: string
          sent_at: string
        }
        Insert: {
          body: string
          id?: string
          match_id: string
          sender_id: string
          sent_at?: string
        }
        Update: {
          body?: string
          id?: string
          match_id?: string
          sender_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          auth_user_id: string | null
          avatar_seed: string
          handle: string
          id: string
          joined_at: string
          opener_answer: string | null
          participant_token: string
          session_id: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_seed: string
          handle: string
          id?: string
          joined_at?: string
          opener_answer?: string | null
          participant_token?: string
          session_id: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_seed?: string
          handle?: string
          id?: string
          joined_at?: string
          opener_answer?: string | null
          participant_token?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_option: string | null
          created_at: string
          format: Database["public"]["Enums"]["question_format"]
          id: string
          is_local: boolean
          options: Json
          prompt: string
          self_report_prompt: string | null
        }
        Insert: {
          correct_option?: string | null
          created_at?: string
          format: Database["public"]["Enums"]["question_format"]
          id?: string
          is_local?: boolean
          options?: Json
          prompt: string
          self_report_prompt?: string | null
        }
        Update: {
          correct_option?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["question_format"]
          id?: string
          is_local?: boolean
          options?: Json
          prompt?: string
          self_report_prompt?: string | null
        }
        Relationships: []
      }
      rounds: {
        Row: {
          closes_at: string | null
          created_at: string
          id: string
          opens_at: string | null
          question_id: string
          round_number: number
          session_id: string
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          id?: string
          opens_at?: string | null
          question_id: string
          round_number: number
          session_id: string
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          id?: string
          opens_at?: string | null
          question_id?: string
          round_number?: number
          session_id?: string
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rounds_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_deadlines: {
        Row: {
          cancel_reason: string | null
          expected_event: string
          fire_at: string
          fired_at: string | null
          id: string
          kind: Database["public"]["Enums"]["session_deadline_kind"]
          nudge_result: Json | null
          nudged_by: string | null
          round_id: string | null
          scheduled_at: string
          session_id: string
          status: Database["public"]["Enums"]["session_deadline_status"]
        }
        Insert: {
          cancel_reason?: string | null
          expected_event: string
          fire_at: string
          fired_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["session_deadline_kind"]
          nudge_result?: Json | null
          nudged_by?: string | null
          round_id?: string | null
          scheduled_at?: string
          session_id: string
          status?: Database["public"]["Enums"]["session_deadline_status"]
        }
        Update: {
          cancel_reason?: string | null
          expected_event?: string
          fire_at?: string
          fired_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["session_deadline_kind"]
          nudge_result?: Json | null
          nudged_by?: string | null
          round_id?: string | null
          scheduled_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["session_deadline_status"]
        }
        Relationships: [
          {
            foreignKeyName: "session_deadlines_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_deadlines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_round_plan: {
        Row: {
          duration_sec: number
          position: number
          question_id: string
          session_id: string
        }
        Insert: {
          duration_sec?: number
          position: number
          question_id: string
          session_id: string
        }
        Update: {
          duration_sec?: number
          position?: number
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_round_plan_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_round_plan_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          current_plan_index: number
          ends_at: string | null
          host_pin: string | null
          id: string
          interstitial_sec: number
          opener_question_id: string | null
          opener_window_sec: number
          paused_at: string | null
          phase: Database["public"]["Enums"]["session_phase"]
          phase_deadline: string | null
          qr_code: string
          round_duration_sec: number
          scheduled_starts_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          venue_id: string
        }
        Insert: {
          created_at?: string
          current_plan_index?: number
          ends_at?: string | null
          host_pin?: string | null
          id?: string
          interstitial_sec?: number
          opener_question_id?: string | null
          opener_window_sec?: number
          paused_at?: string | null
          phase?: Database["public"]["Enums"]["session_phase"]
          phase_deadline?: string | null
          qr_code: string
          round_duration_sec?: number
          scheduled_starts_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          venue_id: string
        }
        Update: {
          created_at?: string
          current_plan_index?: number
          ends_at?: string | null
          host_pin?: string | null
          id?: string
          interstitial_sec?: number
          opener_question_id?: string | null
          opener_window_sec?: number
          paused_at?: string | null
          phase?: Database["public"]["Enums"]["session_phase"]
          phase_deadline?: string | null
          qr_code?: string
          round_duration_sec?: number
          scheduled_starts_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_opener_question_id_fkey"
            columns: ["opener_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      vibes: {
        Row: {
          created_at: string
          from_participant: string
          id: string
          last_sent_after_round: number | null
          passed_after_round: number | null
          session_id: string
          status: Database["public"]["Enums"]["vibe_status"]
          to_participant: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_participant: string
          id?: string
          last_sent_after_round?: number | null
          passed_after_round?: number | null
          session_id: string
          status?: Database["public"]["Enums"]["vibe_status"]
          to_participant: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_participant?: string
          id?: string
          last_sent_after_round?: number | null
          passed_after_round?: number | null
          session_id?: string
          status?: Database["public"]["Enums"]["vibe_status"]
          to_participant?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibes_from_participant_fkey"
            columns: ["from_participant"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vibes_to_participant_fkey"
            columns: ["to_participant"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_vibe: {
        Args: { p_participant_token: string; p_vibe_id: string }
        Returns: Json
      }
      advance_reveal_stages: {
        Args: { p_min_chat_minutes?: number }
        Returns: number
      }
      advance_round: {
        Args: {
          p_duration_seconds?: number
          p_question_id: string
          p_round_number: number
          p_session_id: string
        }
        Returns: Json
      }
      advance_round_as_host: {
        Args: {
          p_duration_seconds?: number
          p_host_pin: string
          p_question_id: string
          p_round_number: number
          p_session_id: string
        }
        Returns: Json
      }
      auth_participant_id: { Args: never; Returns: string }
      auth_session_id: { Args: never; Returns: string }
      can_read_vibe: {
        Args: { p_from: string; p_session_id: string; p_to: string }
        Returns: boolean
      }
      dev_reset_session: {
        Args: {
          p_clear_participant_answers?: boolean
          p_clear_social?: boolean
          p_host_pin: string
          p_session_id: string
        }
        Returns: Json
      }
      dev_session_tick: {
        Args: { p_host_pin: string; p_session_id: string }
        Returns: Json
      }
      dev_skip_phase_wait: {
        Args: { p_host_pin: string; p_seconds?: number; p_session_id: string }
        Returns: Json
      }
      fire_session_deadline: {
        Args: { p_deadline_id: string; p_worker_id?: string }
        Returns: Json
      }
      get_answer_trail: {
        Args: { p_participant_token: string; p_target_participant_id: string }
        Returns: Json
      }
      get_chat_messages: {
        Args: { p_match_id: string; p_participant_token: string }
        Returns: Json
      }
      get_host_session: {
        Args: { p_host_pin: string; p_session_id: string }
        Returns: Json
      }
      get_incoming_vibe: {
        Args: { p_participant_token: string }
        Returns: Json
      }
      get_leaderboard: { Args: { p_participant_token: string }; Returns: Json }
      get_my_matches: { Args: { p_participant_token: string }; Returns: Json }
      get_prediction_live_tally: {
        Args: { p_participant_token: string; p_round_id: string }
        Returns: Json
      }
      get_session_state: {
        Args: { p_participant_token: string }
        Returns: Json
      }
      host_force_end_session: {
        Args: { p_host_pin: string; p_session_id: string }
        Returns: Json
      }
      host_pause_session: {
        Args: { p_host_pin: string; p_session_id: string }
        Returns: Json
      }
      host_resume_session: {
        Args: { p_host_pin: string; p_session_id: string }
        Returns: Json
      }
      host_set_round_count: {
        Args: { p_host_pin: string; p_round_count: number; p_session_id: string }
        Returns: Json
      }
      is_match_participant: { Args: { p_match_id: string }; Returns: boolean }
      join_session: {
        Args: { p_handle?: string; p_qr_code: string }
        Returns: Json
      }
      link_participant_auth: {
        Args: { p_participant_token: string }
        Returns: undefined
      }
      pass_vibe: {
        Args: { p_participant_token: string; p_vibe_id: string }
        Returns: Json
      }
      request_reveal: {
        Args: { p_match_id: string; p_participant_token: string }
        Returns: Json
      }
      send_message: {
        Args: {
          p_body: string
          p_match_id: string
          p_participant_token: string
        }
        Returns: Json
      }
      send_vibe: {
        Args: { p_participant_token: string; p_to_participant_id: string }
        Returns: Json
      }
      session_tick: { Args: never; Returns: number }
      submit_answer: {
        Args: {
          p_chosen_option: string
          p_participant_token: string
          p_round_id: string
          p_self_report_value?: string
        }
        Returns: Json
      }
      submit_opener: {
        Args: { p_answer: string; p_participant_token: string }
        Returns: Json
      }
    }
    Enums: {
      question_format:
        | "this_or_that"
        | "superlative"
        | "prediction"
        | "two_truths_one_lie"
        | "hot_take"
      reveal_stage: "hidden" | "blurred" | "revealed"
      round_status: "scheduled" | "open" | "closed"
      session_deadline_kind:
        | "event_start"
        | "opener_end"
        | "round_close"
        | "interstitial_end"
        | "session_end"
      session_deadline_status:
        | "scheduled"
        | "fired"
        | "cancelled"
        | "superseded"
      session_phase:
        | "scheduled"
        | "opener"
        | "round_live"
        | "round_interstitial"
        | "social"
        | "ended"
      session_status: "scheduled" | "active" | "ended"
      vibe_status: "pending" | "accepted" | "passed" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      question_format: [
        "this_or_that",
        "superlative",
        "prediction",
        "two_truths_one_lie",
        "hot_take",
      ],
      reveal_stage: ["hidden", "blurred", "revealed"],
      round_status: ["scheduled", "open", "closed"],
      session_deadline_kind: [
        "event_start",
        "opener_end",
        "round_close",
        "interstitial_end",
        "session_end",
      ],
      session_deadline_status: [
        "scheduled",
        "fired",
        "cancelled",
        "superseded",
      ],
      session_phase: [
        "scheduled",
        "opener",
        "round_live",
        "round_interstitial",
        "social",
        "ended",
      ],
      session_status: ["scheduled", "active", "ended"],
      vibe_status: ["pending", "accepted", "passed", "expired"],
    },
  },
} as const
