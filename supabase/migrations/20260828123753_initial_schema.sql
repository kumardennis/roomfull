-- RoomFull initial schema
-- See CONTEXT.md for product rules and build order.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- pg_cron is used for gradual reveal advancement (enable in Supabase dashboard if needed).
create extension if not exists "pg_cron" with schema "extensions";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.question_format as enum (
  'this_or_that',
  'superlative',
  'prediction',
  'two_truths_one_lie',
  'hot_take'
);

create type public.session_status as enum (
  'scheduled',
  'active',
  'ended'
);

create type public.round_status as enum (
  'scheduled',
  'open',
  'closed'
);

create type public.vibe_status as enum (
  'pending',
  'accepted',
  'passed',
  'expired'
);

create type public.reveal_stage as enum (
  'hidden',
  'blurred',
  'revealed'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  qr_code text not null unique,
  opener_question_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  status public.session_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  format public.question_format not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option text,
  self_report_prompt text,
  is_local boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prediction_requires_self_report check (
    format <> 'prediction'
    or self_report_prompt is not null
  )
);

alter table public.sessions
  add constraint sessions_opener_question_id_fkey
  foreign key (opener_question_id) references public.questions (id);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  handle text not null,
  avatar_seed text not null,
  participant_token uuid not null unique default gen_random_uuid(),
  opener_answer text,
  joined_at timestamptz not null default now(),
  unique (session_id, handle)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  round_number integer not null check (round_number > 0),
  opens_at timestamptz,
  closes_at timestamptz,
  status public.round_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  unique (session_id, round_number)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  chosen_option text not null,
  self_report_value text,
  answered_at timestamptz not null default now(),
  is_correct boolean,
  unique (round_id, participant_id)
);

