-- Run with `supabase test db` after migrations. These checks exercise direct
-- authenticated RPC calls; broader lease behavior is covered by tests/database/sandak_quota.sql.
create extension if not exists pgtap;
begin;
select plan(34);
select has_function('public','sanad_reserve_request',array['integer','integer','integer','integer'], 'reserve RPC exists');
select has_function('public','sanad_release_request',array['uuid'], 'release RPC exists');
select ok(not has_function_privilege('anon','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE'), 'anon cannot reserve');
select ok(has_function_privilege('authenticated','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE'), 'authenticated can reserve');
select ok(not has_function_privilege('anon','public.sanad_release_request(uuid)','EXECUTE'), 'anon cannot release');
select ok(not has_table_privilege('authenticated','dars_private.sandak_request_leases','SELECT,INSERT,UPDATE,DELETE'), 'leases are not directly accessible');
select ok(not has_table_privilege('authenticated','dars_private.sandak_settings','SELECT,INSERT,UPDATE,DELETE'), 'settings are not directly accessible');
select is((select user_daily_limit from dars_private.sandak_settings), 60, 'default per-user daily limit');
select is((select global_concurrency from dars_private.sandak_settings), 10, 'default global concurrency');

-- Exercise the RPC as authenticated, which is the direct caller threat model.
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a8200000-0000-4000-8000-000000000001','authenticated','authenticated','quota-cap-one@test.invalid','{"full_name":"Quota Cap One","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000002','authenticated','authenticated','quota-cap-two@test.invalid','{"full_name":"Quota Cap Two","requested_role":"student"}');

-- A high caller limit cannot exceed the configured per-user daily ceiling.
update dars_private.sandak_settings set user_daily_limit=2,user_minute_limit=100,
  global_daily_limit=100,global_concurrency=10;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'first high-limit reservation accepted under daily ceiling') from reserved cross join released;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'second high-limit reservation accepted under daily ceiling') from reserved cross join released;
select is(public.sanad_reserve_request(100000,100000,100000,100000), null::uuid, 'high caller daily limit cannot exceed configured daily ceiling');
reset role;

-- A high caller limit cannot exceed the configured per-minute ceiling.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
update dars_private.sandak_settings set user_daily_limit=100,user_minute_limit=2,
  global_daily_limit=100,global_concurrency=10;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'first high-limit reservation accepted under minute ceiling') from reserved cross join released;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'second high-limit reservation accepted under minute ceiling') from reserved cross join released;
select is(public.sanad_reserve_request(100000,100000,100000,100000), null::uuid, 'high caller minute limit cannot exceed configured minute ceiling');
reset role;

-- A high caller limit cannot exceed the configured global daily ceiling.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
update dars_private.sandak_settings set user_daily_limit=100,user_minute_limit=100,
  global_daily_limit=2,global_concurrency=10;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'first high-limit reservation accepted under global daily ceiling') from reserved cross join released;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'second high-limit reservation accepted under global daily ceiling') from reserved cross join released;
select is(public.sanad_reserve_request(100000,100000,100000,100000), null::uuid, 'high caller global daily limit cannot exceed configured ceiling');
reset role;

-- Global concurrency is capped even when callers request the old maximum.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
update dars_private.sandak_settings set user_daily_limit=100,user_minute_limit=100,
  global_daily_limit=100,global_concurrency=1;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
select ok(public.sanad_reserve_request(100000,100000,100000,100000) is not null, 'first high-limit lease accepted under concurrency ceiling');
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000002';
select is(public.sanad_reserve_request(100000,100000,100000,100000), null::uuid, 'high caller concurrency limit cannot exceed configured ceiling');
reset role;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
select public.sanad_release_request((select lease_id from dars_private.sandak_request_leases where user_id=auth.uid()));

-- Lower caller limits remain effective.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
update dars_private.sandak_settings set user_daily_limit=5,user_minute_limit=100,
  global_daily_limit=100,global_concurrency=10;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
with reserved as materialized (select public.sanad_reserve_request(2,100,100,10) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'lower caller daily limit permits first request') from reserved cross join released;
with reserved as materialized (select public.sanad_reserve_request(2,100,100,10) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is not null, 'lower caller daily limit permits second request') from reserved cross join released;
select is(public.sanad_reserve_request(2,100,100,10), null::uuid, 'lower caller daily limit remains effective');
reset role;
select is((select accepted_requests from dars_private.sandak_user_daily_usage
  where user_id='a8200000-0000-4000-8000-000000000001'), 2, 'lower caller limit records two accepted requests');

-- Invalid inputs are tested with fresh quota state, so the old clamp-to-one
-- behavior could not pass merely because an earlier request exhausted quota.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
update dars_private.sandak_settings set user_daily_limit=100,user_minute_limit=100,
  global_daily_limit=100,global_concurrency=10;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
with reserved as materialized (select public.sanad_reserve_request(0,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'zero user daily limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(-1,100000,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'negative user daily limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(100000,0,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'zero user minute limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(100000,-1,100000,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'negative user minute limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,0,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'zero global daily limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,-1,100000) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'negative global daily limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,0) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'zero global concurrency limit denies a fresh reservation') from reserved cross join released;
reset role;
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local role authenticated;
with reserved as materialized (select public.sanad_reserve_request(100000,100000,100000,-1) lease),
     released as (select public.sanad_release_request(lease) from reserved)
select ok(reserved.lease is null, 'negative global concurrency limit denies a fresh reservation') from reserved cross join released;
reset role;
select is((select count(*) from dars_private.sandak_user_daily_usage)
  + (select count(*) from dars_private.sandak_global_daily_usage), 0::bigint, 'invalid limits create no usage rows');
select is((select count(*) from dars_private.sandak_request_leases), 0::bigint, 'invalid limits create no leases');

select * from finish();
rollback;
