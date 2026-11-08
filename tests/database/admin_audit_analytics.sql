\set ON_ERROR_STOP on
begin;

do $$ begin
  if not has_function_privilege('authenticated','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE')
     or has_function_privilege('anon','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE')
     or has_function_privilege('service_role','public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.admin_analytics_summary(integer)','EXECUTE')
     or has_function_privilege('anon','public.admin_analytics_summary(integer)','EXECUTE')
     or has_function_privilege('service_role','public.admin_analytics_summary(integer)','EXECUTE') then
    raise exception 'admin audit and analytics RPC grants are unsafe';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='dars_private' and indexname='audit_log_at_id_desc')
     or not exists(select 1 from pg_indexes where schemaname='dars_private' and indexname='audit_log_target_at_id_desc') then
    raise exception 'audit page indexes are missing';
  end if;
end $$;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmed_at) values
 ('14920000-0000-4000-8000-000000000001','authenticated','authenticated','audit-it-admin@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Integration Admin"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000002','authenticated','authenticated','audit-it-suspended@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Integration Suspended"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000003','authenticated','authenticated','audit-it-teacher@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Integration Teacher"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000004','authenticated','authenticated','audit-it-student@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Integration Student"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000005','authenticated','authenticated','audit-it-teacher-declined@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Integration Declined"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000006','authenticated','authenticated','audit-it-teacher-pending@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Integration Pending"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000007','authenticated','authenticated','audit-it-teacher-outside@test.invalid','','{}','{"requested_role":"teacher","full_name":"Audit Integration Outside"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000008','authenticated','authenticated','audit-it-student-accepted@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Integration Accepted"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000009','authenticated','authenticated','audit-it-student-rejected@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Integration Rejected"}',now(),now(),now()),
 ('14920000-0000-4000-8000-000000000010','authenticated','authenticated','audit-it-student-pending@test.invalid','','{}','{"requested_role":"student","full_name":"Audit Integration Pending Student"}',now(),now(),now());
set local session_replication_role=replica;
update public.profiles set role='admin' where id in ('14920000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000002');
update public.profiles set status='suspended' where id='14920000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
insert into public.education_nodes(id,kind,name_ar,name_en,slug) values
 ('14921000-0000-4000-8000-000000000001','system','نظام','Audit DB System','audit-db-test-system'),
 ('14921000-0000-4000-8000-000000000002','level','مرحلة','Audit DB Level','audit-db-test-level'),
 ('14921000-0000-4000-8000-000000000003','grade','صف','Audit DB Grade','audit-db-test-grade');
update public.education_nodes set parent_id='14921000-0000-4000-8000-000000000001' where id='14921000-0000-4000-8000-000000000002';
update public.education_nodes set parent_id='14921000-0000-4000-8000-000000000002' where id='14921000-0000-4000-8000-000000000003';
insert into public.subjects(id,name_ar,name_en,slug) values ('14922000-0000-4000-8000-000000000001','مادة','Audit DB Subject','audit-db-test-subject');
insert into public.offerings(id,node_id,subject_id) values ('14923000-0000-4000-8000-000000000001','14921000-0000-4000-8000-000000000003','14922000-0000-4000-8000-000000000001');
-- Owner-seeded fixture only; use replica for unrelated group-write guards.
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status) values
 ('14924000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000003','14923000-0000-4000-8000-000000000001','Audit DB Enrollment Group',10,'draft');
set local session_replication_role=origin;

