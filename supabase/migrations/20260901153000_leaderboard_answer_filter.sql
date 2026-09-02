-- Roster filter: expose each participant's answer on the latest filterable round.

create or replace function public.get_leaderboard(p_participant_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_filter_round public.rounds;
  v_filter_question public.questions;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select r.* into v_filter_round
  from public.rounds r
  where r.session_id = v_participant.session_id
    and r.status in ('open', 'closed')
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.round_number desc
  limit 1;

  if v_filter_round.id is not null then
    select * into v_filter_question
    from public.questions
    where id = v_filter_round.question_id;
  end if;

  return jsonb_build_object(
    'filter', case
      when v_filter_round.id is null then null
      else jsonb_build_object(
        'round_id', v_filter_round.id,
        'round_number', v_filter_round.round_number,
        'prompt', v_filter_question.prompt,
        'options', v_filter_question.options
      )
    end,
    'entries', coalesce(
      (
        select jsonb_agg(row_data order by score desc, handle asc)
        from (
          select jsonb_build_object(
            'participant_id', p.id,
            'handle', p.handle,
            'avatar_seed', p.avatar_seed,
            'score', private.participant_score(p.id, p.session_id),
            'is_me', p.id = v_participant.id,
            'last_answer', case
              when v_filter_round.id is null then null
              else (
                select a.chosen_option
                from public.answers a
                where a.round_id = v_filter_round.id
                  and a.participant_id = p.id
              )
            end
          ) as row_data,
          private.participant_score(p.id, p.session_id) as score,
          p.handle
          from public.participants p
          where p.session_id = v_participant.session_id
        ) ranked
      ),
      '[]'::jsonb
    )
  );
end;
$$;
