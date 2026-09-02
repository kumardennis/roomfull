-- Dev tooling + participant-scoped Realtime for session/round/answer updates

-- ---------------------------------------------------------------------------
-- Realtime publication + SELECT grants
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.sessions;

grant select on public.sessions to authenticated;
grant select on public.rounds to authenticated;
grant select on public.answers to authenticated;

create policy "participants_select_own_session"
  on public.sessions
  for select
  to authenticated
  using (id = private.current_session_id());

create policy "participants_select_session_rounds"
  on public.rounds
  for select
  to authenticated
  using (session_id = private.current_session_id());

create policy "participants_select_session_answers"
  on public.answers
  for select
  to authenticated
  using (
    round_id in (
      select r.id
      from public.rounds r
      where r.session_id = private.current_session_id()
    )
  );

-- ---------------------------------------------------------------------------
-- dev_reset_session — rewind a test night to opener (host PIN required)
-- ---------------------------------------------------------------------------

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
    phase_deadline = now() + make_interval(secs => opener_window_sec),
    scheduled_starts_at = coalesce(scheduled_starts_at, now() - interval '5 minutes'),
    started_at = coalesce(started_at, now() - interval '5 minutes'),
    ends_at = greatest(coalesce(ends_at, now() + interval '6 hours'), now() + interval '1 hour'),
    current_plan_index = -1,
    paused_at = null
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
    'deleted_rounds', v_deleted_rounds
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- dev_session_tick — run one FSM tick for a single session (host PIN required)
-- ---------------------------------------------------------------------------

create or replace function public.dev_session_tick(
  p_host_pin text,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_open_closes_at timestamptz;
  v_result jsonb;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
    and host_pin = p_host_pin
  for update;

  if not found then
    raise exception 'invalid_host_credentials';
  end if;

  if v_session.phase = 'ended' then
    return jsonb_build_object('session_id', v_session.id, 'phase', 'ended', 'noop', true);
  end if;

  if v_session.paused_at is not null then
    return jsonb_build_object(
      'session_id', v_session.id,
      'phase', v_session.phase,
      'noop', true,
      'reason', 'paused'
    );
  end if;

  if v_session.status = 'scheduled'
    and v_session.phase = 'scheduled'
    and v_session.scheduled_starts_at is not null
    and now() >= v_session.scheduled_starts_at then
    return private.transition_session(v_session.id, 'EVENT_START', 'dev');
  end if;

  if v_session.status <> 'active' then
    return jsonb_build_object('session_id', v_session.id, 'phase', v_session.phase, 'noop', true);
  end if;

  if v_session.phase = 'opener'
    and v_session.phase_deadline is not null
    and now() >= v_session.phase_deadline then
    return private.transition_session(v_session.id, 'OPENER_END', 'dev');
  end if;

  if v_session.phase = 'round_live' then
    select closes_at into v_open_closes_at
    from public.rounds
    where session_id = v_session.id
      and status = 'open'
    order by round_number desc
    limit 1;

    if v_open_closes_at is not null and now() >= v_open_closes_at then
      return private.transition_session(v_session.id, 'ROUND_CLOSE', 'dev');
    end if;
  end if;

  if v_session.phase = 'round_interstitial'
    and v_session.phase_deadline is not null
    and now() >= v_session.phase_deadline then
    return private.transition_session(v_session.id, 'INTERSTITIAL_END', 'dev');
  end if;

  if v_session.phase = 'social'
    and v_session.ends_at is not null
    and now() >= v_session.ends_at then
    return private.transition_session(v_session.id, 'SESSION_END', 'dev');
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'phase', v_session.phase,
    'noop', true,
    'reason', 'deadline_not_reached'
  );
end;
$$;

grant execute on function public.dev_reset_session(text, uuid, boolean, boolean) to anon, authenticated;
grant execute on function public.dev_session_tick(text, uuid) to anon, authenticated;
