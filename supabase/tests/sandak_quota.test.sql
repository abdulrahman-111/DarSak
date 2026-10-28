-- Run with `supabase test db` after migration. Contract checks only: they do not
-- reserve requests or modify quota data. Behaviour is covered by tests/database/sandak_quota.sql.
create extension if not exists pgtap;
begin;
select plan(9);
select has_function('public','sanad_reserve_request',array['integer','integer','integer','integer'], 'reserve RPC exists');
select has_function('public','sanad_release_request',array['uuid'], 'release RPC exists');
select ok(not has_function_privilege('anon','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE'), 'anon cannot reserve');
select ok(has_function_privilege('authenticated','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE'), 'authenticated can reserve');
select ok(not has_function_privilege('anon','public.sanad_release_request(uuid)','EXECUTE'), 'anon cannot release');
select ok(not has_table_privilege('authenticated','dars_private.sandak_request_leases','SELECT,INSERT,UPDATE,DELETE'), 'leases are not directly accessible');
select ok(not has_table_privilege('authenticated','dars_private.sandak_settings','SELECT,INSERT,UPDATE,DELETE'), 'settings are not directly accessible');
select is((select user_daily_limit from dars_private.sandak_settings), 60, 'default per-user daily limit');
select is((select global_concurrency from dars_private.sandak_settings), 10, 'default global concurrency');
select * from finish();
rollback;
