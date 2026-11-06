\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a1600000-0000-4000-8000-000000000001','authenticated','authenticated','snapshot-student-delete@test.invalid','{"full_name":"Shared Name","requested_role":"student"}'),
 ('a1600000-0000-4000-8000-000000000002','authenticated','authenticated','snapshot-student-keep@test.invalid','{"full_name":"Shared Name","requested_role":"student"}'),
 ('a1600000-0000-4000-8000-000000000003','authenticated','authenticated','snapshot-teacher-delete@test.invalid','{"full_name":"Deleting Teacher","requested_role":"teacher"}'),
 ('a1600000-0000-4000-8000-000000000004','authenticated','authenticated','snapshot-teacher-keep@test.invalid','{"full_name":"Unrelated Teacher","requested_role":"teacher"}');

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

insert into public.booking_slots(id,group_id,teacher_id,starts_at,ends_at,status,source) values
 ('a1650000-0000-4000-8000-000000000001','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '5 days',now()+interval '5 days 1 hour','open','teacher_published'),
 ('a1650000-0000-4000-8000-000000000002','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '6 days',now()+interval '6 days 1 hour','open','teacher_published'),
 ('a1650000-0000-4000-8000-000000000003','a1640000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000003',now()+interval '7 days',now()+interval '7 days 1 hour','open','teacher_published'),
 ('a1650000-0000-4000-8000-000000000004','a1640000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000004',now()+interval '8 days',now()+interval '8 days 1 hour','open','teacher_published');

-- Cover pending, accepted, and cancelled relationship snapshots. The pending
-- inserts use the canonical booking trigger; later-state notifications model
-- the corresponding decision/cancellation snapshots without sending mail.
insert into public.booking_requests(id,slot_id,student_id,status) values
 ('a1660000-0000-4000-8000-000000000001','a1650000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','pending'),
 ('a1660000-0000-4000-8000-000000000002','a1650000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000002','accepted'),
 ('a1660000-0000-4000-8000-000000000003','a1650000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000002','cancelled'),
 ('a1660000-0000-4000-8000-000000000004','a1650000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000002','pending');

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
 if not exists(select 1 from public.user_notifications where event_key='snapshot:accepted')
    or not exists(select 1 from public.user_notifications where event_key='snapshot:cancelled') then
   raise exception 'student deletion removed another same-name student''s booking history';
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
      'a1660000-0000-4000-8000-000000000002','a1660000-0000-4000-8000-000000000003')) then
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

rollback;
select 'booking snapshot deletion SQL assertions passed' as result;
