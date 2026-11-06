-- Core loop regression tests (pgTAP).
-- Run: supabase start && supabase test db
-- Isolated fixtures; entire file runs in a transaction that rolls back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixture IDs
create temporary table fixture (
  venue_id uuid,
  session_id uuid,
  qr_code text,
  opener_id uuid,
  opinion_id uuid,
  prediction_id uuid,
  ttol_id uuid,
  token uuid,
  participant_id uuid,
  opinion_round_id uuid,
  prediction_round_id uuid,
  ttol_round_id uuid
);

insert into fixture default values;

do $$
declare
  v_venue_id uuid;
  v_session_id uuid;
  v_qr text := 'core-loop-' || substr(gen_random_uuid()::text, 1, 8);
  v_opener_id uuid;
  v_opinion_id uuid;
  v_prediction_id uuid;
  v_ttol_id uuid;
  v_join jsonb;
  v_token uuid;
  v_participant_id uuid;
  v_opinion_round_id uuid;
  v_prediction_round_id uuid;
  v_ttol_round_id uuid;
begin
  insert into public.venues (name, slug)
  values ('Core Loop Test Venue', 'core-loop-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_venue_id;

  insert into public.questions (format, prompt, options, self_report_prompt, correct_option)
  values (
    'this_or_that',
    'CORE_LOOP_TEST opener coffee?',
    '["Coffee","Tea"]'::jsonb,
    null,
    null
  )
  returning id into v_opener_id;

  insert into public.questions (format, prompt, options, self_report_prompt, correct_option)
  values (
    'hot_take',
    'CORE_LOOP_TEST pineapple pizza',
    '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb,
    null,
    null
  )
  returning id into v_opinion_id;

  insert into public.questions (format, prompt, options, self_report_prompt, correct_option)
  values (
    'prediction',
    'CORE_LOOP_TEST percent seen movie',
    '["0-25%","26-50%","51-75%","76-100%"]'::jsonb,
    'Have you seen it?',
    null
  )
  returning id into v_prediction_id;

  insert into public.questions (format, prompt, options, self_report_prompt, correct_option)
  values (
    'two_truths_one_lie',
    'CORE_LOOP_TEST which is the lie',
    '["I own a cat","I am a robot","I drink water"]'::jsonb,
    null,
    'I am a robot'
  )
  returning id into v_ttol_id;

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
    interstitial_sec,
    current_plan_index
  )
  values (
    v_venue_id,
    v_qr,
    'active',
    'opener',
    v_opener_id,
    'testpin',
    now() - interval '1 minute',
    now() - interval '1 minute',
    now() + interval '2 hours',
    now() + interval '10 minutes',
    600,
    60,
    -1
  )
  returning id into v_session_id;

  insert into public.session_round_plan (session_id, position, question_id, duration_sec)
  values
    (v_session_id, 0, v_opinion_id, 90),
    (v_session_id, 1, v_prediction_id, 90),
    (v_session_id, 2, v_ttol_id, 90);

  v_join := public.join_session(v_qr, 'LoopHero');
  v_token := (v_join ->> 'participant_token')::uuid;
  v_participant_id := (v_join ->> 'participant_id')::uuid;

  insert into public.rounds (session_id, question_id, round_number, opens_at, closes_at, status)
  values (v_session_id, v_opinion_id, 1, now(), now() + interval '2 minutes', 'open')
  returning id into v_opinion_round_id;

  insert into public.rounds (session_id, question_id, round_number, opens_at, closes_at, status)
  values (v_session_id, v_prediction_id, 2, now(), now() + interval '2 minutes', 'open')
  returning id into v_prediction_round_id;

  insert into public.rounds (session_id, question_id, round_number, opens_at, closes_at, status)
  values (v_session_id, v_ttol_id, 3, now(), now() + interval '2 minutes', 'open')
  returning id into v_ttol_round_id;

  -- Only one open round should be visible; close extras for sequential tests later
  update public.rounds
  set status = 'scheduled'
  where id in (v_prediction_round_id, v_ttol_round_id);

  update public.sessions
  set phase = 'round_live', current_plan_index = 0
  where id = v_session_id;

  update fixture set
    venue_id = v_venue_id,
    session_id = v_session_id,
    qr_code = v_qr,
    opener_id = v_opener_id,
    opinion_id = v_opinion_id,
    prediction_id = v_prediction_id,
    ttol_id = v_ttol_id,
    token = v_token,
    participant_id = v_participant_id,
    opinion_round_id = v_opinion_round_id,
    prediction_round_id = v_prediction_round_id,
    ttol_round_id = v_ttol_round_id;