insert into dars_private.audit_log(at,actor_role,action,target_type,target_id,metadata) values
 ('2026-11-07 12:00:00.123456+00','system','user_suspended','user','14920000-0000-4000-8000-000000000004','{"status":"suspended"}'),
 ('2026-11-07 12:00:00.123456+00','system','user_suspended','user','14920000-0000-4000-8000-000000000004','{"status":"suspended"}'),
 ('2026-11-07 12:00:00.123457+00','system','user_suspended','user','14920000-0000-4000-8000-000000000004','{"status":"suspended"}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14920000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14920000-0000-4000-8000-000000000001',true);
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
update public.teacher_profiles set approved=true where id='14920000-0000-4000-8000-000000000003';
update public.groups set status='published',created_at=statement_timestamp()-interval '90 days' where id='14924000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.waitlist_entries(group_id,student_id,status,created_at)
values('14924000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000008','waiting',statement_timestamp()-interval '90 days');
-- Owner-seeded fixture consent allows the actual submission guard to run; this
-- setup does not test or bypass the public teacher-rules acceptance producer.
insert into public.teacher_rules_acceptances(teacher_id,policy_version,accepted_at)
values('14920000-0000-4000-8000-000000000006','2026-10-18',statement_timestamp()-interval '4 days');
update public.teacher_applications set status='approved',submitted_at=statement_timestamp()-interval '1 day',reviewed_at=statement_timestamp()-interval '1 day'+interval '1 hour' where teacher_id='14920000-0000-4000-8000-000000000003';
update public.teacher_applications set status='declined',submitted_at=statement_timestamp()-interval '2 days',reviewed_at=statement_timestamp()-interval '2 days'+interval '2 hours' where teacher_id='14920000-0000-4000-8000-000000000005';
update public.teacher_applications set status='submitted',submitted_at=statement_timestamp()-interval '3 days',reviewed_at=null where teacher_id='14920000-0000-4000-8000-000000000006';
update public.teacher_applications set status='approved',submitted_at=statement_timestamp()-interval '8 days',reviewed_at=statement_timestamp()-interval '8 days'+interval '1 hour' where teacher_id='14920000-0000-4000-8000-000000000007';
insert into public.enrollments(group_id,student_id,status,created_at) values
 ('14924000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000008','accepted',statement_timestamp()-interval '1 day'),
 ('14924000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000009','rejected',statement_timestamp()-interval '2 days'),
 ('14924000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000010','pending',statement_timestamp()-interval '3 days'),
 ('14924000-0000-4000-8000-000000000001','14920000-0000-4000-8000-000000000004','accepted',statement_timestamp()-interval '8 days');
