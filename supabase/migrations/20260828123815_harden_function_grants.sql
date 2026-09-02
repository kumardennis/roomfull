-- Explicitly revoke default PUBLIC grants on admin/cron functions
revoke all on function public.advance_round(uuid, uuid, integer, integer) from public;
revoke all on function public.advance_round(uuid, uuid, integer, integer) from anon, authenticated;
grant execute on function public.advance_round(uuid, uuid, integer, integer) to service_role;

revoke all on function public.advance_reveal_stages(integer) from public;
revoke all on function public.advance_reveal_stages(integer) from anon, authenticated;
grant execute on function public.advance_reveal_stages(integer) to service_role;

-- Fix mutable search_path warnings
create or replace function private.generate_handle()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_animals text[] := array[
    'Otter', 'Fox', 'Bear', 'Hawk', 'Lynx', 'Wolf', 'Dove', 'Crane',
    'Panda', 'Koala', 'Tiger', 'Eagle', 'Raven', 'Finch', 'Moose'
  ];
begin
  return v_animals[1 + floor(random() * array_length(v_animals, 1))::int]
    || (10 + floor(random() * 90))::text;
end;
$$;

create or replace function public.set_vibes_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
