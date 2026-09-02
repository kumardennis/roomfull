-- Session trivia FSM: clock-driven phases, system round plan, auto-advance.

create type public.session_phase as enum (
  'scheduled',
  'opener',
  'round_live',
  'round_interstitial',
  'social',
  'ended'
);

alter table public.sessions
  add column if not exists scheduled_starts_at timestamptz,
  add column if not exists phase public.session_phase not null default 'scheduled',
  add column if not exists phase_deadline timestamptz,
  add column if not exists opener_window_sec integer not null default 600,
  add column if not exists interstitial_sec integer not null default 900,
  add column if not exists round_duration_sec integer not null default 90,
  add column if not exists current_plan_index integer not null default -1,
  add column if not exists paused_at timestamptz;

create table if not exists public.session_round_plan (
  session_id uuid not null references public.sessions (id) on delete cascade,
  position integer not null check (position >= 0),
  question_id uuid not null references public.questions (id),
  duration_sec integer not null default 90 check (duration_sec > 0),
  primary key (session_id, position),
  unique (session_id, question_id)
);

create index if not exists idx_session_round_plan_session
  on public.session_round_plan (session_id, position);

alter table public.session_round_plan enable row level security;

create policy "service_role_all_session_round_plan"
  on public.session_round_plan
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- FSM helpers
-- ---------------------------------------------------------------------------

