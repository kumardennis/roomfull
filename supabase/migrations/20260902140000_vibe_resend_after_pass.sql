-- Allow re-sending a vibe after a silent pass, but only from the next round break onward.

alter table public.vibes
  add column if not exists passed_after_round integer,
  add column if not exists last_sent_after_round integer;

create or replace function private.session_completed_round(p_session public.sessions)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when p_session.phase = 'social' then
      greatest(private.plan_round_count(p_session.id), 1)
    when p_session.phase in ('round_interstitial', 'round_live') then
      greatest(p_session.current_plan_index + 1, 1)
    else
      0
  end;
$$;

create or replace function public.pass_vibe(
  p_participant_token uuid,
  p_vibe_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
  v_vibe public.vibes;
  v_session public.sessions;
  v_completed_round integer;
begin
  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_vibe
  from public.vibes
  where id = p_vibe_id
    and to_participant = v_participant.id
    and session_id = v_participant.session_id
  for update;

  if not found then
    raise exception 'vibe_not_found';
  end if;

  if v_vibe.status <> 'pending' then
    raise exception 'vibe_not_pending';
  end if;

  select * into v_session
  from public.sessions
  where id = v_participant.session_id;

  v_completed_round := private.session_completed_round(v_session);

  update public.vibes
  set status = 'passed',
      passed_after_round = v_completed_round
  where id = v_vibe.id
  returning * into v_vibe;

  -- Silent pass: no domain event to the sender.
  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'status', v_vibe.status,
    'passed_after_round', v_vibe.passed_after_round
  );
end;
$$;

create or replace function public.send_vibe(
  p_participant_token uuid,
  p_to_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_from public.participants;
  v_to public.participants;
  v_session public.sessions;
  v_existing public.vibes;
  v_vibe public.vibes;
  v_match_id uuid;
  v_completed_round integer;
  v_resending boolean := false;
begin
  select * into v_from
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  select * into v_to
  from public.participants
  where id = p_to_participant_id
    and session_id = v_from.session_id;

  if not found then
    raise exception 'recipient_not_in_session';
  end if;

  if v_from.id = v_to.id then
    raise exception 'cannot_vibe_self';
  end if;

  select * into v_session
  from public.sessions
  where id = v_from.session_id;

  if v_session.phase not in ('round_interstitial', 'social') then
    raise exception 'vibe_window_closed'
      using hint = 'Vibes can only be sent during round breaks or social hour.';
  end if;

  v_completed_round := private.session_completed_round(v_session);

  select * into v_existing
  from public.vibes
  where session_id = v_from.session_id
    and from_participant = v_from.id
    and to_participant = v_to.id;

  if found then
    if v_existing.status = 'pending' then
      return jsonb_build_object(
        'vibe_id', v_existing.id,
        'status', v_existing.status,
        'noop', true,
        'reason', 'already_pending'
      );
    end if;

    if v_existing.status = 'accepted' then
      return jsonb_build_object(
        'vibe_id', v_existing.id,
        'status', v_existing.status,
        'noop', true,
        'reason', 'already_accepted'
      );
    end if;

    if v_existing.status = 'passed' then
      if v_existing.passed_after_round is not null
        and v_completed_round <= v_existing.passed_after_round then
        raise exception 'vibe_passed_wait_next_round'
          using hint = 'They passed this round. Try again after the next round.';
      end if;

      v_resending := true;
    end if;
  end if;

  if v_existing.id is null then
    insert into public.vibes (
      session_id,
      from_participant,
      to_participant,
      status,
      last_sent_after_round,
      passed_after_round
    )
    values (
      v_from.session_id,
      v_from.id,
      v_to.id,
      'pending',
      v_completed_round,
      null
    )
    returning * into v_vibe;
  else
    update public.vibes
    set status = 'pending',
        passed_after_round = null,
        last_sent_after_round = v_completed_round,
        updated_at = now()
    where id = v_existing.id
    returning * into v_vibe;
  end if;

  perform private.emit_domain_event(
    v_from.session_id,
    'vibe.sent',
    v_from.id,
    jsonb_build_object(
      'vibe_id', v_vibe.id,
      'from_participant', v_from.id,
      'to_participant', v_to.id,
      'resend', v_resending,
      'sent_after_round', v_completed_round
    )
  );

  -- Other person already accepted your vibe in their queue → instant match.
  if exists (
    select 1
    from public.vibes
    where session_id = v_from.session_id
      and from_participant = v_to.id
      and to_participant = v_from.id
      and status = 'accepted'
  ) then
    update public.vibes
    set status = 'accepted'
    where id = v_vibe.id
      and status = 'pending'
    returning * into v_vibe;

    v_match_id := private.try_create_match(
      v_from.session_id,
      v_from.id,
      v_to.id,
      v_from.id
    );
  end if;

  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'status', v_vibe.status,
    'match_id', v_match_id,
    'resend', v_resending
  );
end;
$$;
