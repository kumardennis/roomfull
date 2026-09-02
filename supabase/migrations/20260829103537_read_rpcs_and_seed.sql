-- Applied remotely via MCP (host_pin column only)
alter table public.sessions
  add column if not exists host_pin text;
