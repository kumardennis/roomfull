-- Live aggregate Yes/No tally for prediction rounds (after caller has submitted).

create or replace function private.self_report_is_yes(p_value text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_value, ''))) in ('yes', 'y', 'true', '1');
$$;

create or replace function private.prediction_bucket_from_percent(p_pct numeric)
returns text
language sql
immutable
as $$
  select case
    when p_pct <= 25 then '0-25%'
    when p_pct <= 50 then '26-50%'
    when p_pct <= 75 then '51-75%'
    else '76-100%'
  end;
$$;

create or replace function public.get_prediction_live_tally(
  p_participant_token uuid,
  p_round_id uuid
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
  v_yes_count integer;
  v_answered_count integer;
  v_total_participants integer;
  v_yes_percent integer;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select r.* into v_round
  from public.rounds r
  where r.id = p_round_id
    and r.session_id = v_participant.session_id;

  if not found then
    raise exception 'round_not_found';
  end if;

  select * into v_question
  from public.questions
  where id = v_round.question_id;

  if v_question.format <> 'prediction' then
    raise exception 'not_prediction_round';
  end if;

  if not exists (
    select 1
    from public.answers a
    where a.round_id = p_round_id
      and a.participant_id = v_participant.id
  ) then
    return jsonb_build_object(
      'round_id', p_round_id,
      'locked', true
    );
  end if;

  select
    count(*) filter (where private.self_report_is_yes(a.self_report_value)),
    count(*) filter (where nullif(trim(coalesce(a.self_report_value, '')), '') is not null)
  into v_yes_count, v_answered_count
  from public.answers a
  where a.round_id = p_round_id;

  select count(*)::int into v_total_participants
  from public.participants p
  where p.session_id = v_participant.session_id;

  if v_answered_count > 0 then
    v_yes_percent := round((v_yes_count::numeric / v_answered_count) * 100)::int;
  else
    v_yes_percent := 0;
  end if;

  return jsonb_build_object(
    'round_id', p_round_id,
    'locked', false,
    'yes_count', v_yes_count,
    'no_count', greatest(v_answered_count - v_yes_count, 0),
    'answered_count', v_answered_count,
    'total_participants', v_total_participants,
    'yes_percent', v_yes_percent,
    'leading_bucket', case
      when v_answered_count = 0 then null
      else private.prediction_bucket_from_percent(v_yes_percent)
    end
  );
end;
$$;

grant execute on function public.get_prediction_live_tally(uuid, uuid) to anon, authenticated;
