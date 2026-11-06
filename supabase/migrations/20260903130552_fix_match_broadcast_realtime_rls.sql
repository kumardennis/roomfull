-- Match chat private broadcast was Unauthorized because the realtime.messages
-- policy joined public.participants, which has no authenticated SELECT.
-- Reuse security-definer is_match_participant() (same pattern as messages RLS).

drop policy if exists "participants_receive_match_broadcasts" on realtime.messages;

create policy "participants_receive_match_broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    split_part((select realtime.topic()), ':', 1) = 'match'
    and public.is_match_participant(
      split_part((select realtime.topic()), ':', 2)::uuid
    )
    and realtime.messages.extension in ('broadcast')
  );