create or replace function private.plan_round_count(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select count(*)::int
  from public.session_round_plan
  where session_id = p_session_id;
$$;

create or replace function private.close_open_round(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_round public.rounds;
begin
  update public.rounds
  set status = 'closed',
      closes_at = coalesce(closes_at, now())
  where session_id = p_session_id
    and status = 'open'
  returning * into v_round;

  if found then
    perform private.emit_domain_event(
      p_session_id,
      'round.closed',
      null,
      jsonb_build_object(
        'round_id', v_round.id,
        'round_number', v_round.round_number
      )
    );
  end if;
end;
$$;

create or replace function private.open_planned_round(
  p_session public.sessions,
  p_plan_position integer
)
returns public.rounds
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_plan public.session_round_plan;
  v_round public.rounds;
  v_duration integer;
begin
  select * into v_plan
  from public.session_round_plan
  where session_id = p_session.id
    and position = p_plan_position;

  if not found then
    raise exception 'round_plan_not_found'
      using hint = format('No planned round at position %s.', p_plan_position);
  end if;

  v_duration := coalesce(v_plan.duration_sec, p_session.round_duration_sec);

  perform private.close_open_round(p_session.id);

  insert into public.rounds (
    session_id,
    question_id,
    round_number,
    opens_at,
    closes_at,
    status
  )
  values (
    p_session.id,
    v_plan.question_id,
    p_plan_position + 1,
    now(),
    now() + make_interval(secs => v_duration),
    'open'
  )
  returning * into v_round;

  update public.sessions
  set current_plan_index = p_plan_position
  where id = p_session.id;

  perform private.emit_domain_event(
    p_session.id,
    'round.opened',
    null,
    jsonb_build_object(
      'round_id', v_round.id,
      'round_number', v_round.round_number,
      'opens_at', v_round.opens_at,
      'closes_at', v_round.closes_at,
      'plan_position', p_plan_position
    )
  );

  return v_round;
end;
$$;

create or replace function private.transition_session(
  p_session_id uuid,
  p_event text,
  p_actor text default 'system',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_round public.rounds;
  v_plan_count integer;
  v_next_index integer;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.paused_at is not null
    and p_event not in ('HOST_RESUME', 'HOST_FORCE_END') then
    return jsonb_build_object(
      'session_id', v_session.id,
      'phase', v_session.phase,
      'skipped', true,
      'reason', 'paused'
    );
  end if;

  v_plan_count := private.plan_round_count(v_session.id);

  case p_event
    when 'EVENT_START' then
      if v_session.status <> 'scheduled' or v_session.phase <> 'scheduled' then
        raise exception 'invalid_transition'
          using hint = format('EVENT_START invalid from %s/%s', v_session.status, v_session.phase);
      end if;

      update public.sessions
      set status = 'active',
          phase = 'opener',
          phase_deadline = now() + make_interval(secs => opener_window_sec),
          started_at = coalesce(started_at, now())
      where id = p_session_id
      returning * into v_session;

      perform private.emit_domain_event(
        p_session_id,
        'session.started',
        null,
        jsonb_build_object('actor', p_actor)
      );

    when 'OPENER_END' then
      if v_session.phase <> 'opener' then
        raise exception 'invalid_transition'
          using hint = format('OPENER_END invalid from phase %s', v_session.phase);
      end if;

      if v_plan_count = 0 then
        update public.sessions
        set phase = 'social',
            phase_deadline = ends_at,
            current_plan_index = -1
        where id = p_session_id
        returning * into v_session;
      else
        v_round := private.open_planned_round(v_session, 0);

        update public.sessions
        set phase = 'round_live',
            phase_deadline = v_round.closes_at
        where id = p_session_id
        returning * into v_session;
      end if;

    when 'ROUND_CLOSE' then
      if v_session.phase <> 'round_live' then
        raise exception 'invalid_transition'
          using hint = format('ROUND_CLOSE invalid from phase %s', v_session.phase);
      end if;

      perform private.close_open_round(p_session_id);

      update public.sessions
      set phase = 'round_interstitial',
          phase_deadline = now() + make_interval(secs => interstitial_sec)
      where id = p_session_id
      returning * into v_session;

    when 'INTERSTITIAL_END' then
      if v_session.phase <> 'round_interstitial' then
        raise exception 'invalid_transition'
          using hint = format('INTERSTITIAL_END invalid from phase %s', v_session.phase);
      end if;

      v_next_index := v_session.current_plan_index + 1;

      if v_next_index < v_plan_count then
        v_round := private.open_planned_round(v_session, v_next_index);

        update public.sessions
        set phase = 'round_live',
            phase_deadline = v_round.closes_at
        where id = p_session_id
        returning * into v_session;
      else
        update public.sessions
        set phase = 'social',
            phase_deadline = ends_at
        where id = p_session_id
        returning * into v_session;
      end if;

    when 'SESSION_END' then
      if v_session.phase = 'ended' then
        return jsonb_build_object('session_id', v_session.id, 'phase', 'ended', 'noop', true);
      end if;

      perform private.close_open_round(p_session_id);

      update public.sessions
      set status = 'ended',
          phase = 'ended',
          phase_deadline = null
      where id = p_session_id
      returning * into v_session;

      perform private.emit_domain_event(
        p_session_id,
        'session.ended',
        null,
        jsonb_build_object('actor', p_actor)
      );

    when 'HOST_PAUSE' then
      update public.sessions
      set paused_at = coalesce(paused_at, now())
      where id = p_session_id
      returning * into v_session;

    when 'HOST_RESUME' then
      update public.sessions
      set paused_at = null
      where id = p_session_id
      returning * into v_session;

    when 'HOST_FORCE_END' then
      perform private.close_open_round(p_session_id);

      update public.sessions
      set status = 'ended',
          phase = 'ended',
          phase_deadline = null,
          paused_at = null
      where id = p_session_id
      returning * into v_session;

      perform private.emit_domain_event(
        p_session_id,
        'session.ended',
        null,
        jsonb_build_object('actor', p_actor, 'forced', true)
      );

    else
      raise exception 'unknown_session_event'
        using hint = p_event;
  end case;

  if p_event not in ('HOST_PAUSE', 'HOST_RESUME') then
    perform private.emit_domain_event(
      p_session_id,
      'session.phase_changed',
      null,
      jsonb_build_object(
        'phase', v_session.phase,
        'phase_deadline', v_session.phase_deadline,
        'event', p_event,
        'actor', p_actor
      )
    );
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'phase', v_session.phase,
    'phase_deadline', v_session.phase_deadline,
    'current_plan_index', v_session.current_plan_index,
    'paused', v_session.paused_at is not null
  );
end;
$$;

create or replace function public.session_tick()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_processed integer := 0;
  v_open_closes_at timestamptz;
begin
  for v_session in
    select *
    from public.sessions
    where status in ('scheduled', 'active')
      and phase <> 'ended'
      and paused_at is null
    for update skip locked
  loop
    if v_session.status = 'scheduled'
      and v_session.phase = 'scheduled'
      and v_session.scheduled_starts_at is not null
      and now() >= v_session.scheduled_starts_at then
      perform private.transition_session(v_session.id, 'EVENT_START', 'scheduler');
      v_processed := v_processed + 1;
      continue;
    end if;

    if v_session.status <> 'active' then
      continue;
    end if;

    if v_session.phase = 'opener'
      and v_session.phase_deadline is not null
      and now() >= v_session.phase_deadline then
      perform private.transition_session(v_session.id, 'OPENER_END', 'scheduler');
      v_processed := v_processed + 1;
      continue;
    end if;

    if v_session.phase = 'round_live' then
      select closes_at into v_open_closes_at
      from public.rounds
      where session_id = v_session.id
        and status = 'open'
      order by round_number desc
      limit 1;

      if v_open_closes_at is not null and now() >= v_open_closes_at then
        perform private.transition_session(v_session.id, 'ROUND_CLOSE', 'scheduler');
        v_processed := v_processed + 1;
        continue;
      end if;
    end if;

    if v_session.phase = 'round_interstitial'
      and v_session.phase_deadline is not null
      and now() >= v_session.phase_deadline then
      perform private.transition_session(v_session.id, 'INTERSTITIAL_END', 'scheduler');
      v_processed := v_processed + 1;
      continue;
    end if;

    if v_session.phase = 'social'
      and v_session.ends_at is not null
      and now() >= v_session.ends_at then
      perform private.transition_session(v_session.id, 'SESSION_END', 'scheduler');
      v_processed := v_processed + 1;
    end if;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.session_tick() from public;
grant execute on function public.session_tick() to service_role;

select cron.schedule(
  'roomfull-session-tick',
  '* * * * *',
  $$select public.session_tick();$$
);

-- ---------------------------------------------------------------------------
-- Read RPC: session state includes FSM fields
-- ---------------------------------------------------------------------------

create or replace function public.get_session_state(p_participant_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_session public.sessions;
  v_venue public.venues;
  v_open_round public.rounds;
  v_opener public.questions;
  v_plan_count integer;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_session
  from public.sessions
  where id = v_participant.session_id;

  select * into v_venue
  from public.venues
  where id = v_session.venue_id;

  v_plan_count := private.plan_round_count(v_session.id);

  select * into v_open_round
  from public.rounds
  where session_id = v_session.id
    and status = 'open'
  order by round_number desc
  limit 1;

  if v_session.opener_question_id is not null then
    select * into v_opener
    from public.questions
    where id = v_session.opener_question_id;
  end if;

  return jsonb_build_object(
    'participant', jsonb_build_object(
      'id', v_participant.id,
      'handle', v_participant.handle,
      'avatar_seed', v_participant.avatar_seed,
      'opener_answer', v_participant.opener_answer,
      'needs_opener', v_participant.opener_answer is null
    ),
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'phase', v_session.phase,
      'phase_deadline', v_session.phase_deadline,
      'scheduled_starts_at', v_session.scheduled_starts_at,
      'ends_at', v_session.ends_at,
      'paused', v_session.paused_at is not null,
      'venue_name', v_venue.name,
      'round_progress', jsonb_build_object(
        'current', case
          when v_session.current_plan_index < 0 then 0
          else v_session.current_plan_index + 1
        end,
        'total', v_plan_count
      )
    ),
    'opener_question', case
      when v_opener.id is null then null
      else jsonb_build_object(
        'id', v_opener.id,
        'format', v_opener.format,
        'prompt', v_opener.prompt,
        'options', v_opener.options
      )
    end,
    'open_round', case
      when v_open_round.id is null then null
      else (
        select jsonb_build_object(
          'id', r.id,
          'round_number', r.round_number,
          'opens_at', r.opens_at,
          'closes_at', r.closes_at,
          'status', r.status,
          'question', jsonb_build_object(
            'id', q.id,
            'format', q.format,
            'prompt', q.prompt,
            'options', q.options,
            'self_report_prompt', q.self_report_prompt
          ),
          'my_answer', (
            select jsonb_build_object(
              'chosen_option', a.chosen_option,
              'self_report_value', a.self_report_value
            )
            from public.answers a
            where a.round_id = r.id
              and a.participant_id = v_participant.id
          )
        )
        from public.rounds r
        join public.questions q on q.id = r.question_id
        where r.id = v_open_round.id
      )
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Join: allow mid-session; block only ended sessions
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
      using hint = 'No joinable session for this QR code.';
  end if;

  v_handle := coalesce(nullif(trim(p_handle), ''), private.generate_handle());
  v_avatar_seed := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.participants (
    session_id,
    handle,
    avatar_seed,
    auth_user_id
  )
  values (
    v_session.id,
    v_handle,
    v_avatar_seed,
    auth.uid()
  )
  returning * into v_participant;

  perform private.emit_domain_event(
    v_session.id,
    'participant.joined',
    v_participant.id,
    jsonb_build_object(
      'participant_id', v_participant.id,
      'handle', v_participant.handle,
      'session_phase', v_session.phase
    )
  );

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'participant_token', v_participant.participant_token,
    'session_id', v_session.id,
    'handle', v_participant.handle,
    'avatar_seed', v_participant.avatar_seed,
    'opener_question_id', v_session.opener_question_id,
    'session_phase', v_session.phase,
    'needs_opener', true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Opener: allowed any time before participant has answered
-- ---------------------------------------------------------------------------

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

  if v_session.status = 'ended' or v_session.phase = 'ended' then
    raise exception 'session_ended';
  end if;

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

-- ---------------------------------------------------------------------------
-- Host ops: pause / resume / force end (no question picking)
-- ---------------------------------------------------------------------------

create or replace function private.assert_host_pin(
  p_host_pin text,
  p_session_id uuid
)
returns public.sessions
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
    and host_pin = p_host_pin;

  if not found then
    raise exception 'invalid_host_pin';
  end if;

  return v_session;
end;
$$;

create or replace function public.host_pause_session(p_host_pin text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.assert_host_pin(p_host_pin, p_session_id);
  return private.transition_session(p_session_id, 'HOST_PAUSE', 'host');
end;
$$;

create or replace function public.host_resume_session(p_host_pin text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.assert_host_pin(p_host_pin, p_session_id);
  return private.transition_session(p_session_id, 'HOST_RESUME', 'host');
end;
$$;

create or replace function public.host_force_end_session(p_host_pin text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.assert_host_pin(p_host_pin, p_session_id);
  return private.transition_session(p_session_id, 'HOST_FORCE_END', 'host');
end;
$$;

create or replace function public.get_host_session(p_host_pin text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_plan_count integer;
begin
  v_session := private.assert_host_pin(p_host_pin, p_session_id);
  v_plan_count := private.plan_round_count(v_session.id);

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'phase', v_session.phase,
    'phase_deadline', v_session.phase_deadline,
    'scheduled_starts_at', v_session.scheduled_starts_at,
    'ends_at', v_session.ends_at,
    'paused', v_session.paused_at is not null,
    'participant_count', (
      select count(*)::int from public.participants where session_id = v_session.id
    ),
    'round_progress', jsonb_build_object(
      'current', case
        when v_session.current_plan_index < 0 then 0
        else v_session.current_plan_index + 1
      end,
      'total', v_plan_count
    ),
    'rounds', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'round_number', r.round_number,
            'status', r.status,
            'opens_at', r.opens_at,
            'closes_at', r.closes_at,
            'question_prompt', q.prompt
          )
          order by r.round_number
        )
        from public.rounds r
        join public.questions q on q.id = r.question_id
        where r.session_id = v_session.id
      ),
      '[]'::jsonb
    ),
    'round_plan', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'position', p.position,
            'question_id', p.question_id,
            'prompt', q.prompt,
            'format', q.format,
            'duration_sec', p.duration_sec
          )
          order by p.position
        )
        from public.session_round_plan p
        join public.questions q on q.id = p.question_id
        where p.session_id = v_session.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.host_pause_session(text, uuid) to anon, authenticated;
grant execute on function public.host_resume_session(text, uuid) to anon, authenticated;
grant execute on function public.host_force_end_session(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dev seed: clock-started session + 3-round plan
-- ---------------------------------------------------------------------------

with venue as (
  select id from public.venues where slug = 'copper-fox'
),
opener as (
  select id from public.questions where prompt = 'Coffee or tea?' limit 1
),
upserted_session as (
  insert into public.sessions (
    venue_id,
    qr_code,
    status,
    phase,
    opener_question_id,
    host_pin,
    scheduled_starts_at,
    started_at,
    ends_at,
    phase_deadline,
    opener_window_sec,
    interstitial_sec
  )
  select
    venue.id,
    'dev-night-001',
    'active',
    'opener',
    opener.id,
    'fox2026',
    now() - interval '5 minutes',
    now() - interval '5 minutes',
    now() + interval '6 hours',
    now() + interval '5 minutes',
    600,
    900
  from venue, opener
  on conflict (qr_code) do update
    set status = excluded.status,
        phase = excluded.phase,
        host_pin = excluded.host_pin,
        opener_question_id = excluded.opener_question_id,
        scheduled_starts_at = excluded.scheduled_starts_at,
        started_at = excluded.started_at,
        ends_at = excluded.ends_at,
        phase_deadline = excluded.phase_deadline,
        opener_window_sec = excluded.opener_window_sec,
        interstitial_sec = excluded.interstitial_sec,
        current_plan_index = -1,
        paused_at = null
  returning id
),
session_row as (
  select id from upserted_session
  union all
  select id from public.sessions where qr_code = 'dev-night-001'
  limit 1
),
plan_questions as (
  select id, row_number() over (order by prompt) - 1 as position
  from public.questions
  where prompt in (
    'Beach vacation or mountain cabin?',
    'Pineapple belongs on pizza.',
    'What percentage of people here have seen Star Wars?'
  )
)
insert into public.session_round_plan (session_id, position, question_id, duration_sec)
select session_row.id, plan_questions.position, plan_questions.id, 90
from session_row, plan_questions
on conflict (session_id, position) do update
  set question_id = excluded.question_id,
      duration_sec = excluded.duration_sec;
