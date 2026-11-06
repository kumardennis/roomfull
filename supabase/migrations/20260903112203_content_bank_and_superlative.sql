-- Phase A: content bank + finish TTOL/superlative room formats.
-- - Large opinion/personality question bank (idempotent on prompt)
-- - get_session_state injects live handles for superlative options
-- - submit_answer validates superlative picks
-- - Refresh dev-night-001 plan to 8 mixed rounds

-- ---------------------------------------------------------------------------
-- Helper: other participants' handles for superlative rounds
-- ---------------------------------------------------------------------------

create or replace function private.superlative_options_for(
  p_session_id uuid,
  p_exclude_participant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (
      select jsonb_agg(sub.handle order by lower(sub.handle))
      from (
        select p.handle
        from public.participants p
        where p.session_id = p_session_id
          and p.id is distinct from p_exclude_participant_id
        order by lower(p.handle)
      ) sub
    ),
    '[]'::jsonb
  );
$$;

revoke all on function private.superlative_options_for(uuid, uuid) from public;
revoke all on function private.superlative_options_for(uuid, uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Content bank
-- ---------------------------------------------------------------------------

insert into public.questions (format, prompt, options, self_report_prompt, correct_option, is_local)
select * from (values
  -- Openers / this_or_that
  ('this_or_that'::public.question_format, 'Early bird or night owl?', '["Early bird","Night owl"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Text first or wait for them?', '["Text first","Wait"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Big group night or small table?', '["Big group","Small table"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Spontaneous plans or planned date?', '["Spontaneous","Planned"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Sweet or salty?', '["Sweet","Salty"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Stay out late or leave while it''s good?', '["Stay out late","Leave while it''s good"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Share fries or get your own?', '["Share","Own"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Playlist DJ or go with the room?', '["Take the aux","Go with the room"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Deep talk or light banter first?', '["Deep talk","Light banter"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Window seat or bar stool?', '["Window","Bar"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Call or voice note?', '["Call","Voice note"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Dress up or dress comfy?', '["Dress up","Dress comfy"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'One more round or head home?', '["One more","Head home"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Morning coffee date or evening drinks?', '["Morning coffee","Evening drinks"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Indoor hang or walk outside?', '["Indoor","Outside"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Joke around or keep it chill?', '["Joke around","Keep it chill"]'::jsonb, null::text, null::text, false),
  ('this_or_that'::public.question_format, 'Tallinn old town stroll or new neighborhood bar?', '["Old town","New neighborhood"]'::jsonb, null::text, null::text, true),
  ('this_or_that'::public.question_format, 'Sauna night or cinema night?', '["Sauna","Cinema"]'::jsonb, null::text, null::text, true),
  ('this_or_that'::public.question_format, 'Hot wine or cold beer?', '["Hot wine","Cold beer"]'::jsonb, null::text, null::text, true),
  ('this_or_that'::public.question_format, 'Karaoke dare or dance floor?', '["Karaoke","Dance floor"]'::jsonb, null::text, null::text, false),

  -- Hot takes
  ('hot_take'::public.question_format, 'Double texting is fine.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Leaving people on read is sometimes healthy.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Matching outfits on a first hang is cute.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Sharing location with friends is normal.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Ghosting is never okay.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Arriving 15 minutes late is still on time.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Phone face-down on the table is basic respect.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'It''s okay to cancel if the vibe is off.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Public displays of affection should stay subtle.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Splitting the bill on night one is the move.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Talking about exes early is a red flag.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'A good playlist says more than a bio.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Winter in Tallinn is underrated for dates.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, true),
  ('hot_take'::public.question_format, 'You should always introduce your friends to someone you like.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),
  ('hot_take'::public.question_format, 'Silence in conversation can be comfortable.', '["Strongly agree","Agree","Disagree","Strongly disagree"]'::jsonb, null::text, null::text, false),

  -- Predictions
  ('prediction'::public.question_format, 'What percentage of people here have checked their phone in the last 5 minutes?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Have you checked your phone in the last 5 minutes?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here are night owls?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Are you a night owl?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here would dance if the right song came on?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Would you dance if the right song came on?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here have lived in more than one country?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Have you lived in more than one country?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here prefer sweet over salty?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Do you prefer sweet over salty?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here sent a risky text this month?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Did you send a risky text this month?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here would rather stay out past midnight?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Would you rather stay out past midnight?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here speak 3+ languages?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Do you speak 3 or more languages?', null::text, true),
  ('prediction'::public.question_format, 'What percentage of people here have been to a sauna this month?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Have you been to a sauna this month?', null::text, true),
  ('prediction'::public.question_format, 'What percentage of people here would try a blind taste test?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Would you try a blind taste test?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here are here with friends (not alone)?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Are you here with friends?', null::text, false),
  ('prediction'::public.question_format, 'What percentage of people here would sing karaoke sober?', '["0-25%","26-50%","51-75%","76-100%"]'::jsonb, 'Would you sing karaoke sober?', null::text, false),

  -- Two truths, one lie (correct_option = the lie)
  ('two_truths_one_lie'::public.question_format, 'Which statement is the lie about a first hang?', '["Showing up on time is attractive","Phones at dinner always help connection","Asking questions beats performing"]'::jsonb, null::text, 'Phones at dinner always help connection', false),
  ('two_truths_one_lie'::public.question_format, 'Which one is the lie about nights out?', '["A short goodbye can be charming","Loud oversharing always builds trust","Laughing at yourself is magnetic"]'::jsonb, null::text, 'Loud oversharing always builds trust', false),
  ('two_truths_one_lie'::public.question_format, 'Which claim is the lie?', '["Curiosity beats a perfect bio","Everyone loves being grilled with 20 questions","Shared snacks unlock conversation"]'::jsonb, null::text, 'Everyone loves being grilled with 20 questions', false),
  ('two_truths_one_lie'::public.question_format, 'Spot the lie about flirting.', '["Eye contact works","Teasing without kindness always lands","Listening is underrated"]'::jsonb, null::text, 'Teasing without kindness always lands', false),
  ('two_truths_one_lie'::public.question_format, 'Which is the lie for group games?', '["Playing along is half the fun","Winning is the only reason to show up","Cheering others makes you memorable"]'::jsonb, null::text, 'Winning is the only reason to show up', false),
  ('two_truths_one_lie'::public.question_format, 'Which Tallinn take is the lie?', '["Old Town is photogenic","It never rains in spring","Harbor views slap at sunset"]'::jsonb, null::text, 'It never rains in spring', true),
  ('two_truths_one_lie'::public.question_format, 'Which dating myth is the lie?', '["Chemistry can be quiet","Texting speed defines your worth","Shared humor matters"]'::jsonb, null::text, 'Texting speed defines your worth', false),
  ('two_truths_one_lie'::public.question_format, 'Which bar rule is the lie?', '["Clear the stool when you leave","Never tip, ever","Say thanks to the staff"]'::jsonb, null::text, 'Never tip, ever', false),

  -- Superlative prompts (options filled at runtime)
  ('superlative'::public.question_format, 'Who here is most likely to start a dance circle?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to know everyone''s drink order by midnight?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to suggest one more stop?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to tell the best story?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to be early?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to take the funniest group photo?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to remember a tiny detail you said?', '[]'::jsonb, null::text, null::text, false),
  ('superlative'::public.question_format, 'Who here is most likely to turn a awkward silence into a joke?', '[]'::jsonb, null::text, null::text, false)
) as seed(format, prompt, options, self_report_prompt, correct_option, is_local)
where not exists (
  select 1 from public.questions q where q.prompt = seed.prompt
);

-- Soft-fix empty superlative seed from earlier migrations
update public.questions
set options = '[]'::jsonb
where format = 'superlative'
  and prompt = 'Who in this room is most likely to start a dance circle?'
  and options = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- get_session_state: inject superlative options per caller
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
            'options', case
              when q.format = 'superlative' then
                private.superlative_options_for(v_session.id, v_participant.id)
              else q.options
            end,
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

-- ---------------------------------------------------------------------------
-- submit_answer: validate superlative handle choice
-- ---------------------------------------------------------------------------

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
  v_choice text;
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

  v_choice := trim(p_chosen_option);

  if v_question.format = 'superlative' then
    if not exists (
      select 1
      from public.participants p
      where p.session_id = v_participant.session_id
        and p.id is distinct from v_participant.id
        and p.handle = v_choice
    ) then
      raise exception 'invalid_superlative_choice'
        using hint = 'Pick someone else in the room.';
    end if;
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
    v_choice,
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

-- ---------------------------------------------------------------------------
-- Refresh dev-night plan (8 mixed rounds) when session exists
-- ---------------------------------------------------------------------------

do $$
declare
  v_session_id uuid;
begin
  select id into v_session_id
  from public.sessions
  where qr_code = 'dev-night-001';

  if v_session_id is null then
    return;
  end if;

  delete from public.session_round_plan where session_id = v_session_id;

  insert into public.session_round_plan (session_id, position, question_id, duration_sec)
  select v_session_id, plan.ord - 1, q.id, 90
  from (
    values
      (1, 'Early bird or night owl?'),
      (2, 'Double texting is fine.'),
      (3, 'What percentage of people here would dance if the right song came on?'),
      (4, 'Which statement is the lie about a first hang?'),
      (5, 'Who here is most likely to start a dance circle?'),
      (6, 'Text first or wait for them?'),
      (7, 'Phone face-down on the table is basic respect.'),
      (8, 'Which one is the lie about nights out?')
  ) as plan(ord, prompt)
  join public.questions q on q.prompt = plan.prompt
  order by plan.ord;
end $$;
