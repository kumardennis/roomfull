-- Accepting an incoming vibe = vibe back. Create the match immediately.

create or replace function private.try_create_match(
  p_session_id uuid,
  p_participant_a uuid,
  p_participant_b uuid,
  p_actor_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_low uuid;
  v_high uuid;
  v_match_id uuid;
  v_created boolean := false;
begin
  if p_participant_a < p_participant_b then
    v_low := p_participant_a;
    v_high := p_participant_b;
  else
    v_low := p_participant_b;
    v_high := p_participant_a;
  end if;

  insert into public.matches (
    session_id,
    participant_a,
    participant_b
  )
  values (
    p_session_id,
    v_low,
    v_high
  )
  on conflict (session_id, participant_a, participant_b) do nothing
  returning id into v_match_id;

  if v_match_id is not null then
    v_created := true;
  else
    select id into v_match_id
    from public.matches
    where session_id = p_session_id
      and participant_a = v_low
      and participant_b = v_high;
  end if;

  if v_created and v_match_id is not null then
    perform private.emit_domain_event(
      p_session_id,
      'match.created',
      p_actor_participant_id,
      jsonb_build_object(
        'match_id', v_match_id,
        'participant_a', v_low,
        'participant_b', v_high
      )
    );
  end if;

  return v_match_id;
end;
$$;

create or replace function public.accept_vibe(
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
  v_reverse_vibe public.vibes;
  v_match_id uuid;
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

  update public.vibes
  set status = 'accepted'
  where id = v_vibe.id
  returning * into v_vibe;

  perform private.emit_domain_event(
    v_participant.session_id,
    'vibe.accepted',
    v_participant.id,
    jsonb_build_object('vibe_id', v_vibe.id)
  );

  -- Accepting = vibe back (mutual interest).
  insert into public.vibes (
    session_id,
    from_participant,
    to_participant,
    status
  )
  values (
    v_participant.session_id,
    v_participant.id,
    v_vibe.from_participant,
    'accepted'
  )
  on conflict (session_id, from_participant, to_participant)
  do update set
    status = 'accepted',
    updated_at = now()
  returning * into v_reverse_vibe;

  if v_reverse_vibe.id is distinct from v_vibe.id then
    perform private.emit_domain_event(
      v_participant.session_id,
      'vibe.accepted',
      v_participant.id,
      jsonb_build_object('vibe_id', v_reverse_vibe.id)
    );
  end if;

  v_match_id := private.try_create_match(
    v_participant.session_id,
    v_participant.id,
    v_vibe.from_participant,
    v_participant.id
  );

  return jsonb_build_object(
    'vibe_id', v_vibe.id,
    'status', v_vibe.status,
    'match_id', v_match_id
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
  v_vibe public.vibes;
  v_match_id uuid;
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

  insert into public.vibes (
    session_id,
    from_participant,
    to_participant
  )
  values (
    v_from.session_id,
    v_from.id,
    v_to.id
  )
  on conflict (session_id, from_participant, to_participant) do update
    set status = case
      when public.vibes.status in ('passed', 'expired') then 'pending'::public.vibe_status
      else public.vibes.status
    end,
    updated_at = now()
  returning * into v_vibe;

  perform private.emit_domain_event(
    v_from.session_id,
    'vibe.sent',
    v_from.id,
    jsonb_build_object(
      'vibe_id', v_vibe.id,
      'from_participant', v_from.id,
      'to_participant', v_to.id
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
    'match_id', v_match_id
  );
end;
$$;
