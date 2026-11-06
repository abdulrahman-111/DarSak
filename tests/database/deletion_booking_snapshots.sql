\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a1600000-0000-4000-8000-000000000001','authenticated','authenticated','snapshot-student-delete@test.invalid','{"full_name":"Shared Name","requested_role":"student"}'),
 ('a1600000-0000-4000-8000-000000000002','authenticated','authenticated','snapshot-student-keep@test.invalid','{"full_name":"Shared Name","requested_role":"student"}'),
 ('a1600000-0000-4000-8000-000000000003','authenticated','authenticated','snapshot-teacher-delete@test.invalid','{"full_name":"Deleting Teacher","requested_role":"teacher"}'),
 ('a1600000-0000-4000-8000-000000000004','authenticated','authenticated','snapshot-teacher-keep@test.invalid','{"full_name":"Unrelated Teacher","requested_role":"teacher"}'),
 ('a1600000-0000-4000-8000-000000000005','authenticated','authenticated','snapshot-student-empty@test.invalid','{"full_name":"Empty Booking Student","requested_role":"student"}');

set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in (
 'a1600000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000004'
);
set local session_replication_role=origin;

insert into public.education_nodes(id,kind,name_ar,name_en,slug) values
 ('a1610000-0000-4000-8000-000000000001','system','نظام الحجز','Booking system','deletion-booking-system');
insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug) values
 ('a1610000-0000-4000-8000-000000000002','a1610000-0000-4000-8000-000000000001','level','مرحلة الحجز','Booking level','deletion-booking-level');
insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug) values
 ('a1610000-0000-4000-8000-000000000003','a1610000-0000-4000-8000-000000000002','grade','صف الحجز','Booking grade','deletion-booking-grade');
insert into public.subjects(id,name_ar,name_en,slug) values
 ('a1620000-0000-4000-8000-000000000001','مادة الحجز','Booking subject','deletion-booking-subject');
insert into public.offerings(id,node_id,subject_id) values
 ('a1630000-0000-4000-8000-000000000001','a1610000-0000-4000-8000-000000000003','a1620000-0000-4000-8000-000000000001');
insert into public.teacher_specializations(teacher_id,offering_id) values
 ('a1600000-0000-4000-8000-000000000003','a1630000-0000-4000-8000-000000000001'),
 ('a1600000-0000-4000-8000-000000000004','a1630000-0000-4000-8000-000000000001');
insert into public.groups(id,teacher_id,offering_id,name,capacity,status) values
 ('a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003','a1630000-0000-4000-8000-000000000001','Deleting teacher group',10,'draft'),
 ('a1640000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000004','a1630000-0000-4000-8000-000000000001','Unrelated teacher group',10,'draft');
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values
 ('a1640000-0000-4000-8000-000000000001',1,'08:00','09:00'),
 ('a1640000-0000-4000-8000-000000000002',2,'08:00','09:00');
update public.groups set status='published' where id in (
 'a1640000-0000-4000-8000-000000000001','a1640000-0000-4000-8000-000000000002'
);
insert into public.enrollments(id,group_id,student_id,status) values
 ('a1670000-0000-4000-8000-000000000001','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','accepted'),
 ('a1670000-0000-4000-8000-000000000002','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000002','accepted');

