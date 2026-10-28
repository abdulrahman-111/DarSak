-- lesson_reminders: preference RPCs, idempotent enqueue windows, cancellation/reschedule
-- invalidation, and claim-time staleness re-validation. All times are relative to now().
create extension if not exists pgtap;
begin;
select plan(28);

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('99400000-0000-4000-8000-000000000001','authenticated','authenticated','lr-teacher@example.test','','{}','{"requested_role":"teacher","full_name":"LR teacher"}',now(),now()),
 ('99400000-0000-4000-8000-000000000002','authenticated','authenticated','lr-s1@example.test','','{}','{"requested_role":"student","full_name":"LR student default"}',now(),now()),
 ('99400000-0000-4000-8000-000000000003','authenticated','authenticated','lr-s2@example.test','','{}','{"requested_role":"student","full_name":"LR student off"}',now(),now()),
 ('99400000-0000-4000-8000-000000000004','authenticated','authenticated','lr-s3@example.test','','{}','{"requested_role":"student","full_name":"LR student both"}',now(),now()),
 ('99400000-0000-4000-8000-000000000005','authenticated','authenticated','lr-s4@example.test','','{}','{"requested_role":"student","full_name":"LR student pending"}',now(),now());
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='99400000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('99440000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001','رياضيات','LR math','99440000-0000-4000-8000-000000000001');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('99450000-0000-4000-8000-000000000001','student_category','الصف الأول','LR grade','99450000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('99460000-0000-4000-8000-000000000001','99450000-0000-4000-8000-000000000001','99440000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001');
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status) values
 ('99410000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000001','99460000-0000-4000-8000-000000000001','LR group','',10,'Room','published');
insert into public.enrollments(id,group_id,student_id,status) values
 ('99430000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000002','accepted'),
 ('99430000-0000-4000-8000-000000000002','99410000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000003','accepted'),
 ('99430000-0000-4000-8000-000000000003','99410000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000004','accepted'),
 ('99430000-0000-4000-8000-000000000004','99410000-0000-4000-8000-000000000001','99400000-0000-4000-8000-000000000005','pending');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('99420000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000001','L1 in 20h',now()+interval '20 hours',now()+interval '21 hours','scheduled'),
 ('99420000-0000-4000-8000-000000000002','99410000-0000-4000-8000-000000000001','L2 in 50m',now()+interval '50 minutes',now()+interval '110 minutes','scheduled'),
 ('99420000-0000-4000-8000-000000000003','99410000-0000-4000-8000-000000000001','L3 cancelled',now()+interval '20 hours',now()+interval '21 hours','cancelled'),
 ('99420000-0000-4000-8000-000000000004','99410000-0000-4000-8000-000000000001','L4 in 30h',now()+interval '30 hours',now()+interval '31 hours','scheduled'),
 ('99420000-0000-4000-8000-000000000005','99410000-0000-4000-8000-000000000001','L5 in 90m',now()+interval '90 minutes',now()+interval '150 minutes','scheduled');
set local session_replication_role=origin;

-- Keep the contract test independent of other jobs in the outbox.
update dars_private.email_outbox set next_attempt_at='infinity' where state='queued';

-- preference RPCs
select ok(has_function_privilege('authenticated','public.set_lesson_reminder_preference(text)','EXECUTE')
  and not has_function_privilege('anon','public.set_lesson_reminder_preference(text)','EXECUTE'),'only signed-in users can set the preference');
select ok(not has_function_privilege('authenticated','public.enqueue_lesson_reminders(integer)','EXECUTE')
  and not has_function_privilege('anon','public.enqueue_lesson_reminders(integer)','EXECUTE')
  and has_function_privilege('service_role','public.enqueue_lesson_reminders(integer)','EXECUTE'),'only the worker role can enqueue reminders');
select ok(not has_table_privilege('authenticated','public.user_notification_preferences','INSERT,UPDATE,DELETE'),'preferences are written only through the RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000002',true);
select is(public.get_lesson_reminder_preference(),'24h','default preference is 24h');
select throws_ok($$select public.set_lesson_reminder_preference('weekly')$$,'22023',null,'invalid preference is rejected');
select lives_ok($$select public.set_lesson_reminder_preference('24h')$$,'valid preference is stored');
select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000003',true);
select public.set_lesson_reminder_preference('off');
select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000004',true);
select public.set_lesson_reminder_preference('both');
select is((select count(*)::int from public.user_notification_preferences),1,'RLS lets a user read only their own preference row');
select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000003',true);
select is(public.get_lesson_reminder_preference(),'off','stored preference is returned');
reset role;

-- enqueue
select is(public.enqueue_lesson_reminders(),4,'enqueues 3 24h reminders for L1 and 1 1h reminder for L2');
select is((select array_agg(event_key order by event_key) from dars_private.email_outbox where kind='lesson_reminder'),
  array[
   'lesson-reminder:99420000-0000-4000-8000-000000000001:99400000-0000-4000-8000-000000000001:24h',
   'lesson-reminder:99420000-0000-4000-8000-000000000001:99400000-0000-4000-8000-000000000002:24h',
   'lesson-reminder:99420000-0000-4000-8000-000000000001:99400000-0000-4000-8000-000000000004:24h',
   'lesson-reminder:99420000-0000-4000-8000-000000000002:99400000-0000-4000-8000-000000000004:1h'],
  'recipients follow preference, enrollment status and window');
