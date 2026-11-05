-- The database admin role is live profile state plus top-level verified AAL2.
-- These synthetic claims exercise only the Postgres authorization boundary;
-- they do not represent an Auth-issued factor verification.
create extension if not exists pgtap;
begin;
select plan(13);

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('155f0000-0000-4000-8000-000000000001','authenticated','authenticated','mfa-admin@example.test','','{}','{"requested_role":"student","full_name":"MFA admin"}',now(),now()),
 ('155f0000-0000-4000-8000-000000000002','authenticated','authenticated','mfa-teacher@example.test','','{}','{"requested_role":"teacher","full_name":"MFA teacher"}',now(),now()),
 ('155f0000-0000-4000-8000-000000000003','authenticated','authenticated','mfa-student@example.test','','{}','{"requested_role":"student","full_name":"MFA student"}',now(),now()),
 ('155f0000-0000-4000-8000-000000000004','authenticated','authenticated','mfa-suspended-admin@example.test','','{}','{"requested_role":"student","full_name":"MFA suspended admin"}',now(),now());

-- Fixture role/status is trusted setup state, not a user-facing role change.
set local session_replication_role=replica;
update public.profiles set role='admin' where id in (
  '155f0000-0000-4000-8000-000000000001',
  '155f0000-0000-4000-8000-000000000004'
);
update public.profiles set status='suspended' where id='155f0000-0000-4000-8000-000000000004';
set local session_replication_role=origin;

set local role authenticated;

-- Missing assurance is denied, while the admin can still read their own
-- profile at AAL1 to complete MFA enrollment or verification.
select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000001',true);
select is(public.current_role()::text,null::text,'active admin without top-level aal is not an admin');
select is((select count(*)::integer from public.profiles where id='155f0000-0000-4000-8000-000000000001'),1,'AAL1 admin retains own-profile read for MFA setup');
select is((select count(*)::integer from public.student_profiles where id='155f0000-0000-4000-8000-000000000003'),0,'AAL1 admin cannot read another user''s student profile');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is(public.current_role()::text,null::text,'active admin at aal1 is not an admin');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal3"}',true);
select is(public.current_role()::text,null::text,'only the exact aal2 value grants admin authority');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","user_metadata":{"role":"admin","aal":"aal2"},"app_metadata":{"role":"admin","aal":"aal2"}}',true);
select is(public.current_role()::text,null::text,'metadata assurance does not replace top-level aal2');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.current_role()::text,'admin','active stored admin at top-level aal2 receives admin role');
select is((select count(*)::integer from public.student_profiles where id='155f0000-0000-4000-8000-000000000003'),1,'AAL2 admin can use the direct student-profile admin policy');
select set_config('request.jwt.claims','{}',true);
select is(public.current_role()::text,null::text,'clearing claims removes the prior admin assurance');

-- Top-level assurance or forged role metadata cannot upgrade a non-admin.
select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1","user_metadata":{"role":"admin","aal":"aal2"},"app_metadata":{"role":"admin","aal":"aal2"}}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000002',true);
select is(public.current_role()::text,'teacher','active teacher role is unchanged at aal1 despite admin metadata');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000003',true);
select is(public.current_role()::text,'student','admin metadata does not change the active student role at aal1');
select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2","user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}',true);
select is(public.current_role()::text,'student','top-level aal2 does not upgrade an active student');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000004',true);
select is(public.current_role()::text,null::text,'suspended admin remains denied at aal2');

select set_config('request.jwt.claims','{}',true);
set local request.jwt.claims = '{}';
reset role;
select * from finish();
rollback;