insert into public.booking_slots(id,group_id,teacher_id,starts_at,ends_at,status,source,proposed_by) values
 ('a1650000-0000-4000-8000-000000000001','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '5 days',now()+interval '5 days 1 hour','open','teacher_published',null),
 ('a1650000-0000-4000-8000-000000000002','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '6 days',now()+interval '6 days 1 hour','open','teacher_published',null),
 ('a1650000-0000-4000-8000-000000000003','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '7 days',now()+interval '7 days 1 hour','open','teacher_published',null),
 ('a1650000-0000-4000-8000-000000000004','a1640000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000004',now()+interval '8 days',now()+interval '8 days 1 hour','open','teacher_published',null),
 ('a1650000-0000-4000-8000-000000000005','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '9 days',now()+interval '9 days 1 hour','open','student_proposed','a1600000-0000-4000-8000-000000000001'),
 ('a1650000-0000-4000-8000-000000000006','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '10 days',now()+interval '10 days 1 hour','open','teacher_published',null);

-- Seed other students' pending requests through the fixture trigger. The
-- affected user's request and proposal below use their normal public RPCs.
insert into public.booking_requests(id,slot_id,student_id,status) values
 ('a1660000-0000-4000-8000-000000000002','a1650000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000002','pending'),
 ('a1660000-0000-4000-8000-000000000003','a1650000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000002','pending'),
 ('a1660000-0000-4000-8000-000000000004','a1650000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000002','pending'),
 ('a1660000-0000-4000-8000-000000000006','a1650000-0000-4000-8000-000000000006','a1600000-0000-4000-8000-000000000002','pending');

set local role authenticated;
set local request.jwt.claim.sub='a1600000-0000-4000-8000-000000000001';
select set_config('test.student_request_id',
  public.request_booking('a1650000-0000-4000-8000-000000000001')::text,true);
select set_config('test.student_proposal_request_id',
  public.propose_booking_time('a1640000-0000-4000-8000-000000000001',
    now()+interval '9 days',now()+interval '9 days 1 hour')::text,true);
select set_config('test.student_proposal_slot_id',
  (select slot_id::text from public.booking_requests
   where id=current_setting('test.student_proposal_request_id')::uuid),true);
reset role;

-- Exercise ordinary status updates and cancellation entry points before the
-- two deletion preparations. Their snapshots must be removed for the
-- deleting student/teacher while unrelated booking alerts remain.
set local role authenticated;
set local request.jwt.claim.sub='a1600000-0000-4000-8000-000000000003';
select public.decide_booking('a1660000-0000-4000-8000-000000000002',true);
select public.decide_booking('a1660000-0000-4000-8000-000000000006',false);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='a1600000-0000-4000-8000-000000000002';
select public.cancel_my_booking('a1660000-0000-4000-8000-000000000002');
select public.cancel_my_booking('a1660000-0000-4000-8000-000000000003');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='a1600000-0000-4000-8000-000000000004';
select public.cancel_booking_slot('a1650000-0000-4000-8000-000000000004');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='a1600000-0000-4000-8000-000000000001';
select public.cancel_enrollment('a1670000-0000-4000-8000-000000000001');
reset role;
do $$ begin
 if (select status from public.booking_requests where id=current_setting('test.student_request_id')::uuid)<>'cancelled'
    or (select status from public.booking_requests where id=current_setting('test.student_proposal_request_id')::uuid)<>'cancelled' then
   raise exception 'accepted-membership cancellation did not cancel the student bookings';
 end if;
 if (select status from public.booking_requests where id='a1660000-0000-4000-8000-000000000002')<>'cancelled'
    or (select status from public.booking_requests where id='a1660000-0000-4000-8000-000000000003')<>'withdrawn'
    or (select status from public.booking_requests where id='a1660000-0000-4000-8000-000000000004')<>'cancelled' then
   raise exception 'student or teacher booking cancellation did not update its request';
 end if;
end $$;

insert into public.user_notifications(recipient_id,kind,event_key,payload) values
 ('a1600000-0000-4000-8000-000000000002','booking_updated','snapshot:accepted','{"booking_id":"a1660000-0000-4000-8000-000000000002","student_name":"Shared Name","status":"accepted"}'),
 ('a1600000-0000-4000-8000-000000000002','booking_updated','snapshot:cancelled','{"booking_id":"a1660000-0000-4000-8000-000000000003","student_name":"Shared Name","status":"cancelled"}'),
 ('a1600000-0000-4000-8000-000000000004','lesson_rescheduled','snapshot:unrelated-name','{"student_name":"Shared Name","group_id":"a1640000-0000-4000-8000-000000000002"}'),
 ('a1600000-0000-4000-8000-000000000004','booking_updated','snapshot:malformed-id','{"booking_id":"not-a-uuid","student_name":"Shared Name"}');

set local role service_role;
select public.account_deletion_prepare('a1600000-0000-4000-8000-000000000001',null,null,'password');
reset role;

do $$ begin
 if exists(select 1 from public.user_notifications where payload->>'booking_id'='a1660000-0000-4000-8000-000000000001') then
   raise exception 'student deletion left its pending booking snapshot with the surviving teacher';
 end if;
 if exists(select 1 from public.user_notifications where payload->>'booking_id' in (
       current_setting('test.student_request_id'),current_setting('test.student_proposal_request_id')))
    or exists(select 1 from public.booking_requests where id in (
       current_setting('test.student_request_id')::uuid,
       current_setting('test.student_proposal_request_id')::uuid))
    or exists(select 1 from public.booking_slots where id=current_setting('test.student_proposal_slot_id')::uuid) then
   raise exception 'student deletion left its proposed booking or snapshot';
 end if;
 if not exists(select 1 from public.user_notifications where event_key='snapshot:accepted')
    or not exists(select 1 from public.user_notifications where event_key='snapshot:cancelled') then
   raise exception 'student deletion removed another same-name student''s booking history';
 end if;
 if not exists(select 1 from public.user_notifications where kind='booking_updated'
      and payload->>'booking_id'='a1660000-0000-4000-8000-000000000006') then
   raise exception 'student deletion removed a surviving request decision alert';
 end if;
 if not exists(select 1 from public.user_notifications where event_key='snapshot:unrelated-name')
    or not exists(select 1 from public.user_notifications where event_key='snapshot:malformed-id') then
   raise exception 'student deletion removed an unrelated or malformed-payload notification';
 end if;
 if not exists(select 1 from public.user_notifications where kind='booking_updated'
      and recipient_id='a1600000-0000-4000-8000-000000000004'
      and payload->>'booking_id'='a1660000-0000-4000-8000-000000000004') then
   raise exception 'student deletion removed an unrelated valid booking notification';
 end if;
 if not exists(select 1 from dars_private.account_deletion_requests where user_id='a1600000-0000-4000-8000-000000000001' and state='queued') then
   raise exception 'student deletion request history was not retained';
 end if;
end $$;

set local role service_role;
select public.account_deletion_prepare('a1600000-0000-4000-8000-000000000003',null,null,'password');
reset role;

do $$ begin
 if exists(select 1 from public.user_notifications where payload->>'booking_id' in (
      'a1660000-0000-4000-8000-000000000002','a1660000-0000-4000-8000-000000000003',
      'a1660000-0000-4000-8000-000000000006')) then
   raise exception 'teacher deletion left booking snapshots for its surviving student';
 end if;
 if not exists(select 1 from public.user_notifications where event_key='snapshot:unrelated-name')
    or not exists(select 1 from public.user_notifications where event_key='snapshot:malformed-id') then
   raise exception 'teacher deletion removed an unrelated or malformed-payload notification';
 end if;
 if not exists(select 1 from public.user_notifications where kind='booking_updated'
      and recipient_id='a1600000-0000-4000-8000-000000000004'
      and payload->>'booking_id'='a1660000-0000-4000-8000-000000000004') then
   raise exception 'teacher deletion removed an unrelated valid booking notification';
 end if;
 if (select count(*) from dars_private.account_deletion_requests where user_id in (
      'a1600000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003')) <> 2 then
   raise exception 'deletion request history was not preserved for both owners';
 end if;
 if exists(select 1 from public.profiles where id in (
      'a1600000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003')) then
   raise exception 'canonical prepare did not delete the requested profiles';
 end if;
end $$;

-- Empty booking history remains valid, and the existing queued request is
-- returned on retry without creating another request.
set local role service_role;
select set_config('test.empty_deletion_request_id',
  public.account_deletion_prepare('a1600000-0000-4000-8000-000000000005',null,null,'password')->>'request_id',true);
reset role;
set local role service_role;
select set_config('test.empty_deletion_retry_id',
  public.account_deletion_prepare('a1600000-0000-4000-8000-000000000005',null,null,'password')->>'request_id',true);
reset role;
do $$ begin
 if current_setting('test.empty_deletion_request_id')::uuid
      is distinct from current_setting('test.empty_deletion_retry_id')::uuid then
   raise exception 'empty-booking deletion retry created another request';
 end if;
 if (select count(*) from dars_private.account_deletion_requests where user_id='a1600000-0000-4000-8000-000000000005')<>1 then
   raise exception 'empty-booking deletion did not preserve one request';
 end if;
end $$;

rollback;
select 'booking snapshot deletion SQL assertions passed' as result;
