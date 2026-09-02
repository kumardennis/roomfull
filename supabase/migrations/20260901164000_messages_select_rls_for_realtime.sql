-- Realtime postgres_changes uses SELECT RLS on the subscribed table.
-- private.current_* helpers are revoked from authenticated → no events delivered.

drop policy if exists "participants_select_own_messages" on public.messages;

create policy "participants_select_own_messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.participants p
        on p.session_id = m.session_id
       and p.auth_user_id = (select auth.uid())
      where m.id = messages.match_id
        and (m.participant_a = p.id or m.participant_b = p.id)
    )
  );

drop policy if exists "participants_select_own_vibes" on public.vibes;

create policy "participants_select_own_vibes"
  on public.vibes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.participants p
      where p.session_id = vibes.session_id
        and p.auth_user_id = (select auth.uid())
        and (
          vibes.to_participant = p.id
          or vibes.from_participant = p.id
        )
    )
  );

drop policy if exists "participants_select_own_matches" on public.matches;

create policy "participants_select_own_matches"
  on public.matches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.participants p
      where p.session_id = matches.session_id
        and p.auth_user_id = (select auth.uid())
        and (
          matches.participant_a = p.id
          or matches.participant_b = p.id
        )
    )
  );
