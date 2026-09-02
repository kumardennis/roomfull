-- join_session: return existing participant when the same auth user re-joins a session
-- (fixes duplicate key on participants_session_auth_user_id)

create or replace function public.join_session(
  p_qr_code text,
  p_handle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_session public.sessions;
  v_handle text;
  v_avatar_seed text;
  v_participant public.participants;
begin
  select *
  into v_session
  from public.sessions
  where qr_code = p_qr_code
    and status in ('scheduled', 'active');

  if not found then
    raise exception 'session_not_found'
      using hint = 'No joinable session for this QR code.';
  end if;

  if auth.uid() is not null then
    select *
    into v_participant
    from public.participants
    where session_id = v_session.id
      and auth_user_id = auth.uid();

    if found then
      return jsonb_build_object(
        'participant_id', v_participant.id,
        'participant_token', v_participant.participant_token,
        'session_id', v_session.id,
        'handle', v_participant.handle,
        'avatar_seed', v_participant.avatar_seed,
        'opener_question_id', v_session.opener_question_id,
        'session_phase', v_session.phase,
        'needs_opener', v_participant.opener_answer is null
      );
    end if;
  end if;

  v_handle := coalesce(nullif(trim(p_handle), ''), private.generate_handle());
  v_avatar_seed := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.participants (
    session_id,
    handle,
    avatar_seed,
    auth_user_id
  )
  values (
    v_session.id,
    v_handle,
    v_avatar_seed,
    auth.uid()
  )
  returning * into v_participant;

  perform private.emit_domain_event(
    v_session.id,
    'participant.joined',
    v_participant.id,
    jsonb_build_object(
      'participant_id', v_participant.id,
      'handle', v_participant.handle,
      'session_phase', v_session.phase
    )
  );

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'participant_token', v_participant.participant_token,
    'session_id', v_session.id,
    'handle', v_participant.handle,
    'avatar_seed', v_participant.avatar_seed,
    'opener_question_id', v_session.opener_question_id,
    'session_phase', v_session.phase,
    'needs_opener', v_participant.opener_answer is null
  );
end;
$$;
