-- Per-format answer windows. A plan row with no explicit duration_sec gets the
-- format default on insert; open_planned_round keeps reading plan.duration_sec.

create or replace function private.answer_seconds(p_format public.question_format)
returns integer
language sql
immutable
as $$
  select case p_format
    when 'this_or_that' then 30
    when 'hot_take' then 30
    when 'superlative' then 45
    when 'two_truths_one_lie' then 60
    when 'prediction' then 60
  end;
$$;

revoke all on function private.answer_seconds(public.question_format) from public;
revoke all on function private.answer_seconds(public.question_format) from anon, authenticated;

alter table public.session_round_plan
  alter column duration_sec drop default;

create or replace function private.trg_session_round_plan_default_duration()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.duration_sec is null then
    select private.answer_seconds(q.format)
    into new.duration_sec
    from public.questions q
    where q.id = new.question_id;
  end if;

  return new;
end;
$$;

drop trigger if exists session_round_plan_default_duration on public.session_round_plan;

create trigger session_round_plan_default_duration
  before insert or update of question_id, duration_sec on public.session_round_plan
  for each row
  execute function private.trg_session_round_plan_default_duration();

-- 90 was the old column default, never a deliberate choice.
update public.session_round_plan p
set duration_sec = private.answer_seconds(q.format)
from public.questions q
where q.id = p.question_id
  and p.duration_sec = 90;
