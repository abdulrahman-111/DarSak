-- Admin portal login throttle (issue #106).
-- The admin app may not use the service-role key (scripts/admin-boundary.mjs), so
-- the limiter is a pair of anon-callable SECURITY DEFINER functions. All hashing,
-- validation and counting happen in SQL; the private table is unreachable directly.
-- Limits: 5 failed attempts per email and 20 per client IP in any 15 minute window.
-- The check returns only true/false, so it never reveals whether an account exists.
create schema if not exists dars_private;

create table if not exists dars_private.admin_login_attempts (
  id bigint generated always as identity primary key,
  email_hash bytea not null,
  ip_hash bytea not null,
  attempted_at timestamptz not null default now(),
  constraint admin_login_attempts_email_hash_len check (octet_length(email_hash) = 32),
  constraint admin_login_attempts_ip_hash_len check (octet_length(ip_hash) = 32)
);
alter table dars_private.admin_login_attempts enable row level security;
revoke all on dars_private.admin_login_attempts from public, anon, authenticated, service_role;
create index if not exists admin_login_attempts_email_idx
  on dars_private.admin_login_attempts (email_hash, attempted_at desc);
create index if not exists admin_login_attempts_ip_idx
  on dars_private.admin_login_attempts (ip_hash, attempted_at desc);

-- Normalises and validates caller input. Returns false for anything malformed.
create or replace function dars_private.admin_login_hashes(p_email text, p_ip text, out email_hash bytea, out ip_hash bytea)
returns record
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip text := btrim(coalesce(p_ip, ''));
begin
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'invalid login throttle input' using errcode = '22023';
  end if;
  -- The app passes the proxy-reported client address; anything else is bucketed as unknown.
  if v_ip = '' or char_length(v_ip) > 45 or v_ip !~ '^[0-9a-fA-F:.]+$' then v_ip := 'unknown'; end if;
  email_hash := sha256(convert_to('darsak-admin-login-email:' || v_email, 'UTF8'));
  ip_hash := sha256(convert_to('darsak-admin-login-ip:' || lower(v_ip), 'UTF8'));
end;
$$;
revoke all on function dars_private.admin_login_hashes(text, text) from public, anon, authenticated, service_role;

-- true = the attempt may proceed, false = blocked (too many recent failures).
create or replace function public.admin_login_allowed(p_email text, p_ip text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, dars_private
as $$
declare
  v record;
  v_window constant interval := interval '15 minutes';
begin
  select * into v from dars_private.admin_login_hashes(p_email, p_ip);
  return (select count(*) from dars_private.admin_login_attempts
            where email_hash = v.email_hash and attempted_at > now() - v_window) < 5
     and (select count(*) from dars_private.admin_login_attempts
            where ip_hash = v.ip_hash and attempted_at > now() - v_window) < 20;
end;
$$;

-- Records one failed sign-in. Once both buckets are full nothing more is stored,
-- so spamming the function cannot grow the table or extend a block indefinitely.
create or replace function public.admin_login_record_failure(p_email text, p_ip text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, dars_private
as $$
declare
  v record;
  v_window constant interval := interval '15 minutes';
  v_email_count integer;
  v_ip_count integer;
begin
  select * into v from dars_private.admin_login_hashes(p_email, p_ip);
  delete from dars_private.admin_login_attempts where attempted_at < now() - interval '1 day';
  select count(*) into v_email_count from dars_private.admin_login_attempts
    where email_hash = v.email_hash and attempted_at > now() - v_window;
  select count(*) into v_ip_count from dars_private.admin_login_attempts
    where ip_hash = v.ip_hash and attempted_at > now() - v_window;
  if v_email_count < 5 or v_ip_count < 20 then
    insert into dars_private.admin_login_attempts(email_hash, ip_hash) values (v.email_hash, v.ip_hash);
  end if;
end;
$$;

revoke all on function public.admin_login_allowed(text, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_login_record_failure(text, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_login_allowed(text, text) to anon, authenticated;
grant execute on function public.admin_login_record_failure(text, text) to anon, authenticated;
