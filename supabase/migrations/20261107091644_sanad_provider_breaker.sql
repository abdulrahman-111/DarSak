begin;

create table dars_private.sanad_provider_circuit (
  singleton boolean primary key default true check (singleton),
  generation bigint not null default 1 check (generation > 0),
  quota_failures integer not null default 0 check (quota_failures between 0 and 5),
  open_until timestamptz,
  probe_attempt uuid,
  probe_lease_until timestamptz,
  check ((probe_attempt is null) = (probe_lease_until is null))
);
alter table dars_private.sanad_provider_circuit enable row level security;
revoke all on dars_private.sanad_provider_circuit from public, anon, authenticated, service_role;
insert into dars_private.sanad_provider_circuit(singleton) values (true);

create table dars_private.sanad_provider_attempts (
  attempt_id uuid primary key,
  generation bigint not null,
  attempt_kind text not null check (attempt_kind in ('regular','probe')),
  claimed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '45 seconds'),
  outcome text check (outcome in ('success','quota_error','other_error','cancelled'))
);
create index sanad_provider_attempts_expires_at_idx
  on dars_private.sanad_provider_attempts(expires_at);
alter table dars_private.sanad_provider_attempts enable row level security;
revoke all on dars_private.sanad_provider_attempts from public, anon, authenticated, service_role;

create or replace function public.sanad_provider_claim()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_circuit dars_private.sanad_provider_circuit%rowtype;
  v_now timestamptz := clock_timestamp();
  v_attempt uuid;
  v_wait integer;
begin
  if coalesce(auth.jwt()->>'role' = 'service_role', false) is not true then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into v_circuit
  from dars_private.sanad_provider_circuit
  where singleton
  for update;
  v_now := clock_timestamp();

  -- Attempt identifiers are short-lived replay guards; no request metadata is stored.
  delete from dars_private.sanad_provider_attempts
  where expires_at < v_now;

  if v_circuit.open_until is not null then
    if v_circuit.open_until > v_now then
      v_wait := greatest(1, ceil(extract(epoch from (v_circuit.open_until - v_now)))::integer);
      return jsonb_build_object('allowed', false, 'attempt', null, 'retry_after', v_wait);
    end if;

    if v_circuit.probe_attempt is not null and v_circuit.probe_lease_until > v_now then
      v_wait := greatest(1, ceil(extract(epoch from (v_circuit.probe_lease_until - v_now)))::integer);
      return jsonb_build_object('allowed', false, 'attempt', null, 'retry_after', v_wait);
    end if;

    v_attempt := gen_random_uuid();
    insert into dars_private.sanad_provider_attempts(attempt_id, generation, attempt_kind)
    values (v_attempt, v_circuit.generation, 'probe');
    update dars_private.sanad_provider_circuit
    set probe_attempt = v_attempt,
        probe_lease_until = v_now + interval '45 seconds'
    where singleton;
    return jsonb_build_object('allowed', true, 'attempt', v_attempt, 'retry_after', 0);
  end if;

  v_attempt := gen_random_uuid();
  insert into dars_private.sanad_provider_attempts(attempt_id, generation, attempt_kind)
  values (v_attempt, v_circuit.generation, 'regular');
  return jsonb_build_object('allowed', true, 'attempt', v_attempt, 'retry_after', 0);
end;
$$;

create or replace function public.sanad_provider_finish(p_attempt uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_attempt dars_private.sanad_provider_attempts%rowtype;
  v_circuit dars_private.sanad_provider_circuit%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt()->>'role' = 'service_role', false) is not true then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_attempt is null or p_outcome is null or p_outcome not in ('success','quota_error','other_error','cancelled') then
    raise exception 'invalid provider completion' using errcode = '22023';
  end if;

  -- Consistent circuit-then-attempt lock order matches claim and serializes state transitions.
  select * into v_circuit
  from dars_private.sanad_provider_circuit
  where singleton
  for update;
  v_now := clock_timestamp();
  select * into v_attempt
  from dars_private.sanad_provider_attempts
  where attempt_id = p_attempt
  for update;
  if not found or v_attempt.outcome is not null or v_attempt.expires_at <= v_now then
    return;
  end if;
  update dars_private.sanad_provider_attempts
  set outcome = p_outcome
  where attempt_id = p_attempt;

  if v_attempt.generation <> v_circuit.generation then
    return;
  end if;

  if v_attempt.attempt_kind = 'probe' then
    if v_circuit.probe_attempt is distinct from p_attempt then
      return;
    end if;
    if p_outcome = 'success' then
      update dars_private.sanad_provider_circuit
      set generation = generation + 1,
          quota_failures = 0,
          open_until = null,
          probe_attempt = null,
          probe_lease_until = null
      where singleton;
    elsif p_outcome = 'cancelled' then
      -- Local quota rejection or early cancellation releases the lease without extending cooldown.
      update dars_private.sanad_provider_circuit
      set generation = generation + 1,
          probe_attempt = null,
          probe_lease_until = null
      where singleton;
    else
      -- A provider error during recovery restarts cooldown for 15 minutes.
      update dars_private.sanad_provider_circuit
      set generation = generation + 1,
          quota_failures = 0,
          open_until = v_now + interval '15 minutes',
          probe_attempt = null,
          probe_lease_until = null
      where singleton;
    end if;
    return;
  end if;

  if p_outcome = 'success' then
    update dars_private.sanad_provider_circuit
    set generation = generation + 1,
        quota_failures = 0,
        open_until = null,
        probe_attempt = null,
        probe_lease_until = null
    where singleton;
  elsif p_outcome = 'quota_error' then
    update dars_private.sanad_provider_circuit
    set quota_failures = quota_failures + 1
    where singleton;
    select * into v_circuit from dars_private.sanad_provider_circuit where singleton;
    if v_circuit.quota_failures >= 5 then
      update dars_private.sanad_provider_circuit
      set generation = generation + 1,
          quota_failures = 0,
          open_until = v_now + interval '15 minutes',
          probe_attempt = null,
          probe_lease_until = null
      where singleton;
    end if;
  end if;
  -- other_error and cancelled neither count nor reset a closed circuit.
end;
$$;

revoke all on function public.sanad_provider_claim() from public, anon, authenticated;
revoke all on function public.sanad_provider_finish(uuid, text) from public, anon, authenticated;
grant execute on function public.sanad_provider_claim() to service_role;
grant execute on function public.sanad_provider_finish(uuid, text) to service_role;

commit;
