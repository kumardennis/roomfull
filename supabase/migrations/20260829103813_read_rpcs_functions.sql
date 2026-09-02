-- ---------------------------------------------------------------------------
-- Read RPCs
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
      'opener_answer', v_participant.opener_answer
    ),
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'venue_name', v_venue.name
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

create or replace function public.get_leaderboard(p_participant_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  return coalesce(
    (
      select jsonb_agg(row_data order by score desc, handle asc)
      from (
        select jsonb_build_object(
          'participant_id', p.id,
          'handle', p.handle,
          'avatar_seed', p.avatar_seed,
          'score', coalesce((
            select count(*)::int
            from public.answers a
            join public.rounds r on r.id = a.round_id
            where a.participant_id = p.id
              and r.session_id = p.session_id
              and a.is_correct is true
          ), 0),
          'is_me', p.id = v_participant.id
        ) as row_data,
        coalesce((
          select count(*)::int
          from public.answers a
          join public.rounds r on r.id = a.round_id
          where a.participant_id = p.id
            and r.session_id = p.session_id
            and a.is_correct is true
        ), 0) as score,
        p.handle
        from public.participants p
        where p.session_id = v_participant.session_id
      ) ranked
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_answer_trail(
  p_participant_token uuid,
  p_target_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_target public.participants;
  v_session public.sessions;
  v_opener public.questions;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_target
  from public.participants
  where id = p_target_participant_id
    and session_id = v_participant.session_id;

  if not found then
    raise exception 'participant_not_in_session';
  end if;

  select * into v_session
  from public.sessions
  where id = v_participant.session_id;

  if v_session.opener_question_id is not null then
    select * into v_opener
    from public.questions
    where id = v_session.opener_question_id;
  end if;

  return jsonb_build_object(
    'participant_id', v_target.id,
    'handle', v_target.handle,
    'avatar_seed', v_target.avatar_seed,
    'opener', case
      when v_opener.id is null then null
      else jsonb_build_object(
        'prompt', v_opener.prompt,
        'answer', v_target.opener_answer
      )
    end,
    'rounds', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'round_number', r.round_number,
            'prompt', q.prompt,
            'format', q.format,
            'chosen_option', a.chosen_option,
            'self_report_value', a.self_report_value
          )
          order by r.round_number
        )
        from public.answers a
        join public.rounds r on r.id = a.round_id
        join public.questions q on q.id = r.question_id
        where a.participant_id = v_target.id
          and r.session_id = v_target.session_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_incoming_vibe(p_participant_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_vibe public.vibes;
  v_sender public.participants;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_vibe
  from public.vibes
  where session_id = v_participant.session_id
    and to_participant = v_participant.id
    and status = 'pending'
  order by created_at asc
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_sender
  from public.participants
  where id = v_vibe.from_participant;

  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'from_participant_id', v_sender.id,
    'handle', v_sender.handle,
    'avatar_seed', v_sender.avatar_seed,
    'answer_trail', public.get_answer_trail(p_participant_token, v_sender.id)
  );
end;
$$;

create or replace function public.get_my_matches(p_participant_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  return coalesce(
    (
      select jsonb_agg(match_row order by matched_at desc)
      from (
        select jsonb_build_object(
          'match_id', m.id,
          'matched_at', m.matched_at,
          'reveal_stage', m.reveal_stage,
          'reveal_requested_by_me', case
            when m.participant_a = v_participant.id then m.reveal_requested_by_a
            else m.reveal_requested_by_b
          end,
          'reveal_requested_by_other', case
            when m.participant_a = v_participant.id then m.reveal_requested_by_b
            else m.reveal_requested_by_a
          end,
          'other_participant', jsonb_build_object(
            'id', other_p.id,
            'handle', other_p.handle,
            'avatar_seed', other_p.avatar_seed
          )
        ) as match_row,
        m.matched_at
        from public.matches m
        join public.participants other_p on other_p.id = case
          when m.participant_a = v_participant.id then m.participant_b
          else m.participant_a
        end
        where m.session_id = v_participant.session_id
          and (m.participant_a = v_participant.id or m.participant_b = v_participant.id)
      ) ordered_matches
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_chat_messages(
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
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  if not exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.session_id = v_participant.session_id
      and (m.participant_a = v_participant.id or m.participant_b = v_participant.id)
  ) then
    raise exception 'match_not_found';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', msg.id,
          'sender_id', msg.sender_id,
          'body', msg.body,
          'sent_at', msg.sent_at,
          'is_mine', msg.sender_id = v_participant.id
        )
        order by msg.sent_at
      )
      from public.messages msg
      where msg.match_id = p_match_id
    ),
    '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Host RPC (validates host_pin instead of service_role)
-- ---------------------------------------------------------------------------

create or replace function public.advance_round_as_host(
  p_host_pin text,
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
  v_session public.sessions;
  v_round public.rounds;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
    and host_pin = p_host_pin;

  if not found then
    raise exception 'invalid_host_pin';
  end if;

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

create or replace function public.get_host_session(p_host_pin text, p_session_id uuid)
returns jsonb
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

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'participant_count', (
      select count(*)::int from public.participants where session_id = v_session.id
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
    'questions', (
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'format', q.format,
          'prompt', q.prompt
        )
        order by q.created_at
      )
      from public.questions q
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.get_session_state(uuid) to anon, authenticated;
grant execute on function public.get_leaderboard(uuid) to anon, authenticated;
grant execute on function public.get_answer_trail(uuid, uuid) to anon, authenticated;
grant execute on function public.get_incoming_vibe(uuid) to anon, authenticated;
grant execute on function public.get_my_matches(uuid) to anon, authenticated;
grant execute on function public.get_chat_messages(uuid, uuid) to anon, authenticated;
grant execute on function public.advance_round_as_host(text, uuid, uuid, integer, integer) to anon, authenticated;
grant execute on function public.get_host_session(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dev seed data (safe to re-run: uses fixed slugs/codes)
-- ---------------------------------------------------------------------------

insert into public.venues (name, slug)
values ('The Copper Fox', 'copper-fox')
on conflict (slug) do nothing;

insert into public.questions (format, prompt, options, self_report_prompt)
select * from (values
  (
    'this_or_that'::public.question_format,
    'Coffee or tea?',
    '["Coffee", "Tea"]'::jsonb,
    null::text
  ),
  (
    'this_or_that'::public.question_format,
    'Beach vacation or mountain cabin?',
    '["Beach", "Mountains"]'::jsonb,
    null::text
  ),
  (
    'hot_take'::public.question_format,
    'Pineapple belongs on pizza.',
    '["Strongly agree", "Agree", "Disagree", "Strongly disagree"]'::jsonb,
    null::text
  ),
  (
    'superlative'::public.question_format,
    'Who in this room is most likely to start a dance circle?',
    '[]'::jsonb,
    null::text
  ),
  (
    'prediction'::public.question_format,
    'What percentage of people here have seen Star Wars?',
    '["0-25%", "26-50%", "51-75%", "76-100%"]'::jsonb,
    'Have you seen Star Wars?'
  )
) as seed(format, prompt, options, self_report_prompt)
where not exists (
  select 1 from public.questions where prompt = seed.prompt
);

with venue as (
  select id from public.venues where slug = 'copper-fox'
),
opener as (
  select id from public.questions
  where prompt = 'Coffee or tea?'
  limit 1
)
insert into public.sessions (venue_id, qr_code, status, opener_question_id, host_pin)
select venue.id, 'dev-night-001', 'active', opener.id, 'fox2026'
from venue, opener
on conflict (qr_code) do update
  set status = excluded.status,
      host_pin = excluded.host_pin,
      opener_question_id = excluded.opener_question_id;
