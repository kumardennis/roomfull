-- Event-driven session scheduler: one deadline row per FSM transition, worker arms per-row timers.

create type public.session_deadline_kind as enum (
  'event_start',
  'opener_end',
  'round_close',
  'interstitial_end',
  'session_end'
);

create type public.session_deadline_status as enum (
  'scheduled',
  'fired',
  'cancelled',
  'superseded'
);

create table public.session_deadlines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  kind public.session_deadline_kind not null,
  expected_event text not null,
  fire_at timestamptz not null,
  round_id uuid references public.rounds (id) on delete set null,
  status public.session_deadline_status not null default 'scheduled',
  cancel_reason text,
  scheduled_at timestamptz not null default now(),
  fired_at timestamptz,
  nudged_by text,
  nudge_result jsonb
);

create index idx_session_deadlines_session_status
  on public.session_deadlines (session_id, status);

create index idx_session_deadlines_scheduled_fire
  on public.session_deadlines (fire_at)
  where status = 'scheduled';

create unique index session_deadlines_one_scheduled_per_kind
  on public.session_deadlines (session_id, kind)
  where status = 'scheduled';

alter table public.session_deadlines enable row level security;

create policy "service_role_all_session_deadlines"
  on public.session_deadlines
  for all
  to service_role
  using (true)
  with check (true);

alter publication supabase_realtime add table public.session_deadlines;

-- ---------------------------------------------------------------------------
-- Cancel / sync helpers
-- ---------------------------------------------------------------------------

create or replace function private.cancel_pending_session_deadlines(
  p_session_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cancelled integer;
begin
  update public.session_deadlines
  set status = 'cancelled',
      cancel_reason = p_reason
  where session_id = p_session_id
    and status = 'scheduled';

  get diagnostics v_cancelled = row_count;
  return v_cancelled;
end;
$$;

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
    and status = 'scheduled'
    and fired_at is null;

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

-- ---------------------------------------------------------------------------
-- Worker nudge: claim one deadline row, run the mapped FSM event
-- ---------------------------------------------------------------------------

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
      nudged_by = p_worker_id
  where id = p_deadline_id
    and status = 'scheduled'
    and fire_at <= now() + interval '2 seconds'
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
  set status = 'fired',
      nudge_result = v_result
  where id = v_deadline.id;

  return jsonb_build_object(
    'deadline_id', v_deadline.id,
    'session_id', v_deadline.session_id,
    'kind', v_deadline.kind,
    'result', v_result
  );
end;
$$;

revoke all on function public.fire_session_deadline(uuid, text) from public;
grant execute on function public.fire_session_deadline(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers: keep deadline rows in sync with session / round state
-- ---------------------------------------------------------------------------

create or replace function private.trg_sessions_sync_deadlines()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    perform private.sync_session_deadlines(new.id);
    return new;
  end if;

  if new.paused_at is not null
    and (old.paused_at is null or old.paused_at is distinct from new.paused_at) then
    perform private.cancel_pending_session_deadlines(new.id, 'paused');
    return new;
  end if;

  if new.phase = 'ended'
    or new.status = 'ended' then
    perform private.cancel_pending_session_deadlines(new.id, 'session_ended');
    return new;
  end if;

  if new.phase is distinct from old.phase
    or new.phase_deadline is distinct from old.phase_deadline
    or new.status is distinct from old.status
    or new.ends_at is distinct from old.ends_at
    or new.scheduled_starts_at is distinct from old.scheduled_starts_at
    or (old.paused_at is not null and new.paused_at is null) then
    perform private.sync_session_deadlines(new.id);
  end if;

  return new;
end;
$$;

create trigger sessions_sync_deadlines
  after insert or update on public.sessions
  for each row
  execute function private.trg_sessions_sync_deadlines();

create or replace function private.trg_rounds_sync_deadlines()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'open' then
    perform private.sync_session_deadlines(new.session_id);
  end if;

  return new;
end;
$$;

create trigger rounds_sync_deadlines
  after insert or update of closes_at, status on public.rounds
  for each row
  execute function private.trg_rounds_sync_deadlines();

-- Backfill deadlines for live sessions
do $$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select id
    from public.sessions
    where status in ('scheduled', 'active')
      and phase <> 'ended'
  loop
    perform private.sync_session_deadlines(v_session_id);
  end loop;
end;
$$;
