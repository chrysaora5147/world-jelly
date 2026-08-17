create table if not exists public.jelly_stats (
  id text primary key default 'singleton',
  total_pokes bigint not null default 0,
  fortune_baht numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint jelly_stats_singleton check (id = 'singleton'),
  constraint jelly_stats_total_pokes_nonnegative check (total_pokes >= 0),
  constraint jelly_stats_fortune_nonnegative check (fortune_baht >= 0)
);

insert into public.jelly_stats (id, total_pokes, fortune_baht)
values ('singleton', 3829417, 12491)
on conflict (id) do nothing;

alter table public.jelly_stats enable row level security;

create or replace function public.add_pokes(delta bigint)
returns table (
  total_pokes bigint,
  fortune_baht numeric,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if delta is null or delta <= 0 or delta > 500 then
    raise exception 'invalid delta'
      using errcode = '22023';
  end if;

  return query
  update public.jelly_stats
  set
    total_pokes = jelly_stats.total_pokes + delta,
    updated_at = now()
  where id = 'singleton'
  returning jelly_stats.total_pokes, jelly_stats.fortune_baht, jelly_stats.updated_at;
end;
$$;

revoke all on function public.add_pokes(bigint) from public;
grant execute on function public.add_pokes(bigint) to service_role;

create table if not exists public.jelly_sessions (
  session_id uuid primary key,
  visitor_id uuid not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  duration_seconds integer not null default 0,
  pokes integer not null default 0,
  give_jelly_opened boolean not null default false,
  sound_muted boolean,
  share_clicked boolean,
  user_agent text,
  updated_at timestamptz not null default now(),
  constraint jelly_sessions_duration_reasonable check (duration_seconds >= 0 and duration_seconds <= 86400),
  constraint jelly_sessions_pokes_reasonable check (pokes >= 0 and pokes <= 1000000)
);

create index if not exists jelly_sessions_visitor_id_idx on public.jelly_sessions (visitor_id);
create index if not exists jelly_sessions_started_at_idx on public.jelly_sessions (started_at);

alter table public.jelly_sessions enable row level security;
