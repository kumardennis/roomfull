-- Leaderboard points only for scored rounds: prediction (+ future games with correct_option).
-- Opinion rounds (hot_take, this_or_that, etc.) feed the answer trail / vibe roster only.

create or replace function private.question_is_scored(
  p_format public.question_format,
  p_correct_option text
)
returns boolean
language sql
immutable
as $$
  select p_format = 'prediction' or p_correct_option is not null;
$$;

create or replace function private.score_round_answers(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_question public.questions;
  v_yes_count integer;
  v_total integer;
  v_pct numeric;
  v_correct_bucket text;
begin
  select q.* into v_question
  from public.rounds r
  join public.questions q on q.id = r.question_id
  where r.id = p_round_id;

  if not found then
    return;
  end if;

  if not private.question_is_scored(v_question.format, v_question.correct_option) then
    return;
  end if;

  if v_question.format = 'prediction' then
    select
      count(*) filter (
        where lower(trim(coalesce(a.self_report_value, ''))) in ('yes', 'y', 'true', '1')
      ),
      count(*) filter (
        where nullif(trim(coalesce(a.self_report_value, '')), '') is not null
      )
    into v_yes_count, v_total
    from public.answers a
    where a.round_id = p_round_id;

    if v_total = 0 then
      return;
    end if;

    v_pct := (v_yes_count::numeric / v_total) * 100;

    v_correct_bucket := case
      when v_pct <= 25 then '0-25%'
      when v_pct <= 50 then '26-50%'
      when v_pct <= 75 then '51-75%'
      else '76-100%'
    end;

    update public.answers
    set is_correct = (chosen_option = v_correct_bucket)
    where round_id = p_round_id;

    return;
  end if;

  if v_question.correct_option is not null then
    update public.answers
    set is_correct = (chosen_option = v_question.correct_option)
    where round_id = p_round_id;
  end if;
end;
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
    perform private.score_round_answers(v_round.id);

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

create or replace function private.participant_score(
  p_participant_id uuid,
  p_session_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((
    select count(*)::int
    from public.answers a
    join public.rounds r on r.id = a.round_id
    join public.questions q on q.id = r.question_id
    where a.participant_id = p_participant_id
      and r.session_id = p_session_id
      and a.is_correct is true
      and private.question_is_scored(q.format, q.correct_option)
  ), 0);
$$;

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
      'leaderboard_scoring', exists (
        select 1
        from public.session_round_plan srp
        join public.questions q on q.id = srp.question_id
        where srp.session_id = v_session.id
          and private.question_is_scored(q.format, q.correct_option)
      ),
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
            'self_report_prompt', q.self_report_prompt,
            'is_scored', private.question_is_scored(q.format, q.correct_option)
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

-- Re-score any closed prediction rounds that predate this migration
do $$
declare
  v_round public.rounds;
begin
  for v_round in
    select r.*
    from public.rounds r
    join public.questions q on q.id = r.question_id
    where r.status = 'closed'
      and private.question_is_scored(q.format, q.correct_option)
  loop
    perform private.score_round_answers(v_round.id);
  end loop;
end;
$$;
