-- Realtime postgres_changes evaluates SELECT RLS on the subscribed table.
-- Policies that subquery public.participants fail because participants has no
-- authenticated SELECT policy (service_role only). Use SECURITY DEFINER helpers.

-- ---------------------------------------------------------------------------
-- Auth helpers (callable by authenticated; read participants as definer)
-- ---------------------------------------------------------------------------

create or replace function public.auth_participant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.participants
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.auth_session_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select session_id
  from public.participants
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    join public.participants pa on pa.id = m.participant_a
    join public.participants pb on pb.id = m.participant_b
    where m.id = p_match_id
      and (pa.auth_user_id = auth.uid() or pb.auth_user_id = auth.uid())
  );
$$;

create or replace function public.can_read_vibe(p_session_id uuid, p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    where p.auth_user_id = auth.uid()
      and p.session_id = p_session_id
      and (p.id = p_from or p.id = p_to)
  );
$$;

revoke all on function public.auth_participant_id() from public;
revoke all on function public.auth_session_id() from public;
revoke all on function public.is_match_participant(uuid) from public;
revoke all on function public.can_read_vibe(uuid, uuid, uuid) from public;

grant execute on function public.auth_participant_id() to authenticated;
grant execute on function public.auth_session_id() to authenticated;
grant execute on function public.is_match_participant(uuid) to authenticated;
grant execute on function public.can_read_vibe(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- messages / matches / vibes — realtime SELECT
-- ---------------------------------------------------------------------------

drop policy if exists "participants_select_own_messages" on public.messages;

create policy "participants_select_own_messages"
  on public.messages
  for select
  to authenticated
  using (public.is_match_participant(match_id));

drop policy if exists "participants_select_own_matches" on public.matches;

create policy "participants_select_own_matches"
  on public.matches
  for select
  to authenticated
  using (public.is_match_participant(id));

drop policy if exists "participants_select_own_vibes" on public.vibes;

create policy "participants_select_own_vibes"
  on public.vibes
  for select
  to authenticated
  using (public.can_read_vibe(session_id, from_participant, to_participant));

-- ---------------------------------------------------------------------------
-- sessions / rounds / answers — play realtime (was private.current_*)
-- ---------------------------------------------------------------------------

drop policy if exists "participants_select_own_session" on public.sessions;

create policy "participants_select_own_session"
  on public.sessions
  for select
  to authenticated
  using (id = public.auth_session_id());

drop policy if exists "participants_select_session_rounds" on public.rounds;

create policy "participants_select_session_rounds"
  on public.rounds
  for select
  to authenticated
  using (session_id = public.auth_session_id());

drop policy if exists "participants_select_session_answers" on public.answers;

create policy "participants_select_session_answers"
  on public.answers
  for select
  to authenticated
  using (
    round_id in (
      select r.id
      from public.rounds r
      where r.session_id = public.auth_session_id()
    )
  );
