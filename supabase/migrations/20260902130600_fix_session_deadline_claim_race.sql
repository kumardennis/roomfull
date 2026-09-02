-- Fix deadline claim race: mark fired on claim, tighten sync supersede, replica identity for realtime OLD.

alter table public.session_deadlines replica identity full;

drop index if exists public.session_deadlines_one_scheduled_per_kind;

create unique index session_deadlines_one_scheduled_per_kind
  on public.session_deadlines (session_id, kind)
  where status = 'scheduled' and fired_at is null;

create or replace function private.sync_session_deadlines(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_open_round public.rounds;
  v_deadline_id uuid;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id;

  if not found then
    return null;
  end if;

  if v_session.phase = 'ended'
    or v_session.status = 'ended'
    or v_session.paused_at is not null then
    perform private.cancel_pending_session_deadlines(p_session_id, 'inactive');
    return null;
  end if;

  update public.session_deadlines
  set status = 'superseded',
      cancel_reason = 'resync'
  where session_id = p_session_id
    and status = 'scheduled';

  if v_session.status = 'scheduled'
    and v_session.phase = 'scheduled'
    and v_session.scheduled_starts_at is not null then
    insert into public.session_deadlines (
      session_id,
      kind,
      expected_event,
      fire_at
    )
    values (
      p_session_id,
      'event_start',
      'EVENT_START',
      v_session.scheduled_starts_at
    )
    returning id into v_deadline_id;

    return v_deadline_id;
  end if;

  if v_session.status <> 'active' then
    return null;
  end if;

  if v_session.phase = 'opener'
    and v_session.phase_deadline is not null then
    insert into public.session_deadlines (
      session_id,
      kind,
      expected_event,
      fire_at
    )
    values (
      p_session_id,
      'opener_end',
      'OPENER_END',
      v_session.phase_deadline
    )
    returning id into v_deadline_id;

    return v_deadline_id;
  end if;

  if v_session.phase = 'round_live' then
    select * into v_open_round
    from public.rounds
    where session_id = p_session_id
      and status = 'open'
    order by round_number desc
    limit 1;

    if v_open_round.id is not null
      and v_open_round.closes_at is not null then
      insert into public.session_deadlines (
        session_id,
        kind,
        expected_event,
        fire_at,
        round_id
      )
      values (
        p_session_id,
        'round_close',
        'ROUND_CLOSE',
        v_open_round.closes_at,
        v_open_round.id
      )
      returning id into v_deadline_id;

      return v_deadline_id;
    end if;
  end if;

  if v_session.phase = 'round_interstitial'
    and v_session.phase_deadline is not null then
    insert into public.session_deadlines (
      session_id,
      kind,
      expected_event,
      fire_at
    )
    values (
      p_session_id,
      'interstitial_end',
      'INTERSTITIAL_END',
      v_session.phase_deadline
    )
    returning id into v_deadline_id;

    return v_deadline_id;
  end if;

  if v_session.phase = 'social'
    and v_session.ends_at is not null then
    insert into public.session_deadlines (
      session_id,
      kind,
      expected_event,
      fire_at
    )
    values (
      p_session_id,
      'session_end',
      'SESSION_END',
      v_session.ends_at
    )
    returning id into v_deadline_id;

    return v_deadline_id;
  end if;

  return null;
end;
$$;

create or replace function public.fire_session_deadline(
  p_deadline_id uuid,
  p_worker_id text default 'scheduler'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_deadline public.session_deadlines;
  v_session public.sessions;
  v_open_closes_at timestamptz;
  v_result jsonb;
begin
  update public.session_deadlines
  set fired_at = now(),
      nudged_by = p_worker_id,
      status = 'fired'
  where id = p_deadline_id
    and status = 'scheduled'
    and fire_at <= now() + interval '5 seconds'
  returning * into v_deadline;

  if not found then
    return jsonb_build_object(
      'deadline_id', p_deadline_id,
      'noop', true,
      'reason', 'not_claimable'
    );
  end if;

  select * into v_session
  from public.sessions
  where id = v_deadline.session_id
  for update;

  if v_session.paused_at is not null then
    update public.session_deadlines
    set status = 'cancelled',
        cancel_reason = 'paused',
        nudge_result = jsonb_build_object('noop', true, 'reason', 'paused')
    where id = v_deadline.id;

    return jsonb_build_object(
      'deadline_id', v_deadline.id,
      'noop', true,
      'reason', 'paused'
    );
  end if;

  if v_session.phase = 'ended' or v_session.status = 'ended' then
    update public.session_deadlines
    set status = 'cancelled',
        cancel_reason = 'session_ended',
        nudge_result = jsonb_build_object('noop', true, 'reason', 'session_ended')
    where id = v_deadline.id;

    return jsonb_build_object(
      'deadline_id', v_deadline.id,
      'noop', true,
      'reason', 'session_ended'
    );
  end if;

  case v_deadline.kind
    when 'event_start' then
      if v_session.status <> 'scheduled'
        or v_session.phase <> 'scheduled'
        or v_session.scheduled_starts_at is null
        or now() < v_session.scheduled_starts_at then
        update public.session_deadlines
        set status = 'cancelled',
            cancel_reason = 'stale',
            nudge_result = jsonb_build_object('noop', true, 'reason', 'stale')
        where id = v_deadline.id;

        return jsonb_build_object('deadline_id', v_deadline.id, 'noop', true, 'reason', 'stale');
      end if;

      v_result := private.transition_session(v_session.id, 'EVENT_START', p_worker_id);

    when 'opener_end' then
      if v_session.phase <> 'opener'
        or v_session.phase_deadline is null
        or now() < v_session.phase_deadline then
        update public.session_deadlines
        set status = 'cancelled',
            cancel_reason = 'stale',
            nudge_result = jsonb_build_object('noop', true, 'reason', 'stale')
        where id = v_deadline.id;

        return jsonb_build_object('deadline_id', v_deadline.id, 'noop', true, 'reason', 'stale');
      end if;

      v_result := private.transition_session(v_session.id, 'OPENER_END', p_worker_id);

    when 'round_close' then
      select closes_at into v_open_closes_at
      from public.rounds
      where session_id = v_session.id
        and status = 'open'
      order by round_number desc
      limit 1;

      if v_session.phase <> 'round_live'
        or v_open_closes_at is null
        or now() < v_open_closes_at then
        update public.session_deadlines
        set status = 'cancelled',
            cancel_reason = 'stale',
            nudge_result = jsonb_build_object('noop', true, 'reason', 'stale')
        where id = v_deadline.id;

        return jsonb_build_object('deadline_id', v_deadline.id, 'noop', true, 'reason', 'stale');
      end if;

      v_result := private.transition_session(v_session.id, 'ROUND_CLOSE', p_worker_id);

    when 'interstitial_end' then
      if v_session.phase <> 'round_interstitial'
        or v_session.phase_deadline is null
        or now() < v_session.phase_deadline then
        update public.session_deadlines
        set status = 'cancelled',
            cancel_reason = 'stale',
            nudge_result = jsonb_build_object('noop', true, 'reason', 'stale')
        where id = v_deadline.id;

        return jsonb_build_object('deadline_id', v_deadline.id, 'noop', true, 'reason', 'stale');
      end if;

      v_result := private.transition_session(v_session.id, 'INTERSTITIAL_END', p_worker_id);

    when 'session_end' then
      if v_session.phase <> 'social'
        or v_session.ends_at is null
        or now() < v_session.ends_at then
        update public.session_deadlines
        set status = 'cancelled',
            cancel_reason = 'stale',
            nudge_result = jsonb_build_object('noop', true, 'reason', 'stale')
        where id = v_deadline.id;

        return jsonb_build_object('deadline_id', v_deadline.id, 'noop', true, 'reason', 'stale');
      end if;

      v_result := private.transition_session(v_session.id, 'SESSION_END', p_worker_id);

    else
      raise exception 'unknown_deadline_kind'
        using hint = v_deadline.kind::text;
  end case;

  update public.session_deadlines
  set nudge_result = v_result
  where id = v_deadline.id;

  return jsonb_build_object(
    'deadline_id', v_deadline.id,
    'session_id', v_deadline.session_id,
    'kind', v_deadline.kind,
    'result', v_result
  );
end;
$$;

-- Clean up any in-flight rows left from the previous claim logic.
update public.session_deadlines
set status = 'superseded',
    cancel_reason = 'claim_race_cleanup'
where status = 'scheduled'
  and fired_at is not null;
