-- Realtime column filters (e.g. match_id=eq.) require FULL replica identity.

alter table public.messages replica identity full;
alter table public.vibes replica identity full;
alter table public.matches replica identity full;
