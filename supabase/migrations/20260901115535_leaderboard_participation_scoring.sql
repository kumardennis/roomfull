-- Leaderboard: participation points for opinion rounds + bonus for prediction accuracy.
-- Opinion prompts (hot_take, this_or_that) never set is_correct — score = rounds answered.

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
  select
    coalesce((
      select count(*)::int
      from public.answers a
      join public.rounds r on r.id = a.round_id
      where a.participant_id = p_participant_id
        and r.session_id = p_session_id
    ), 0)
    + coalesce((
      select count(*)::int
      from public.answers a
      join public.rounds r on r.id = a.round_id
      where a.participant_id = p_participant_id
        and r.session_id = p_session_id
        and a.is_correct is true
    ), 0);
$$;

revoke all on function private.participant_score(uuid, uuid) from public;

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
          'score', private.participant_score(p.id, p.session_id),
          'is_me', p.id = v_participant.id
        ) as row_data,
        private.participant_score(p.id, p.session_id) as score,
        p.handle
        from public.participants p
        where p.session_id = v_participant.session_id
      ) ranked
    ),
    '[]'::jsonb
  );
end;
$$;

-- Dev: skip interstitial / opener wait by shortening phase_deadline
create or replace function public.dev_skip_phase_wait(
  p_host_pin text,
  p_session_id uuid,
  p_seconds integer default 5
)
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
    raise exception 'invalid_host_credentials';
  end if;

  if v_session.phase not in ('opener', 'round_interstitial', 'scheduled') then
    raise exception 'phase_not_skippable'
      using hint = format('Cannot skip wait from phase %s', v_session.phase);
  end if;

  update public.sessions
  set phase_deadline = now() + make_interval(secs => greatest(p_seconds, 1))
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'phase', v_session.phase,
    'phase_deadline', v_session.phase_deadline
  );
end;
$$;

grant execute on function public.dev_skip_phase_wait(text, uuid, integer) to anon, authenticated;

-- Shorter breaks on dev reset (test nights)
create or replace function public.dev_reset_session(
  p_host_pin text,
  p_session_id uuid,
  p_clear_participant_answers boolean default true,
  p_clear_social boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_deleted_rounds integer;
  v_opener_sec integer := 180;
  v_break_sec integer := 120;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
    and host_pin = p_host_pin;

  if not found then
    raise exception 'invalid_host_credentials';
  end if;

  if p_clear_social then
    delete from public.messages
    where match_id in (
      select m.id from public.matches m where m.session_id = v_session.id
    );

    delete from public.matches where session_id = v_session.id;
    delete from public.vibes where session_id = v_session.id;
  end if;

  delete from public.answers
  where round_id in (
    select r.id from public.rounds r where r.session_id = v_session.id
  );

  delete from public.rounds
  where session_id = v_session.id;

  get diagnostics v_deleted_rounds = row_count;

  if p_clear_participant_answers then
    update public.participants
    set opener_answer = null
    where session_id = v_session.id;
  end if;

  update public.sessions
  set
    status = 'active',
    phase = 'opener',
    phase_deadline = now() + make_interval(secs => v_opener_sec),
    scheduled_starts_at = coalesce(scheduled_starts_at, now() - interval '5 minutes'),
    started_at = coalesce(started_at, now() - interval '5 minutes'),
    ends_at = greatest(coalesce(ends_at, now() + interval '6 hours'), now() + interval '1 hour'),
    current_plan_index = -1,
    paused_at = null,
    opener_window_sec = v_opener_sec,
    interstitial_sec = v_break_sec
  where id = v_session.id
  returning * into v_session;

  perform private.emit_domain_event(
    v_session.id,
    'session.dev_reset',
    null,
    jsonb_build_object(
      'clear_participant_answers', p_clear_participant_answers,
      'clear_social', p_clear_social,
      'deleted_rounds', v_deleted_rounds
    )
  );

  return jsonb_build_object(
    'session_id', v_session.id,
    'qr_code', v_session.qr_code,
    'status', v_session.status,
    'phase', v_session.phase,
    'phase_deadline', v_session.phase_deadline,
    'ends_at', v_session.ends_at,
    'interstitial_sec', v_session.interstitial_sec,
    'deleted_rounds', v_deleted_rounds
  );
end;
$$;