create table public.vibes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  from_participant uuid not null references public.participants (id) on delete cascade,
  to_participant uuid not null references public.participants (id) on delete cascade,
  status public.vibe_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vibes_no_self_vibe check (from_participant <> to_participant),
  unique (session_id, from_participant, to_participant)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_a uuid not null references public.participants (id) on delete cascade,
  participant_b uuid not null references public.participants (id) on delete cascade,
  matched_at timestamptz not null default now(),
  reveal_stage public.reveal_stage not null default 'hidden',
  first_message_at timestamptz,
  reveal_requested_by_a boolean not null default false,
  reveal_requested_by_b boolean not null default false,
  constraint matches_ordered_participants check (participant_a < participant_b),
  unique (session_id, participant_a, participant_b)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references public.participants (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  sent_at timestamptz not null default now()
);

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  event_type text not null,
  actor_participant_id uuid references public.participants (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index idx_sessions_venue_id on public.sessions (venue_id);
create index idx_sessions_status on public.sessions (status);
create index idx_participants_session_id on public.participants (session_id);
create index idx_participants_participant_token on public.participants (participant_token);
create index idx_rounds_session_id on public.rounds (session_id);
create index idx_rounds_session_status on public.rounds (session_id, status);
create index idx_answers_round_id on public.answers (round_id);
create index idx_answers_participant_id on public.answers (participant_id);
create index idx_vibes_incoming_pending
  on public.vibes (session_id, to_participant, created_at)
  where status = 'pending';
create index idx_vibes_outgoing on public.vibes (session_id, from_participant);
create index idx_matches_session_id on public.matches (session_id);
create index idx_matches_participant_a on public.matches (participant_a);
create index idx_matches_participant_b on public.matches (participant_b);
create index idx_messages_match_id_sent_at on public.messages (match_id, sent_at);
create index idx_domain_events_session_created_at
  on public.domain_events (session_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_vibes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vibes_set_updated_at
before update on public.vibes
for each row
execute function public.set_vibes_updated_at();

-- ---------------------------------------------------------------------------
-- Private helpers (security definer — not callable by clients directly)
-- ---------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create or replace function private.participant_from_token(p_token uuid)
returns public.participants
language sql
stable
security definer
set search_path = public, private
as $$
  select *
  from public.participants
  where participant_token = p_token;
$$;

revoke all on function private.participant_from_token(uuid) from public;
revoke all on function private.participant_from_token(uuid) from anon, authenticated;

create or replace function private.emit_domain_event(
  p_session_id uuid,
  p_event_type text,
  p_actor_participant_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  insert into public.domain_events (
    session_id,
    event_type,
    actor_participant_id,
    payload
  )
  values (
    p_session_id,
    p_event_type,
    p_actor_participant_id,
    p_payload
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function private.emit_domain_event(uuid, text, uuid, jsonb) from public;
revoke all on function private.emit_domain_event(uuid, text, uuid, jsonb) from anon, authenticated;

create or replace function private.generate_handle()
returns text
language plpgsql
as $$
declare
  v_animals text[] := array[
    'Otter', 'Fox', 'Bear', 'Hawk', 'Lynx', 'Wolf', 'Dove', 'Crane',
    'Panda', 'Koala', 'Tiger', 'Eagle', 'Raven', 'Finch', 'Moose'
  ];
begin
  return v_animals[1 + floor(random() * array_length(v_animals, 1))::int]
    || (10 + floor(random() * 90))::text;
end;
$$;

create or replace function private.try_create_match(
  p_session_id uuid,
  p_participant_a uuid,
  p_participant_b uuid,
  p_actor_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_low uuid;
  v_high uuid;
  v_match_id uuid;
begin
  if p_participant_a < p_participant_b then
    v_low := p_participant_a;
    v_high := p_participant_b;
  else
    v_low := p_participant_b;
    v_high := p_participant_a;
  end if;

  insert into public.matches (
    session_id,
    participant_a,
    participant_b
  )
  values (
    p_session_id,
    v_low,
    v_high
  )
  on conflict (session_id, participant_a, participant_b) do nothing
  returning id into v_match_id;

  if v_match_id is not null then
    perform private.emit_domain_event(
      p_session_id,
      'match.created',
      p_actor_participant_id,
      jsonb_build_object(
        'match_id', v_match_id,
        'participant_a', v_low,
        'participant_b', v_high
      )
    );
  end if;

  return v_match_id;
end;
$$;

revoke all on function private.try_create_match(uuid, uuid, uuid, uuid) from public;
revoke all on function private.try_create_match(uuid, uuid, uuid, uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs (v0 API surface)
-- ---------------------------------------------------------------------------

create or replace function public.join_session(
  p_qr_code text,
  p_handle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_handle text;
  v_avatar_seed text;
  v_participant public.participants;
begin
  select *
  into v_session
  from public.sessions
  where qr_code = p_qr_code
    and status in ('scheduled', 'active');

  if not found then
    raise exception 'session_not_found'
      using hint = 'No active session for this QR code.';
  end if;

  v_handle := coalesce(nullif(trim(p_handle), ''), private.generate_handle());
  v_avatar_seed := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.participants (
    session_id,
    handle,
    avatar_seed
  )
  values (
    v_session.id,
    v_handle,
    v_avatar_seed
  )
  returning * into v_participant;

  perform private.emit_domain_event(
    v_session.id,
    'participant.joined',
    v_participant.id,
    jsonb_build_object(
      'participant_id', v_participant.id,
      'handle', v_participant.handle
    )
  );

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'participant_token', v_participant.participant_token,
    'session_id', v_session.id,
    'handle', v_participant.handle,
    'avatar_seed', v_participant.avatar_seed,
    'opener_question_id', v_session.opener_question_id
  );
end;
$$;

create or replace function public.submit_opener(
  p_participant_token uuid,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_session public.sessions;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_session
  from public.sessions
  where id = v_participant.session_id;

  if v_session.opener_question_id is null then
    raise exception 'opener_not_configured';
  end if;

  if v_participant.opener_answer is not null then
    raise exception 'opener_already_submitted';
  end if;

  update public.participants
  set opener_answer = trim(p_answer)
  where id = v_participant.id
  returning * into v_participant;

  perform private.emit_domain_event(
    v_participant.session_id,
    'opener.submitted',
    v_participant.id,
    jsonb_build_object('participant_id', v_participant.id)
  );

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'opener_answer', v_participant.opener_answer
  );
end;
$$;

create or replace function public.submit_answer(
  p_participant_token uuid,
  p_round_id uuid,
  p_chosen_option text,
  p_self_report_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_round public.rounds;
  v_question public.questions;
  v_answer public.answers;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select *
  into v_round
  from public.rounds
  where id = p_round_id
    and session_id = v_participant.session_id;

  if not found then
    raise exception 'round_not_found';
  end if;

  select *
  into v_question
  from public.questions
  where id = v_round.question_id;

  if v_round.status <> 'open' then
    raise exception 'round_not_open';
  end if;

  if v_question.format = 'prediction' and p_self_report_value is null then
    raise exception 'self_report_required';
  end if;

  insert into public.answers (
    round_id,
    participant_id,
    chosen_option,
    self_report_value
  )
  values (
    p_round_id,
    v_participant.id,
    trim(p_chosen_option),
    nullif(trim(p_self_report_value), '')
  )
  returning * into v_answer;

  perform private.emit_domain_event(
    v_participant.session_id,
    'answer.submitted',
    v_participant.id,
    jsonb_build_object(
      'answer_id', v_answer.id,
      'round_id', p_round_id,
      'participant_id', v_participant.id
    )
  );

  return jsonb_build_object(
    'answer_id', v_answer.id,
    'round_id', v_answer.round_id,
    'chosen_option', v_answer.chosen_option,
    'self_report_value', v_answer.self_report_value
  );
end;
$$;

create or replace function public.send_vibe(
  p_participant_token uuid,
  p_to_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_from public.participants;
  v_to public.participants;
  v_vibe public.vibes;
begin
  select * into v_from
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_to
  from public.participants
  where id = p_to_participant_id
    and session_id = v_from.session_id;

  if not found then
    raise exception 'recipient_not_in_session';
  end if;

  if v_from.id = v_to.id then
    raise exception 'cannot_vibe_self';
  end if;

  insert into public.vibes (
    session_id,
    from_participant,
    to_participant
  )
  values (
    v_from.session_id,
    v_from.id,
    v_to.id
  )
  on conflict (session_id, from_participant, to_participant) do update
    set status = case
      when public.vibes.status in ('passed', 'expired') then 'pending'::public.vibe_status
      else public.vibes.status
    end,
    updated_at = now()
  returning * into v_vibe;

  perform private.emit_domain_event(
    v_from.session_id,
    'vibe.sent',
    v_from.id,
    jsonb_build_object(
      'vibe_id', v_vibe.id,
      'from_participant', v_from.id,
      'to_participant', v_to.id
    )
  );

  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'status', v_vibe.status
  );
end;
$$;

create or replace function public.accept_vibe(
  p_participant_token uuid,
  p_vibe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_vibe public.vibes;
  v_reverse_vibe public.vibes;
  v_match_id uuid;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_vibe
  from public.vibes
  where id = p_vibe_id
    and to_participant = v_participant.id
    and session_id = v_participant.session_id
  for update;

  if not found then
    raise exception 'vibe_not_found';
  end if;

  if v_vibe.status <> 'pending' then
    raise exception 'vibe_not_pending';
  end if;

  update public.vibes
  set status = 'accepted'
  where id = v_vibe.id
  returning * into v_vibe;

  perform private.emit_domain_event(
    v_participant.session_id,
    'vibe.accepted',
    v_participant.id,
    jsonb_build_object('vibe_id', v_vibe.id)
  );

  -- Auto-accept reciprocal pending vibe if sender already vibed back.
  update public.vibes
  set status = 'accepted'
  where session_id = v_participant.session_id
    and from_participant = v_participant.id
    and to_participant = v_vibe.from_participant
    and status = 'pending'
  returning * into v_reverse_vibe;

  if v_reverse_vibe.id is not null then
    perform private.emit_domain_event(
      v_participant.session_id,
      'vibe.accepted',
      v_participant.id,
      jsonb_build_object('vibe_id', v_reverse_vibe.id)
    );
  end if;

  -- Mutual interest: both sides have accepted vibes toward each other.
  if exists (
    select 1
    from public.vibes
    where session_id = v_participant.session_id
      and from_participant = v_participant.id
      and to_participant = v_vibe.from_participant
      and status = 'accepted'
  ) then
    v_match_id := private.try_create_match(
      v_participant.session_id,
      v_participant.id,
      v_vibe.from_participant,
      v_participant.id
    );
  end if;

  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'status', v_vibe.status,
    'match_id', v_match_id
  );
end;
$$;

create or replace function public.pass_vibe(
  p_participant_token uuid,
  p_vibe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_vibe public.vibes;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_vibe
  from public.vibes
  where id = p_vibe_id
    and to_participant = v_participant.id
    and session_id = v_participant.session_id
  for update;

  if not found then
    raise exception 'vibe_not_found';
  end if;

  if v_vibe.status <> 'pending' then
    raise exception 'vibe_not_pending';
  end if;

  update public.vibes
  set status = 'passed'
  where id = v_vibe.id
  returning * into v_vibe;

  -- Silent pass: no domain event to the sender.
  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'status', v_vibe.status
  );
end;
$$;

create or replace function public.send_message(
  p_participant_token uuid,
  p_match_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_match public.matches;
  v_message public.messages;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
    and session_id = v_participant.session_id
    and (participant_a = v_participant.id or participant_b = v_participant.id);

  if not found then
    raise exception 'match_not_found';
  end if;

  insert into public.messages (
    match_id,
    sender_id,
    body
  )
  values (
    p_match_id,
    v_participant.id,
    trim(p_body)
  )
  returning * into v_message;

  if v_match.first_message_at is null then
    update public.matches
    set first_message_at = v_message.sent_at
    where id = v_match.id;
  end if;

  perform private.emit_domain_event(
    v_participant.session_id,
    'message.sent',
    v_participant.id,
    jsonb_build_object(
      'message_id', v_message.id,
      'match_id', p_match_id
    )
  );

  return jsonb_build_object(
    'message_id', v_message.id,
    'match_id', v_message.match_id,
    'sent_at', v_message.sent_at
  );
end;
$$;

create or replace function public.request_reveal(
  p_participant_token uuid,
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_match public.matches;
  v_is_a boolean;
  v_other_requested boolean;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
    and session_id = v_participant.session_id
    and (participant_a = v_participant.id or participant_b = v_participant.id)
  for update;

  if not found then
    raise exception 'match_not_found';
  end if;

  if v_match.reveal_stage <> 'blurred' then
    raise exception 'reveal_not_available';
  end if;

  v_is_a := v_participant.id = v_match.participant_a;

  if v_is_a then
    v_other_requested := v_match.reveal_requested_by_b;
    update public.matches
    set reveal_requested_by_a = true
    where id = v_match.id
    returning * into v_match;
  else
    v_other_requested := v_match.reveal_requested_by_a;
    update public.matches
    set reveal_requested_by_b = true
    where id = v_match.id
    returning * into v_match;
  end if;

  if v_other_requested then
    update public.matches
    set reveal_stage = 'revealed'
    where id = v_match.id
    returning * into v_match;

    perform private.emit_domain_event(
      v_participant.session_id,
      'reveal.stage_changed',
      v_participant.id,
      jsonb_build_object(
        'match_id', v_match.id,
        'reveal_stage', v_match.reveal_stage
      )
    );
  end if;

  return jsonb_build_object(
    'match_id', v_match.id,
    'reveal_stage', v_match.reveal_stage,
    'reveal_requested_by_a', v_match.reveal_requested_by_a,
    'reveal_requested_by_b', v_match.reveal_requested_by_b
  );
end;
$$;

create or replace function public.advance_round(
  p_session_id uuid,
  p_question_id uuid,
  p_round_number integer,
  p_duration_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_round public.rounds;
begin
  -- Host/admin action for v0. Restrict to service_role callers via grants below.
  update public.rounds
  set status = 'closed',
      closes_at = coalesce(closes_at, now())
  where session_id = p_session_id
    and status = 'open';

  insert into public.rounds (
    session_id,
    question_id,
    round_number,
    opens_at,
    closes_at,
    status
  )
  values (
    p_session_id,
    p_question_id,
    p_round_number,
    now(),
    now() + make_interval(secs => p_duration_seconds),
    'open'
  )
  returning * into v_round;

  perform private.emit_domain_event(
    p_session_id,
    'round.opened',
    null,
    jsonb_build_object(
      'round_id', v_round.id,
      'round_number', v_round.round_number,
      'opens_at', v_round.opens_at,
      'closes_at', v_round.closes_at
    )
  );

  return jsonb_build_object(
    'round_id', v_round.id,
    'round_number', v_round.round_number,
    'opens_at', v_round.opens_at,
    'closes_at', v_round.closes_at,
    'status', v_round.status
  );
end;
$$;

create or replace function public.advance_reveal_stages(
  p_min_chat_minutes integer default 5
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_updated integer := 0;
  v_match record;
begin
  for v_match in
    select m.*
    from public.matches m
    where m.reveal_stage = 'hidden'
      and m.first_message_at is not null
      and m.first_message_at <= now() - make_interval(mins => p_min_chat_minutes)
      and exists (
        select 1
        from public.messages msg_a
        where msg_a.match_id = m.id
          and msg_a.sender_id = m.participant_a
      )
      and exists (
        select 1
        from public.messages msg_b
        where msg_b.match_id = m.id
          and msg_b.sender_id = m.participant_b
      )
  loop
    update public.matches
    set reveal_stage = 'blurred'
    where id = v_match.id;

    perform private.emit_domain_event(
      v_match.session_id,
      'reveal.stage_changed',
      null,
      jsonb_build_object(
        'match_id', v_match.id,
        'reveal_stage', 'blurred'
      )
    );

    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant execute on function public.join_session(text, text) to anon, authenticated;
grant execute on function public.submit_opener(uuid, text) to anon, authenticated;
grant execute on function public.submit_answer(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.send_vibe(uuid, uuid) to anon, authenticated;
grant execute on function public.accept_vibe(uuid, uuid) to anon, authenticated;
grant execute on function public.pass_vibe(uuid, uuid) to anon, authenticated;
grant execute on function public.send_message(uuid, uuid, text) to anon, authenticated;
grant execute on function public.request_reveal(uuid, uuid) to anon, authenticated;
grant execute on function public.advance_round(uuid, uuid, integer, integer) to service_role;
grant execute on function public.advance_reveal_stages(integer) to service_role;

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.venues enable row level security;
alter table public.sessions enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;
alter table public.vibes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.domain_events enable row level security;

-- v0: all participant reads/writes go through SECURITY DEFINER RPCs.
-- Direct table access is service_role only until participant-scoped JWT/RLS is added.

create policy "service_role_all_venues"
  on public.venues
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_sessions"
  on public.sessions
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_questions"
  on public.questions
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_participants"
  on public.participants
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_rounds"
  on public.rounds
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_answers"
  on public.answers
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_vibes"
  on public.vibes
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_matches"
  on public.matches
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_messages"
  on public.messages
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_domain_events"
  on public.domain_events
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.answers;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.vibes;

-- ---------------------------------------------------------------------------
-- Cron (gradual reveal — runs via service role / pg_cron)
-- ---------------------------------------------------------------------------

select cron.schedule(
  'roomfull-advance-reveal-stages',
  '* * * * *',
  $$select public.advance_reveal_stages(5);$$
);
