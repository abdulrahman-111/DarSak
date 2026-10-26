begin;

create schema if not exists private;

-- Enrollment is administered outside this source migration. The allowlist is
-- intentionally independent of the short-lived request and quota records.
create table private.sanad_pilot_testers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default clock_timestamp()
);

create table private.sanad_user_daily_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  utc_day date not null,
  accepted_requests integer not null default 0 check (accepted_requests between 0 and 100),
  minute_start timestamptz not null,
  minute_requests integer not null default 0 check (minute_requests between 0 and 10),
  primary key (user_id, utc_day)
);

create table private.sanad_global_daily_usage (
  utc_day date primary key,
  accepted_requests integer not null default 0 check (accepted_requests between 0 and 500)
);

create table private.sanad_request_leases (
  lease_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create index sanad_request_leases_expiry_idx on private.sanad_request_leases(expires_at);
create index sanad_request_leases_user_idx on private.sanad_request_leases(user_id);

alter table private.sanad_pilot_testers enable row level security;
alter table private.sanad_user_daily_usage enable row level security;
alter table private.sanad_global_daily_usage enable row level security;
alter table private.sanad_request_leases enable row level security;
revoke all on private.sanad_pilot_testers, private.sanad_user_daily_usage,
  private.sanad_global_daily_usage, private.sanad_request_leases
  from public, anon, authenticated, service_role;

create or replace function public.sanad_reserve_request()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, private, public, auth
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
begin
  if v_user is null then return null; end if;

  -- One transaction lock makes all quota checks and increments atomic across
  -- application workers, including the global in-flight limit.
  perform pg_advisory_xact_lock(hashtextextended('sanad:global-quota', 0));
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'UTC')::date;
  v_minute := date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user and p.status = 'active'
  ) or not exists (
    select 1 from private.sanad_pilot_testers t where t.user_id = v_user
  ) then
    return null;
  end if;

  -- Lease rows are naturally capped by 5 global requests. Pruning is bounded
  -- and does not alter daily or minute accepted-request counters.
  delete from private.sanad_request_leases
  where lease_id in (
    select lease_id from private.sanad_request_leases
    where expires_at <= v_now order by expires_at limit 500
  );
  delete from private.sanad_user_daily_usage
  where ctid in (
    select ctid from private.sanad_user_daily_usage
    where utc_day < v_day order by utc_day limit 1000
  );
  delete from private.sanad_global_daily_usage
  where ctid in (
    select ctid from private.sanad_global_daily_usage
    where utc_day < v_day order by utc_day limit 100
  );

  if (select count(*) from private.sanad_request_leases where user_id = v_user) >= 1
     or (select count(*) from private.sanad_request_leases) >= 5 then
    return null;
  end if;

  insert into private.sanad_user_daily_usage(user_id, utc_day, minute_start)
  values (v_user, v_day, v_minute)
  on conflict (user_id, utc_day) do nothing;
  select accepted_requests,
         case when minute_start = v_minute then minute_requests else 0 end
    into v_user_daily, v_user_minute
    from private.sanad_user_daily_usage
   where user_id = v_user and utc_day = v_day
   for update;

  insert into private.sanad_global_daily_usage(utc_day)
  values (v_day)
  on conflict (utc_day) do nothing;
  select accepted_requests
    into v_global_daily from private.sanad_global_daily_usage where utc_day = v_day for update;

  if v_user_daily >= 100 or v_user_minute >= 10
     or v_global_daily >= 500 then
    return null;
  end if;

  update private.sanad_user_daily_usage
     set accepted_requests = accepted_requests + 1,
         minute_start = v_minute,
         minute_requests = v_user_minute + 1
   where user_id = v_user and utc_day = v_day;
  update private.sanad_global_daily_usage
     set accepted_requests = accepted_requests + 1
   where utc_day = v_day;

  insert into private.sanad_request_leases(user_id, expires_at)
  values (v_user, v_now + interval '45 seconds')
  returning lease_id into v_lease;
  return v_lease;
end
$$;

create or replace function public.sanad_release_request(p_lease uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('sanad:global-quota', 0));
  delete from private.sanad_request_leases
   where lease_id = p_lease and user_id = v_user;
end
$$;

revoke all on function public.sanad_reserve_request() from public, anon, authenticated, service_role;
revoke all on function public.sanad_release_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.sanad_reserve_request() to authenticated;
grant execute on function public.sanad_release_request(uuid) to authenticated;

commit;
