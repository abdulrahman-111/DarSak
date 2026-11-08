-- The database admin role is live profile state plus top-level verified AAL2.
-- These synthetic claims exercise only the Postgres authorization boundary;
-- they do not represent an Auth-issued factor verification.
create extension if not exists pgtap;
begin;
select plan(30);

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

-- Seed real pending access decisions for the existing teacher fixture. These
-- rows are exercised only through decide_teacher_access_request below.
insert into dars_private.teacher_access_requests(id,teacher_id) values
 ('155f0000-0000-4000-8000-000000000098','155f0000-0000-4000-8000-000000000002');

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
select is(
  public.can_upload_teacher_avatar(
    '155f0000-0000-4000-8000-000000000002/155f0000-0000-4000-8000-000000000099.png',
    '{"mimetype":"image/png"}'::jsonb
  ),
  false,
  'AAL1 admin cannot use the avatar upload admin helper'
);
select throws_ok(
  $$select public.teacher_review_status('155f0000-0000-4000-8000-000000000002')$$,
  'P0001', 'not authorized', 'AAL1 admin cannot read teacher review status'
);
select throws_ok(
  $$select public.admin_teacher_access_page(0,20)$$,
  '42501', 'active admin only', 'AAL1 admin cannot read teacher access page'
);
select throws_ok(
  $$select public.admin_email_page(0,20)$$,
  '42501', 'active admin only', 'AAL1 admin cannot read email outbox page'
);
select throws_ok(
  $$select public.admin_problem_report_page('all',0,20)$$,
  '42501', null, 'AAL1 admin cannot read problem report page'
);

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal3"}',true);
select is(public.current_role()::text,null::text,'only the exact aal2 value grants admin authority');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","user_metadata":{"role":"admin","aal":"aal2"},"app_metadata":{"role":"admin","aal":"aal2"}}',true);
select is(public.current_role()::text,null::text,'metadata assurance does not replace top-level aal2');

select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.current_role()::text,'admin','active stored admin at top-level aal2 receives admin role');
select is((select count(*)::integer from public.student_profiles where id='155f0000-0000-4000-8000-000000000003'),1,'AAL2 admin can use the direct student-profile admin policy');
select is(
  public.can_upload_teacher_avatar(
    '155f0000-0000-4000-8000-000000000002/155f0000-0000-4000-8000-000000000099.png',
    '{"mimetype":"image/png"}'::jsonb
  ),
  true,
  'AAL2 admin retains avatar upload oversight'
);
select is(
  public.teacher_review_status('155f0000-0000-4000-8000-000000000002')->>'teacher_id',
  '155f0000-0000-4000-8000-000000000002',
  'AAL2 admin can read an existing teacher review state'
);
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

-- The same guarded access decision is rejected at AAL1, then approved by the
-- active AAL2 admin. A successful retry must remain idempotent in the ledger.
select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.decide_teacher_access_request('155f0000-0000-4000-8000-000000000098',true)$$,
  '42501','active admin only','AAL1 admin cannot decide a teacher access request'
);
reset role;
select is((select count(*)::integer from dars_private.audit_log where target_type='teacher_access_request'
  and target_id='155f0000-0000-4000-8000-000000000098'),0,'failed AAL1 access decision writes no audit row');
select is((select status from dars_private.teacher_access_requests where id='155f0000-0000-4000-8000-000000000098'),
  'pending','failed AAL1 access decision leaves request pending');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.decide_teacher_access_request('155f0000-0000-4000-8000-000000000098',true)$$,
  'AAL2 admin approves the pending teacher access request');
select lives_ok($$select public.decide_teacher_access_request('155f0000-0000-4000-8000-000000000098',true)$$,
  'repeating the approved access decision is idempotent');
reset role;
select is((select count(*)::integer from dars_private.audit_log where action='teacher_access_approved'
  and target_type='teacher_access_request' and target_id='155f0000-0000-4000-8000-000000000098'),
  1,'approval and idempotent retry leave exactly one access audit row');
select ok(exists(select 1 from dars_private.audit_log where action='teacher_access_approved'
  and target_type='teacher_access_request' and target_id='155f0000-0000-4000-8000-000000000098'
  and actor_id='155f0000-0000-4000-8000-000000000001' and actor_role='admin'
  and request_id='155f0000-0000-4000-8000-000000000098' and metadata='{"status":"approved"}'::jsonb),
  'approval audit row records only the bounded status field and guarded admin actor');

-- Reuse the valid teacher with a second pending request for the decline path.
insert into dars_private.teacher_access_requests(id,teacher_id) values
 ('155f0000-0000-4000-8000-000000000099','155f0000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"155f0000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','155f0000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.decide_teacher_access_request('155f0000-0000-4000-8000-000000000099',false)$$,
  'AAL2 admin declines a second pending teacher access request');
reset role;
select is((select count(*)::integer from dars_private.audit_log where action='teacher_access_declined'
  and target_type='teacher_access_request' and target_id='155f0000-0000-4000-8000-000000000099'),
  1,'decline writes exactly one access audit row');
select ok(exists(select 1 from dars_private.audit_log where action='teacher_access_declined'
  and target_type='teacher_access_request' and target_id='155f0000-0000-4000-8000-000000000099'
  and actor_id='155f0000-0000-4000-8000-000000000001' and actor_role='admin'
  and request_id='155f0000-0000-4000-8000-000000000099' and metadata='{"status":"declined"}'::jsonb),
  'decline audit row records only the bounded status field and guarded admin actor');

select set_config('request.jwt.claims','{}',true);
set local request.jwt.claims = '{}';
reset role;
select * from finish();
rollback;
