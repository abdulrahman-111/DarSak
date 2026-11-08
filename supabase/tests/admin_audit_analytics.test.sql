-- Guarded, bounded admin reads and current-state metric contract.
create extension if not exists pgtap;
begin;
select plan(48);

select has_function('public','admin_audit_page',array[
  'uuid','text','uuid','text','timestamp with time zone','timestamp with time zone',
  'timestamp with time zone','bigint','timestamp with time zone','integer'
],'audit page RPC exists');
select has_function('public','admin_analytics_summary',array['integer'],'analytics RPC exists');
select ok(has_function_privilege('authenticated','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE'),'authenticated can call audit page');
select ok(not has_function_privilege('anon','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE'),'anon cannot call audit page');
select ok(not has_function_privilege('service_role','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE'),'service role cannot call audit page');
select ok(has_function_privilege('authenticated','public.admin_analytics_summary(integer)','EXECUTE'),'authenticated can call analytics');
select ok(not has_function_privilege('anon','public.admin_analytics_summary(integer)','EXECUTE'),'anon cannot call analytics');
select ok(not has_function_privilege('service_role','public.admin_analytics_summary(integer)','EXECUTE'),'service role cannot call analytics');
select has_index('dars_private','audit_log','audit_log_actor_at_id_desc','actor-filter audit index exists');
select has_index('dars_private','audit_log','audit_log_action_at_id_desc','action-filter audit index exists');
select has_index('public','groups','groups_published_snapshot_idx','published global snapshot index exists');
select has_index('public','waitlist_entries','waitlist_waiting_snapshot_idx','waiting global snapshot index exists');

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmed_at) values
 ('14910000-0000-4000-8000-000000000001','authenticated','authenticated','audit-admin@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Admin"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000002','authenticated','authenticated','audit-suspended@test.invalid','','{}','{"requested_role":"student","full_name":"Suspended Admin"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000003','authenticated','authenticated','audit-teacher@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Teacher"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000004','authenticated','authenticated','audit-student@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Student"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000005','authenticated','authenticated','audit-teacher-declined@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Declined Teacher"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000006','authenticated','authenticated','audit-teacher-pending@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Pending Teacher"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000007','authenticated','authenticated','audit-teacher-outside@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Outside Teacher"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000008','authenticated','authenticated','audit-student-accepted@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Accepted Student"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000009','authenticated','authenticated','audit-student-rejected@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Rejected Student"}',now(),now(),now()),
 ('14910000-0000-4000-8000-000000000010','authenticated','authenticated','audit-student-pending@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Pending Student"}',now(),now(),now());
set local session_replication_role=replica;
update public.profiles set role='admin' where id in ('14910000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000002');
update public.profiles set status='suspended' where id='14910000-0000-4000-8000-000000000002';
update public.profiles set created_at=statement_timestamp()-interval '2 days' where id in ('14910000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000003','14910000-0000-4000-8000-000000000004','14910000-0000-4000-8000-000000000005','14910000-0000-4000-8000-000000000006','14910000-0000-4000-8000-000000000007');
set local session_replication_role=origin;
insert into public.education_nodes(id,kind,name_ar,name_en,slug) values
 ('14911000-0000-4000-8000-000000000001','system','نظام','Audit System','audit-test-system'),
 ('14911000-0000-4000-8000-000000000002','level','مرحلة','Audit Level','audit-test-level'),
 ('14911000-0000-4000-8000-000000000003','grade','صف','Audit Grade','audit-test-grade');
update public.education_nodes set parent_id='14911000-0000-4000-8000-000000000001' where id='14911000-0000-4000-8000-000000000002';
update public.education_nodes set parent_id='14911000-0000-4000-8000-000000000002' where id='14911000-0000-4000-8000-000000000003';
insert into public.subjects(id,name_ar,name_en,slug) values ('14912000-0000-4000-8000-000000000001','مادة','Audit Subject','audit-test-subject');
insert into public.offerings(id,node_id,subject_id) values ('14913000-0000-4000-8000-000000000001','14911000-0000-4000-8000-000000000003','14912000-0000-4000-8000-000000000001');
-- Owner-seeded fixture only; use replica for the unrelated group-write guards.
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status) values
 ('14914000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000003','14913000-0000-4000-8000-000000000001','Audit Enrollment Group',10,'draft');