insert into dars_private.sandak_global_daily_usage(utc_day,accepted_requests)
values ((current_setting('test.sandak_utc_today')::date-7),1), ((current_setting('test.sandak_utc_today')::date-8),1), (current_setting('test.sandak_utc_today')::date,1)
on conflict(utc_day) do update set accepted_requests=dars_private.sandak_global_daily_usage.accepted_requests+excluded.accepted_requests;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"14920000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14920000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb; begin
  r:=public.admin_audit_page(p_target_id=>'14920000-0000-4000-8000-000000000004',p_limit=>1);
  if (r->>'total')::integer<>3 or jsonb_array_length(r->'rows')<>1 or r->'next_cursor' is null then
    raise exception 'admin audit first page contract failed: %',r;
  end if;
  if jsonb_typeof(r->'rows'->0->'id')<>'string' or (r->'rows'->0->>'id') !~ '^[1-9][0-9]*$' then
    raise exception 'bigint audit id was not transported as decimal text';
  end if;
  if jsonb_array_length(public.admin_audit_page(p_target_id=>'14920000-0000-4000-8000-000000000004',p_to=>'2026-11-07 12:00:00.123457+00')->'rows')<>2 then
    raise exception 'audit to cutoff is not exclusive';
  end if;
  r:=public.admin_analytics_summary(7);
  if jsonb_array_length(r->'metrics')<>23 then raise exception 'analytics metric count changed'; end if;
  if exists(select 1 from jsonb_array_elements(r->'metrics') m where (select array_agg(field order by field) from jsonb_object_keys(m) as keys(field))<>array['key','reason','status','unit','value']::text[]) then
    raise exception 'analytics metric fields changed';
  end if;
  if (select count(*) from jsonb_array_elements(r->'metrics') m where m->>'key' in ('sandak_quota_hits','sandak_errors','push_delivery') and m->'value'='null'::jsonb and m->>'status'='unavailable')<>3 then
    raise exception 'unavailable producer metrics were presented as numeric values';
  end if;
  if (select (m->>'value')::bigint from jsonb_array_elements(r->'metrics') m where m->>'key'='teacher_app_submitted')<>current_setting('test.app_submitted_before')::bigint+3 then
    raise exception 'application cohort count did not include exactly the three in-window latest submissions';
  end if;
  if (select (m->>'value')::bigint from jsonb_array_elements(r->'metrics') m where m->>'key'='teacher_app_approved')<>current_setting('test.app_approved_before')::bigint+1 then
    raise exception 'application approved count did not use current status';
  end if;
  if (select (m->>'value')::numeric from jsonb_array_elements(r->'metrics') m where m->>'key'='teacher_app_approval_rate')<>round(100.0*(current_setting('test.app_approved_before')::numeric+1)/(current_setting('test.app_submitted_before')::numeric+3),2) then
    raise exception 'application approval rate used the wrong cohort or denominator';
  end if;
  if (select (m->>'value')::numeric from jsonb_array_elements(r->'metrics') m where m->>'key'='teacher_app_median_hours') is distinct from
     (select round(percentile_cont(0.5) within group(order by extract(epoch from reviewed_at-submitted_at)/3600)::numeric,2) from public.teacher_applications where submitted_at>=statement_timestamp()-interval '7 days' and submitted_at<statement_timestamp() and status='approved' and reviewed_at is not null and reviewed_at>=submitted_at) then
    raise exception 'application median does not use approved reviewed_at - submitted_at values for the submission cohort';
  end if;
  if current_setting('test.app_median_before')='none' and (select (m->>'value')::numeric from jsonb_array_elements(r->'metrics') m where m->>'key'='teacher_app_median_hours')<>1::numeric then
    raise exception 'a two-hour decline affected the one-hour approved median';
  end if;
  if (select (m->>'value')::numeric from jsonb_array_elements(r->'metrics') m where m->>'key'='enrollment_acceptance_rate')<>round(100.0*(current_setting('test.enrollment_accepted_before')::numeric+1)/(current_setting('test.enrollment_decided_before')::numeric+2),2) then
    raise exception 'enrollment acceptance rate did not exclude pending or out-of-window rows';
  end if;
  if current_setting('test.enrollment_decided_before')::bigint=0 and current_setting('test.enrollment_accepted_before')::bigint=0
     and (select (m->>'value')::numeric from jsonb_array_elements(r->'metrics') m where m->>'key'='enrollment_acceptance_rate')<>50::numeric then
    raise exception 'one accepted and one rejected enrollment should produce 50 percent when the baseline is empty';
  end if;
  if (select (m->>'value')::bigint from jsonb_array_elements(r->'metrics') m where m->>'key'='published_groups')<>current_setting('test.published_before')::bigint+1 then
    raise exception 'published groups snapshot excluded the 90-day-old group';
  end if;
  if (select (m->>'value')::bigint from jsonb_array_elements(r->'metrics') m where m->>'key'='waitlist_size')<>current_setting('test.waitlist_before')::bigint+1 then
    raise exception 'waitlist snapshot excluded the 90-day-old waiting entry';
  end if;
  if (select (m->>'value')::bigint from jsonb_array_elements(r->'metrics') m where m->>'key'='sandak_requests')<>current_setting('test.sandak_before')::bigint+1 then
    raise exception 'Sandak completed-day range included the wrong UTC buckets';
  end if;
end $$;

select set_config('request.jwt.claims','{"sub":"14920000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$ begin
  begin perform public.admin_audit_page(); raise exception 'expected AAL1 denial';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"14920000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','14920000-0000-4000-8000-000000000002',true);
do $$ begin
  begin perform public.admin_audit_page(); raise exception 'expected suspended admin denial';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