end $$;

select ok(
  (select token is not null from fixture),
  'join_session issued participant token'
);

select is(
  (select public.get_session_state(token) -> 'participant' ->> 'needs_opener' from fixture),
  'true',
  'needs_opener true before opener'
);

select ok(
  (select public.submit_opener(token, 'Coffee') ? 'opener_answer' from fixture),
  'submit_opener returns opener_answer'
);

select is(
  (select public.get_session_state(token) -> 'participant' ->> 'needs_opener' from fixture),
  'false',
  'needs_opener false after opener'
);

select ok(
  (select public.get_session_state(token) -> 'open_round' -> 'question' ? 'options' from fixture),
  'open_round.question.options present'
);

select ok(
  (select public.get_session_state(token) -> 'session' ? 'phase' from fixture),
  'session.phase present'
);

select lives_ok(
  format(
    'select public.submit_answer(%L::uuid, %L::uuid, %L, null)',
    (select token from fixture),
    (select opinion_round_id from fixture),
    'Agree'
  ),
  'submit_answer on opinion round'
);

select is(
  (
    select a.chosen_option
    from public.answers a
    join fixture f on f.opinion_round_id = a.round_id and f.participant_id = a.participant_id
  ),
  'Agree',
  'opinion chosen_option stored'
);

-- Close opinion; score should leave is_correct null
update public.rounds
set status = 'closed', closes_at = now()
where id = (select opinion_round_id from fixture);

select lives_ok(
  format(
    'select private.score_round_answers(%L::uuid)',
    (select opinion_round_id from fixture)
  ),
  'score_round_answers on opinion is a no-op'
);

select ok(
  (
    select a.is_correct is null
    from public.answers a
    join fixture f on f.opinion_round_id = a.round_id and f.participant_id = a.participant_id
  ),
  'opinion answer stays unscored'
);

-- Open prediction round
update public.rounds
set status = 'open'
where id = (select prediction_round_id from fixture);

select throws_ok(
  format(
    'select public.submit_answer(%L::uuid, %L::uuid, %L, null)',
    (select token from fixture),
    (select prediction_round_id from fixture),
    '76-100%'
  ),
  'P0001',
  'self_report_required',
  'prediction without self_report fails'
);

select lives_ok(
  format(
    'select public.submit_answer(%L::uuid, %L::uuid, %L, %L)',
    (select token from fixture),
    (select prediction_round_id from fixture),
    '76-100%',
    'Yes'
  ),
  'prediction with self_report succeeds'
);

select lives_ok(
  format(
    'select private.score_round_answers(%L::uuid)',
    (select prediction_round_id from fixture)
  ),
  'score prediction round'
);

select is(
  (
    select a.is_correct
    from public.answers a
    join fixture f on f.prediction_round_id = a.round_id and f.participant_id = a.participant_id
  ),
  true,
  'single Yes self-report scores 76-100% correct'
);

-- TTOL
update public.rounds set status = 'closed' where id = (select prediction_round_id from fixture);
update public.rounds set status = 'open' where id = (select ttol_round_id from fixture);

select lives_ok(
  format(
    'select public.submit_answer(%L::uuid, %L::uuid, %L, null)',
    (select token from fixture),
    (select ttol_round_id from fixture),
    'I am a robot'
  ),
  'ttol submit'
);

select lives_ok(
  format(
    'select private.score_round_answers(%L::uuid)',
    (select ttol_round_id from fixture)
  ),
  'score ttol round'
);

select is(
  (
    select a.is_correct
    from public.answers a
    join fixture f on f.ttol_round_id = a.round_id and f.participant_id = a.participant_id
  ),
  true,
  'ttol correct_option marks is_correct'
);

select * from finish();

rollback;