select is(public.enqueue_lesson_reminders(),0,'a second run is idempotent');
select is((select count(*)::int from dars_private.email_outbox where kind='lesson_reminder' and payload->>'lesson_id' in
  ('99420000-0000-4000-8000-000000000003','99420000-0000-4000-8000-000000000004','99420000-0000-4000-8000-000000000005')),0,
  'no reminders for a cancelled lesson, a lesson outside the windows or one with under 2h notice');

-- claim: a valid student reminder is delivered
update dars_private.email_outbox set next_attempt_at=now() where kind='lesson_reminder';
select is((select jsonb_array_length(public.claim_email_jobs(5)->'jobs')),4,'students and teachers receive valid reminders at claim');
update dars_private.email_outbox set state='queued',attempts=0,lease_token=null,lease_expires_at=null,next_attempt_at='infinity' where kind='lesson_reminder';

-- reschedule invalidation: L2 moves to 3h away
update public.lessons set starts_at=now()+interval '3 hours',ends_at=now()+interval '4 hours' where id='99420000-0000-4000-8000-000000000002';
select is((select count(*)::int from dars_private.email_outbox where kind='lesson_reminder' and payload->>'lesson_id'='99420000-0000-4000-8000-000000000002'),0,'rescheduling drops the queued reminder');
select is(public.enqueue_lesson_reminders(),3,'the rescheduled lesson is re-queued for the new time (24h window, 3 recipients)');
select is((select count(distinct payload->>'starts_at')::int from dars_private.email_outbox where kind='lesson_reminder' and payload->>'lesson_id'='99420000-0000-4000-8000-000000000002'),1,'re-queued reminders carry the new start time');

-- cancel invalidation
update public.lessons set status='cancelled' where id='99420000-0000-4000-8000-000000000001';
select is((select count(*)::int from dars_private.email_outbox where kind='lesson_reminder' and state='queued' and payload->>'lesson_id'='99420000-0000-4000-8000-000000000001'),0,'cancelling drops queued reminders');
select is(public.enqueue_lesson_reminders(),0,'a cancelled lesson is never re-queued');

-- claim-time staleness: bypass the invalidation trigger to prove the claim re-check on its own
update dars_private.email_outbox set next_attempt_at=now() where kind='lesson_reminder';
set local session_replication_role=replica;
update public.lessons set starts_at=now()+interval '5 hours',ends_at=now()+interval '6 hours' where id='99420000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
select is((select jsonb_array_length(public.claim_email_jobs(5)->'jobs')),0,'moved lesson: stale reminders are not handed to the sender');
select is((select count(*)::int from dars_private.email_outbox where kind='lesson_reminder' and state='skipped' and safe_error_code='stale_event'),3,'stale reminders are skipped with stale_event');

-- stale because the preference changed, enrollment removed, or lesson cancelled without the trigger
update public.lessons set starts_at=now()+interval '10 hours',ends_at=now()+interval '11 hours' where id='99420000-0000-4000-8000-000000000004';
select is(public.enqueue_lesson_reminders(),3,'L4 enters the 24h window');
update dars_private.email_outbox set next_attempt_at=now() where kind='lesson_reminder' and state='queued';
set local role authenticated;
select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000002',true);
select public.set_lesson_reminder_preference('1h');
reset role;
update public.enrollments set status='removed' where id='99430000-0000-4000-8000-000000000003';
select is((select jsonb_array_length(public.claim_email_jobs(5)->'jobs')),1,'only the teacher reminder survives preference change and removed enrollment');
select is((select count(*)::int from dars_private.email_outbox where kind='lesson_reminder' and state='skipped' and safe_error_code='stale_event'),5,'preference change and removal are caught at claim');

-- claim: lesson started or cancelled after queueing
insert into dars_private.email_outbox(event_key,kind,recipient_user_id,payload) values
 ('lesson-reminder:test-past','lesson_reminder','99400000-0000-4000-8000-000000000001',
  jsonb_build_object('lesson_id','99420000-0000-4000-8000-000000000005','starts_at',(select starts_at from public.lessons where id='99420000-0000-4000-8000-000000000005'),'offset','24h','role','teacher'));
set local session_replication_role=replica;
update public.lessons set starts_at=now()-interval '1 minute',ends_at=now()+interval '30 minutes' where id='99420000-0000-4000-8000-000000000005';
set local session_replication_role=origin;
select is((select jsonb_array_length(public.claim_email_jobs(5)->'jobs')),0,'a reminder is never sent after the lesson started');

select ok(exists(select 1 from pg_constraint where conname='email_outbox_kind_check' and pg_get_constraintdef(oid) like '%lesson_reminder%'),'outbox accepts lesson_reminder');
select ok(not exists(select 1 from pg_publication where pubname='supabase_realtime')
  or exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications'),'user_notifications is published for Realtime when the publication exists');
select ok(not has_table_privilege('anon','public.user_notifications','SELECT'),'anon cannot read notifications');
select ok((select relrowsecurity from pg_class where oid='public.user_notification_preferences'::regclass),'preferences have RLS enabled');
select * from finish();
rollback;
