begin;

-- SanDak (the assistant) cost and abuse protection. Every active signed-in
-- student or teacher may reserve a request; there is no tester allowlist.
-- Admins are excluded to match the public application. Tables live in the
-- non-exposed dars_private schema and are reachable only through the two
-- SECURITY DEFINER functions below.
create schema if not exists dars_private;

-- Single-row defaults used when the caller passes no explicit limit. The
-- application normally passes its environment-configured limits.
create table dars_private.sandak_settings (
  singleton boolean primary key default true check (singleton),
  user_daily_limit integer not null default 60 check (user_daily_limit between 1 and 100000),
  user_minute_limit integer not null default 10 check (user_minute_limit between 1 and 100000),
  global_daily_limit integer not null default 3000 check (global_daily_limit between 1 and 100000),
  global_concurrency integer not null default 10 check (global_concurrency between 1 and 1000)
);
insert into dars_private.sandak_settings default values;

create table dars_private.sandak_user_daily_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  utc_day date not null,
  accepted_requests integer not null default 0 check (accepted_requests >= 0),
  minute_start timestamptz not null,
  minute_requests integer not null default 0 check (minute_requests >= 0),
  primary key (user_id, utc_day)
);

create table dars_private.sandak_global_daily_usage (
  utc_day date primary key,
  accepted_requests integer not null default 0 check (accepted_requests >= 0)
);

create table dars_private.sandak_request_leases (
  lease_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create index sandak_request_leases_expiry_idx on dars_private.sandak_request_leases(expires_at);
create index sandak_request_leases_user_idx on dars_private.sandak_request_leases(user_id);

alter table dars_private.sandak_settings enable row level security;
alter table dars_private.sandak_user_daily_usage enable row level security;
alter table dars_private.sandak_global_daily_usage enable row level security;
alter table dars_private.sandak_request_leases enable row level security;
revoke all on dars_private.sandak_settings, dars_private.sandak_user_daily_usage,
  dars_private.sandak_global_daily_usage, dars_private.sandak_request_leases
  from public, anon, authenticated, service_role;

create or replace function public.sanad_reserve_request(
  p_user_daily integer default null,
  p_user_minute integer default null,
  p_global_daily integer default null,
  p_global_concurrency integer default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, dars_private, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz;
  v_day date;
  v_minute timestamptz;
  v_user_daily integer;
  v_user_minute integer;
  v_global_daily integer;
  v_lease uuid;
  v_lim_user_daily integer;
  v_lim_user_minute integer;
  v_lim_global_daily integer;
  v_lim_concurrency integer;
begin
  if v_user is null then return null; end if;

  -- One transaction lock makes all quota checks and increments atomic across
  -- application workers, including the global in-flight limit.
  perform pg_advisory_xact_lock(hashtextextended('sandak:global-quota', 0));
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'UTC')::date;
  v_minute := date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';

  -- Only active students and teachers. Suspended accounts and admins are refused.
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.status = 'active' and p.role in ('student', 'teacher')
  ) then
    return null;
  end if;

  select
    least(greatest(coalesce(p_user_daily, s.user_daily_limit), 1), 100000),
    least(greatest(coalesce(p_user_minute, s.user_minute_limit), 1), 100000),
    least(greatest(coalesce(p_global_daily, s.global_daily_limit), 1), 100000),
    least(greatest(coalesce(p_global_concurrency, s.global_concurrency), 1), 1000)
    into v_lim_user_daily, v_lim_user_minute, v_lim_global_daily, v_lim_concurrency
    from dars_private.sandak_settings s;

  -- Pruning is bounded and does not alter daily or minute accepted-request counters.
  delete from dars_private.sandak_request_leases
  where lease_id in (
    select lease_id from dars_private.sandak_request_leases
    where expires_at <= v_now order by expires_at limit 500
  );
  delete from dars_private.sandak_user_daily_usage
  where ctid in (
    select ctid from dars_private.sandak_user_daily_usage
    where utc_day < v_day order by utc_day limit 1000
  );
  delete from dars_private.sandak_global_daily_usage
  where ctid in (
    select ctid from dars_private.sandak_global_daily_usage
    where utc_day < v_day order by utc_day limit 100
  );

  if (select count(*) from dars_private.sandak_request_leases where user_id = v_user) >= 1
     or (select count(*) from dars_private.sandak_request_leases) >= v_lim_concurrency then
    return null;
  end if;

  insert into dars_private.sandak_user_daily_usage(user_id, utc_day, minute_start)
  values (v_user, v_day, v_minute)
  on conflict (user_id, utc_day) do nothing;
  select accepted_requests,
         case when minute_start = v_minute then minute_requests else 0 end
    into v_user_daily, v_user_minute
    from dars_private.sandak_user_daily_usage
   where user_id = v_user and utc_day = v_day
   for update;

  insert into dars_private.sandak_global_daily_usage(utc_day)
  values (v_day)
  on conflict (utc_day) do nothing;
  select accepted_requests
    into v_global_daily from dars_private.sandak_global_daily_usage where utc_day = v_day for update;

  if v_user_daily >= v_lim_user_daily or v_user_minute >= v_lim_user_minute
     or v_global_daily >= v_lim_global_daily then
    return null;
  end if;

  update dars_private.sandak_user_daily_usage
     set accepted_requests = accepted_requests + 1,
         minute_start = v_minute,
         minute_requests = v_user_minute + 1
   where user_id = v_user and utc_day = v_day;
  update dars_private.sandak_global_daily_usage
     set accepted_requests = accepted_requests + 1
   where utc_day = v_day;

  insert into dars_private.sandak_request_leases(user_id, expires_at)
  values (v_user, v_now + interval '45 seconds')
  returning lease_id into v_lease;
  return v_lease;
end
$$;

create or replace function public.sanad_release_request(p_lease uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, dars_private, auth
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('sandak:global-quota', 0));
  delete from dars_private.sandak_request_leases
   where lease_id = p_lease and user_id = v_user;
end
$$;

revoke all on function public.sanad_reserve_request(integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.sanad_release_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.sanad_reserve_request(integer, integer, integer, integer) to authenticated;
grant execute on function public.sanad_release_request(uuid) to authenticated;

commit;
