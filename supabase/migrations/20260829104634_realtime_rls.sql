-- Realtime: link anonymous auth to participants + scoped SELECT RLS
-- Enables postgres_changes subscriptions for vibes, messages, and matches.

alter table public.participants
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists participants_session_auth_user_id
  on public.participants (session_id, auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- Auth helpers (used by RLS)
-- ---------------------------------------------------------------------------

create or replace function private.current_participant_id()
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select id
  from public.participants
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function private.current_participant_id() from public;
revoke all on function private.current_participant_id() from anon, authenticated;

create or replace function private.current_session_id()
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select session_id
  from public.participants
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function private.current_session_id() from public;
revoke all on function private.current_session_id() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Link / re-link anonymous auth after check-in
-- ---------------------------------------------------------------------------

create or replace function public.link_participant_auth(p_participant_token uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant public.participants;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  select * into v_participant
  from private.participant_from_token(p_participant_token);

  if not found then
    raise exception 'invalid_participant_token';
  end if;

  update public.participants
  set auth_user_id = auth.uid()
  where id = v_participant.id;
end;
$$;

grant execute on function public.link_participant_auth(uuid) to authenticated;

-- Attach auth on join when the client already has an anonymous session.
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
      using hint = 'No active session for this QR code.';
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
      'handle', v_participant.handle
    )
  );

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'participant_token', v_participant.participant_token,
    'session_id', v_session.id,
    'handle', v_participant.handle,
    'avatar_seed', v_participant.avatar_seed,
    'opener_question_id', v_session.opener_question_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: authenticated participants can read their own realtime rows
-- ---------------------------------------------------------------------------

grant select on public.vibes to authenticated;
grant select on public.messages to authenticated;
grant select on public.matches to authenticated;

create policy "participants_select_own_vibes"
  on public.vibes
  for select
  to authenticated
  using (
    session_id = private.current_session_id()
    and (
      to_participant = private.current_participant_id()
      or from_participant = private.current_participant_id()
    )
  );

create policy "participants_select_own_messages"
  on public.messages
  for select
  to authenticated
  using (
    match_id in (
      select m.id
      from public.matches m
      where m.session_id = private.current_session_id()
        and (
          m.participant_a = private.current_participant_id()
          or m.participant_b = private.current_participant_id()
        )
    )
  );

create policy "participants_select_own_matches"
  on public.matches
  for select
  to authenticated
  using (
    session_id = private.current_session_id()
    and (
      participant_a = private.current_participant_id()
      or participant_b = private.current_participant_id()
    )
  );
