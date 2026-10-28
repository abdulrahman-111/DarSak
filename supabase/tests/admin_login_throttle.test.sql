-- Admin login throttle (issue #106). Runs inside one rollback transaction.
create extension if not exists pgtap;
begin;
select plan(17);

select ok(to_regclass('dars_private.admin_login_attempts') is not null, 'attempts table exists');
select ok((select relrowsecurity from pg_class where oid = 'dars_private.admin_login_attempts'::regclass), 'attempts table has RLS enabled');
select ok(not has_table_privilege('anon', 'dars_private.admin_login_attempts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'dars_private.admin_login_attempts', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'dars_private.admin_login_attempts', 'SELECT,INSERT,UPDATE,DELETE'),
  'no client role can touch the attempts table directly');
select ok(has_function_privilege('anon', 'public.admin_login_allowed(text,text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.admin_login_record_failure(text,text)', 'EXECUTE'),
  'anon can call the throttle functions');
select ok(not has_function_privilege('anon', 'dars_private.admin_login_hashes(text,text)', 'EXECUTE'), 'hash helper is private');

set local role anon;

select ok(public.admin_login_allowed('Admin@Example.test', '203.0.113.7'), 'a fresh email and IP are allowed');
select lives_ok($$select public.admin_login_record_failure('admin@example.test', '203.0.113.7')$$, 'failure can be recorded');
select lives_ok($$select public.admin_login_record_failure('admin@example.test', '203.0.113.8')$$, 'second failure recorded');
select lives_ok($$select public.admin_login_record_failure(' ADMIN@example.test ', '203.0.113.9')$$, 'third failure recorded (case and whitespace normalised)');
select lives_ok($$select public.admin_login_record_failure('admin@example.test', '203.0.113.10')$$, 'fourth failure recorded');
select ok(public.admin_login_allowed('admin@example.test', '203.0.113.50'), 'four failures do not block the email');
select lives_ok($$select public.admin_login_record_failure('admin@example.test', '203.0.113.11')$$, 'fifth failure recorded');
select ok(not public.admin_login_allowed('admin@example.test', '203.0.113.50'), 'five failures block the email from any IP');
select ok(public.admin_login_allowed('other@example.test', '203.0.113.50'), 'another email is unaffected');

-- Per-IP bucket: 20 failures across distinct emails block that IP.
do $$
begin
  for i in 1..20 loop
    perform public.admin_login_record_failure('user' || i || '@example.test', '198.51.100.1');
  end loop;
end $$;
select ok(not public.admin_login_allowed('fresh@example.test', '198.51.100.1'), 'twenty failures block the IP for any email');

-- Old failures expire after 15 minutes.
reset role;
update dars_private.admin_login_attempts set attempted_at = now() - interval '16 minutes';
set local role anon;
select ok(public.admin_login_allowed('admin@example.test', '198.51.100.1'), 'failures older than 15 minutes no longer block');

select throws_ok($$select public.admin_login_allowed('not-an-email', '203.0.113.7')$$, '22023', null, 'malformed email is rejected');

reset role;
select * from finish();
rollback;
