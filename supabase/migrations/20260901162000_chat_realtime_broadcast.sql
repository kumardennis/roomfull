-- Chat realtime via Broadcast (recommended over postgres_changes for DMs).
-- realtime.messages is Supabase-managed: RLS is already on; do not ALTER/grant that table.

drop policy if exists "participants_receive_match_broadcasts" on realtime.messages;

create policy "participants_receive_match_broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.participants p
        on p.session_id = m.session_id
       and p.auth_user_id = (select auth.uid())
      where split_part((select realtime.topic()), ':', 1) = 'match'
        and m.id = split_part((select realtime.topic()), ':', 2)::uuid
        and (m.participant_a = p.id or m.participant_b = p.id)
    )
  );

create or replace function public.broadcast_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.broadcast_changes(
    'match:' || NEW.match_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    null
  );
  return NEW;
end;
$$;

drop trigger if exists messages_broadcast_insert on public.messages;

create trigger messages_broadcast_insert
  after insert on public.messages
  for each row
  execute function public.broadcast_message_insert();
