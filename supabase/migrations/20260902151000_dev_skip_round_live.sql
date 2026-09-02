-- Dev: shorten opener/interstitial phase_deadline or live round closes_at.

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
  v_round public.rounds;
  v_fire_at timestamptz;
begin
  select * into v_session
  from public.sessions
  where id = p_session_id
    and host_pin = p_host_pin;

  if not found then
    raise exception 'invalid_host_credentials';
  end if;

  v_fire_at := now() + make_interval(secs => greatest(p_seconds, 1));

  if v_session.phase = 'round_live' then
    update public.rounds
    set closes_at = v_fire_at
    where session_id = p_session_id
      and status = 'open'
    returning * into v_round;

    if not found then
      raise exception 'no_open_round'
        using hint = 'No open round to shorten.';
    end if;

    update public.sessions
    set phase_deadline = v_fire_at
    where id = p_session_id
    returning * into v_session;

    return jsonb_build_object(
      'session_id', v_session.id,
      'phase', v_session.phase,
      'phase_deadline', v_session.phase_deadline,
      'round_id', v_round.id,
      'closes_at', v_round.closes_at
    );
  end if;

  if v_session.phase not in ('opener', 'round_interstitial', 'scheduled') then
    raise exception 'phase_not_skippable'
      using hint = format('Cannot skip wait from phase %s', v_session.phase);
  end if;

  update public.sessions
  set phase_deadline = v_fire_at
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'phase', v_session.phase,
    'phase_deadline', v_session.phase_deadline
  );
end;
$$;