set local session_replication_role=origin;

-- Tie timestamps exercise the bigint id tiebreaker and wire-safe text IDs.
insert into dars_private.audit_log(at,actor_id,actor_role,action,target_type,target_id,metadata) values
 ('2026-11-07 12:00:00.123456+00','14910000-0000-4000-8000-000000000003','teacher','user_suspended','user','14910000-0000-4000-8000-000000000004','{"status":"suspended"}'),
 ('2026-11-07 12:00:00.123456+00','14910000-0000-4000-8000-000000000003','teacher','user_suspended','user','14910000-0000-4000-8000-000000000004','{"status":"suspended"}'),
 ('2026-11-07 12:00:00.123456+00','14910000-0000-4000-8000-000000000003','teacher','user_suspended','user','14910000-0000-4000-8000-000000000004','{"status":"suspended"}'),
 ('2026-11-07 12:00:00.123457+00','14910000-0000-4000-8000-000000000003','teacher','user_suspended','user','14910000-0000-4000-8000-000000000004','{"status":"suspended"}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14910000-0000-4000-8000-000000000001',true);
select set_config('test.app_submitted_before',coalesce((m->>'value'),'0'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_submitted';
select set_config('test.app_approved_before',coalesce((m->>'value'),'0'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_approved';
select set_config('test.app_median_before',coalesce((m->>'value'),'none'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_median_hours';
select set_config('test.enrollment_accepted_before',coalesce((m->>'value'),'0'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='enrollment_accepted';
select set_config('test.published_before',coalesce((m->>'value'),'0'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='published_groups';
select set_config('test.waitlist_before',coalesce((m->>'value'),'0'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='waitlist_size';
select set_config('test.enrollment_decided_before',(select count(*)::text from public.enrollments where created_at>=statement_timestamp()-interval '7 days' and created_at<statement_timestamp() and status<>'pending'),true);
select set_config('test.sandak_before',coalesce((m->>'value'),'0'),true) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='sandak_requests';
select set_config('test.sandak_utc_today',to_char((transaction_timestamp() at time zone 'UTC')::date,'YYYY-MM-DD'),true);
reset role;
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='14910000-0000-4000-8000-000000000003';
update public.groups set status='published',created_at=statement_timestamp()-interval '90 days' where id='14914000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.waitlist_entries(group_id,student_id,status,created_at)
values('14914000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000008','waiting',statement_timestamp()-interval '90 days');
-- Owner-seeded fixture consent allows the actual submission guard to run; this
-- setup does not test or bypass the public teacher-rules acceptance producer.
insert into public.teacher_rules_acceptances(teacher_id,policy_version,accepted_at)
values('14910000-0000-4000-8000-000000000006','2026-10-18',statement_timestamp()-interval '4 days');
update public.teacher_applications set status='approved',submitted_at=statement_timestamp()-interval '1 day',reviewed_at=statement_timestamp()-interval '1 day'+interval '1 hour' where teacher_id='14910000-0000-4000-8000-000000000003';
update public.teacher_applications set status='declined',submitted_at=statement_timestamp()-interval '2 days',reviewed_at=statement_timestamp()-interval '2 days'+interval '2 hours' where teacher_id='14910000-0000-4000-8000-000000000005';
update public.teacher_applications set status='submitted',submitted_at=statement_timestamp()-interval '3 days',reviewed_at=null where teacher_id='14910000-0000-4000-8000-000000000006';
update public.teacher_applications set status='approved',submitted_at=statement_timestamp()-interval '8 days',reviewed_at=statement_timestamp()-interval '8 days'+interval '1 hour' where teacher_id='14910000-0000-4000-8000-000000000007';
insert into dars_private.sandak_global_daily_usage(utc_day,accepted_requests)
values
  ((current_setting('test.sandak_utc_today')::date-7),1),
  ((current_setting('test.sandak_utc_today')::date-8),1),
  (current_setting('test.sandak_utc_today')::date,1)
on conflict(utc_day) do update set accepted_requests=dars_private.sandak_global_daily_usage.accepted_requests+excluded.accepted_requests;
insert into public.enrollments(group_id,student_id,status,created_at) values
 ('14914000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000008','accepted',statement_timestamp()-interval '1 day'),
 ('14914000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000009','rejected',statement_timestamp()-interval '2 days'),
 ('14914000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000010','pending',statement_timestamp()-interval '3 days'),
 ('14914000-0000-4000-8000-000000000001','14910000-0000-4000-8000-000000000004','accepted',statement_timestamp()-interval '8 days');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14910000-0000-4000-8000-000000000001',true);
select is((select (m->>'value')::bigint from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_submitted'),current_setting('test.app_submitted_before')::bigint+3,'application count includes approved, declined, and pending submissions in the window');
select is((select (m->>'value')::bigint from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_approved'),current_setting('test.app_approved_before')::bigint+1,'application approved count uses current status within the submission cohort');
select is((select (m->>'value')::numeric from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_approval_rate'),round(100.0*(current_setting('test.app_approved_before')::numeric+1)/(current_setting('test.app_submitted_before')::numeric+3),2),'application approval rate uses current approved count over latest in-window submissions');
select is((select (m->>'value')::numeric from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_median_hours'),
  (select round(percentile_cont(0.5) within group(order by extract(epoch from reviewed_at-submitted_at)/3600)::numeric,2) from public.teacher_applications where submitted_at>=statement_timestamp()-interval '7 days' and submitted_at<statement_timestamp() and status='approved' and reviewed_at is not null and reviewed_at>=submitted_at),
  'application median uses reviewed-minus-submitted hours for approved current applications only');
select ok(current_setting('test.app_median_before')<>'none' or (select (m->>'value')::numeric from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='teacher_app_median_hours')=1::numeric,'new one-hour approval remains one hour when no approved reviewed baseline exists despite a two-hour decline');
select is((select (m->>'value')::numeric from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='enrollment_acceptance_rate'),round(100.0*(current_setting('test.enrollment_accepted_before')::numeric+1)/(current_setting('test.enrollment_decided_before')::numeric+2),2),'enrollment acceptance rate excludes pending rows from the decided denominator and ignores outside-window rows');
select ok(current_setting('test.enrollment_decided_before')::bigint<>0 or current_setting('test.enrollment_accepted_before')::bigint<>0 or (select (m->>'value')::numeric from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='enrollment_acceptance_rate')=50::numeric,'one accepted and one rejected enrollment produce a 50 percent rate when baseline is empty; pending is ignored');
select is((select (m->>'value')::bigint from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='published_groups'),current_setting('test.published_before')::bigint+1,'published groups is a global current snapshot including a 90-day-old published group');
select is((select (m->>'value')::bigint from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='waitlist_size'),current_setting('test.waitlist_before')::bigint+1,'waitlist size is a global current snapshot including a 90-day-old waiting entry');
select is((select (m->>'value')::bigint from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key'='sandak_requests'),current_setting('test.sandak_before')::bigint+1,'Sandak metric adds the first included UTC day and excludes the preceding day and current day');
select is((public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2)->>'total')::integer,4,'count is independent of page size and includes matching rows');
select is(jsonb_array_length(public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2)->'rows'),2,'page returns the requested bounded row count');
select ok((public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2)->'next_cursor'->>'id') ~ '^[1-9][0-9]*$','next cursor preserves positive bigint as decimal text');
select ok((public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2)->'rows'->0->>'id')::numeric > (public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2)->'rows'->1->>'id')::numeric,'tied timestamps sort by descending id');
select is(jsonb_array_length(public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2,p_before_at=>'2026-11-07 12:00:00.123456+00',p_before_id=>((public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>2)->'next_cursor'->>'id')::bigint))->'rows'),2,'keyset page continues below the exact timestamp and id');
select is(jsonb_array_length(public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_to=>'2026-11-07 12:00:00.123457+00')->'rows'),3,'exclusive to cutoff excludes the row at the exact endpoint');
select is(jsonb_array_length(public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_snapshot_at=>'2026-11-07 12:00:00.123456+00')->'rows'),3,'fixed timestamp cutoff excludes later timestamp rows');
reset role;
insert into dars_private.audit_log(at,actor_role,action,target_type,target_id,metadata)
select '2026-11-07 11:00:00+00','system','user_suspended','user','14910000-0000-4000-8000-000000000004','{"status":"suspended"}'
from generate_series(1,50001);
set local role authenticated;
select is((public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>1)->>'total')::integer,50000,'count is capped at 50000');
select is((public.admin_audit_page(p_target_id=>'14910000-0000-4000-8000-000000000004',p_limit=>1)->>'total_capped')::boolean,true,'count reports when the cap was reached');
select throws_ok($$select public.admin_audit_page(p_limit=>0)$$,'22023',null,'zero limit is rejected');
select throws_ok($$select public.admin_audit_page(p_limit=>1001)$$,'22023',null,'limit above 1000 is rejected');
select throws_ok($$select public.admin_audit_page(p_before_at=>now())$$,'22023',null,'unpaired cursor is rejected');
select throws_ok($$select public.admin_audit_page(p_before_at=>now(),p_before_id=>0)$$,'22023',null,'nonpositive cursor id is rejected');
select throws_ok($$select public.admin_audit_page(p_from=>'infinity'::timestamptz)$$,'22023',null,'infinite timestamp is rejected');
select throws_ok($$select public.admin_audit_page(p_action=>'made_up_action')$$,'22023',null,'action whitelist is enforced');
select throws_ok($$select public.admin_audit_page(p_target_type=>'made_up_type')$$,'22023',null,'target type whitelist is enforced');
select throws_ok($$select public.admin_analytics_summary(14)$$,'22023',null,'only 7 or 30 day analytics windows are accepted');
select is(jsonb_array_length(public.admin_analytics_summary(7)->'metrics'),23,'analytics contract has exactly 23 metrics');
select is((select count(*)::integer from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where (select array_agg(field order by field) from jsonb_object_keys(m) as keys(field))=array['key','reason','status','unit','value']::text[]),23,'every metric has exactly the five fixed contract fields');
select is((select array_agg(m->>'key' order by n) from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') with ordinality as rows(m,n)),array[
  'registrations_students','registrations_teachers','registrations_admins','email_verification_rate',
  'teacher_app_submitted','teacher_app_approved','teacher_app_approval_rate','teacher_app_median_hours',
  'published_groups','enrollment_pending','enrollment_accepted','enrollment_acceptance_rate','waitlist_size',
  'lessons_scheduled','lessons_completed','lessons_cancelled','attendance_rate','sandak_requests',
  'sandak_quota_hits','sandak_errors','email_outbox_queued','email_outbox_failed','push_delivery'
]::text[],'analytics keys and ordering are fixed');
select is((select count(*)::integer from jsonb_array_elements(public.admin_analytics_summary(7)->'metrics') m where m->>'key' in ('sandak_quota_hits','sandak_errors','push_delivery') and m->>'status'='unavailable' and m->'value'='null'::jsonb),3,'unproduced AI and push metrics remain unavailable with null values');

select set_config('request.jwt.claims','{"sub":"14910000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select throws_ok($$select public.admin_audit_page()$$,'42501','not authorized','AAL1 admin is denied');
select set_config('request.jwt.claims','{"sub":"14910000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14910000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.admin_audit_page()$$,'42501','not authorized','suspended admin is denied');
select set_config('request.jwt.claims','{"sub":"14910000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14910000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.admin_audit_page()$$,'42501','not authorized','teacher is denied');
select set_config('request.jwt.claims','{"sub":"14910000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14910000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.admin_analytics_summary()$$,'42501','not authorized','student is denied');
reset role;
set local role anon;
select ok(not has_function_privilege('anon','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE'),'anonymous execution remains denied');
reset role;
select * from finish();
rollback;
