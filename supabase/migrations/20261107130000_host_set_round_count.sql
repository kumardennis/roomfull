-- Host picks how many questions the session plays. Positions already opened
-- (<= current_plan_index) are kept; the rest of the plan is refilled with
-- random bank questions, interleaved across formats.

create or replace function public.host_set_round_count(
  p_host_pin text,
  p_session_id uuid,
  p_round_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_kept integer;
  v_total integer;
begin
  perform private.assert_host_pin(p_host_pin, p_session_id);

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if v_session.status = 'ended' or v_session.phase in ('social', 'ended') then
    raise exception 'round_plan_locked'
      using hint = 'All rounds are done for this session.';
  end if;

  if p_round_count is null or p_round_count < 1 or p_round_count > 100 then
    raise exception 'invalid_round_count'
      using hint = 'Pick between 1 and 100 questions.';
  end if;

  v_kept := greatest(v_session.current_plan_index + 1, 0);

  if p_round_count < v_kept then
    raise exception 'round_count_below_played'
      using hint = format('%s questions have already been played.', v_kept);
  end if;

  delete from public.session_round_plan
  where session_id = p_session_id
    and position >= v_kept;

  insert into public.session_round_plan (session_id, position, question_id)
  select
    p_session_id,
    v_kept + (row_number() over (order by picked.format_rank, picked.tiebreak))::int - 1,
    picked.id
  from (
    select
      q.id,
      row_number() over (partition by q.format order by random()) as format_rank,
      random() as tiebreak
    from public.questions q
    where q.id is distinct from v_session.opener_question_id
      and not exists (
        select 1
        from public.session_round_plan p
        where p.session_id = p_session_id
          and p.question_id = q.id
      )
  ) picked
  order by picked.format_rank, picked.tiebreak
  limit p_round_count - v_kept;

  select count(*)::int into v_total
  from public.session_round_plan
  where session_id = p_session_id;

  perform private.emit_domain_event(
    p_session_id,
    'session.plan_updated',
    null,
    jsonb_build_object(
      'actor', 'host',
      'requested', p_round_count,
      'total', v_total,
      'kept', v_kept
    )
  );

  return jsonb_build_object(
    'session_id', p_session_id,
    'requested', p_round_count,
    'total', v_total,
    'kept', v_kept
  );
end;
$$;

revoke all on function public.host_set_round_count(text, uuid, integer) from public;
grant execute on function public.host_set_round_count(text, uuid, integer) to anon, authenticated;
