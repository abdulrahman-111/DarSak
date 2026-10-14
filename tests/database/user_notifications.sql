\set ON_ERROR_STOP on
begin;

do $$ begin
  if not has_table_privilege('authenticated','public.user_notifications','SELECT')
     or has_table_privilege('authenticated','public.user_notifications','INSERT')
     or has_table_privilege('authenticated','public.user_notifications','UPDATE')
     or has_table_privilege('authenticated','public.user_notifications','DELETE')
     or has_table_privilege('anon','public.user_notifications','SELECT')
     or has_table_privilege('service_role','public.user_notifications','SELECT') then raise exception 'notification table grants are unsafe'; end if;
  if has_function_privilege('anon','public.notifications_page(integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.notifications_page(integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.mark_notification_read(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.mark_notification_read(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.notifications_page(integer,integer)','EXECUTE') then raise exception 'notification RPC grants are unsafe'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7f400000-0000-4000-8000-000000000001','authenticated','authenticated','notify-teacher@test.invalid','{"full_name":"Notify Teacher","requested_role":"teacher"}'),
 ('7f400000-0000-4000-8000-000000000002','authenticated','authenticated','notify-student@test.invalid','{"full_name":"Notify Student","requested_role":"student"}'),
 ('7f400000-0000-4000-8000-000000000003','authenticated','authenticated','notify-pending@test.invalid','{"full_name":"Notify Pending","requested_role":"student"}'),
 ('7f400000-0000-4000-8000-000000000004','authenticated','authenticated','notify-suspended@test.invalid','{"full_name":"Notify Suspended","requested_role":"student"}'),
 ('7f400000-0000-4000-8000-000000000005','authenticated','authenticated','notify-admin@test.invalid','{"full_name":"Notify Admin","requested_role":"student"}');

-- Fixture-only role, approval and account state setup. Restore triggers before behavior assertions.
set local session_replication_role=replica;
update public.profiles set role='admin' where id='7f400000-0000-4000-8000-000000000005';
update public.teacher_profiles set approved=true where id='7f400000-0000-4000-8000-000000000001';
update public.profiles set status='suspended' where id='7f400000-0000-4000-8000-000000000004';
set local session_replication_role=origin;
insert into public.teacher_review_events(teacher_id,kind,source)
values ('7f400000-0000-4000-8000-000000000001','requested','test'),('7f400000-0000-4000-8000-000000000001','approved','test');

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f410000-0000-4000-8000-000000000001','7f400000-0000-4000-8000-000000000001',o.id,'Notify Group',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.enrollments(group_id,student_id,status) values
 ('7f410000-0000-4000-8000-000000000001','7f400000-0000-4000-8000-000000000002','accepted'),
 ('7f410000-0000-4000-8000-000000000001','7f400000-0000-4000-8000-000000000004','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('7f420000-0000-4000-8000-000000000001','7f410000-0000-4000-8000-000000000001','Notify Lesson',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled'),
 ('7f420000-0000-4000-8000-000000000002','7f410000-0000-4000-8000-000000000001','Suppressed Cancel',now()+interval '4 days',now()+interval '4 days 1 hour','scheduled');
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('7f410000-0000-4000-8000-000000000001',1,'09:00','10:00');
update public.groups set status='published' where id='7f410000-0000-4000-8000-000000000001';

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f410000-0000-4000-8000-000000000003','7f400000-0000-4000-8000-000000000001',o.id,'Notify Lesson Cancel',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.enrollments(group_id,student_id,status) values('7f410000-0000-4000-8000-000000000003','7f400000-0000-4000-8000-000000000002','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values('7f420000-0000-4000-8000-000000000003','7f410000-0000-4000-8000-000000000003','Cancel Lesson',now()+interval '5 days',now()+interval '5 days 1 hour','scheduled');
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('7f410000-0000-4000-8000-000000000003',1,'09:00','10:00');
update public.groups set status='published' where id='7f410000-0000-4000-8000-000000000003';

-- Draft schedule setup and generated lessons produce no inbox event.
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f410000-0000-4000-8000-000000000002','7f400000-0000-4000-8000-000000000001',o.id,'Notify Draft',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.enrollments(group_id,student_id,status) values('7f410000-0000-4000-8000-000000000002','7f400000-0000-4000-8000-000000000002','accepted');
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('7f410000-0000-4000-8000-000000000002',2,'10:00','11:00');
insert into public.lessons(group_id,title,starts_at,ends_at,status) values('7f410000-0000-4000-8000-000000000002','Generated only',now()+interval '3 days',now()+interval '3 days 1 hour','scheduled');

-- A new pending request creates one teacher notification; the repeated pending request is a no-op.
set local role authenticated;
set local request.jwt.claim.sub='7f400000-0000-4000-8000-000000000003';
select public.request_enrollment('7f410000-0000-4000-8000-000000000001');
select public.request_enrollment('7f410000-0000-4000-8000-000000000001');
reset role;

-- A published weekly template edit is informational and remains separate from dated lessons.
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('7f410000-0000-4000-8000-000000000001',3,'11:00','12:00');
update public.group_schedule_slots set start_time='12:00',end_time='13:00' where group_id='7f410000-0000-4000-8000-000000000001' and weekday=3;
delete from public.group_schedule_slots where group_id='7f410000-0000-4000-8000-000000000001' and weekday=3;

set local role authenticated;
set local request.jwt.claim.sub='7f400000-0000-4000-8000-000000000001';
select public.set_lesson_status('7f420000-0000-4000-8000-000000000003','cancelled');
reset role;

-- Active owner reschedules a relevant lesson, then makes a no-op update.
set local role authenticated;
set local request.jwt.claim.sub='7f400000-0000-4000-8000-000000000001';
select public.create_lesson('7f410000-0000-4000-8000-000000000001','Notify Lesson',timestamptz '2030-01-01 10:00:00+00',timestamptz '2030-01-01 11:00:00+00','', '7f420000-0000-4000-8000-000000000001');
select public.create_lesson('7f410000-0000-4000-8000-000000000001','Notify Lesson',timestamptz '2030-01-02 10:00:00+00',timestamptz '2030-01-02 11:00:00+00','', '7f420000-0000-4000-8000-000000000001');
select public.create_lesson('7f410000-0000-4000-8000-000000000001','Notify Lesson',timestamptz '2030-01-02 10:00:00+00',timestamptz '2030-01-02 11:00:00+00','', '7f420000-0000-4000-8000-000000000001');
select public.cancel_teacher_group('7f410000-0000-4000-8000-000000000001');
reset role;

do $$ begin
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000002' and kind='lesson_rescheduled')<>2 then raise exception 'lesson reschedule fingerprinting or no-op producer count is wrong'; end if;
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000002' and kind='lesson_cancelled')<>1 then raise exception 'individual lesson cancellation was not recorded'; end if;
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000002' and kind='weekly_schedule_changed')<>3 then raise exception 'published weekly schedule insert/update/delete was not recorded'; end if;
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000002' and kind='group_cancelled' and payload->>'group_id'='7f410000-0000-4000-8000-000000000001')<>1
     or exists(select 1 from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000002' and kind='lesson_cancelled' and payload->>'lesson_id' in ('7f420000-0000-4000-8000-000000000001','7f420000-0000-4000-8000-000000000002')) then raise exception 'group archive flooded students with lesson cancellation alerts'; end if;
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000004')<>0 then raise exception 'suspended recipient received an alert'; end if;
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000001' and kind='enrollment_requested')<>1 then raise exception 'pending enrollment/repeat notification count is wrong'; end if;
  if (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000005' and kind='teacher_review_requested')<>1
     or (select count(*) from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000001' and kind='teacher_review_decision')<>1 then raise exception 'teacher review recipient notifications are missing'; end if;
  if exists(select 1 from public.user_notifications where payload ? 'recipient_id' or payload ? 'email' or payload ? 'phone') then raise exception 'notification payload contains private contact or recipient data'; end if;
  if exists(select 1 from public.user_notifications where recipient_id='7f400000-0000-4000-8000-000000000002' and payload->>'group_id'='7f410000-0000-4000-8000-000000000002') then raise exception 'draft setup generated a notification'; end if;
  insert into public.user_notifications(id,recipient_id,kind,event_key) values('7f430000-0000-4000-8000-000000000099','7f400000-0000-4000-8000-000000000001','lesson_cancelled','foreign-mark-test');
end $$;

set local role authenticated;
set local request.jwt.claim.sub='7f400000-0000-4000-8000-000000000002';
do $$ declare v jsonb; v_id uuid; begin
  v:=public.notifications_page(0,20);
  if (v->>'total')::integer<>7 or (v->>'unread')::integer<>7 or jsonb_array_length(v->'rows')<>7 then raise exception 'own notification page is incomplete: %',v; end if;
  if (v->'rows'->0) ?| array['recipient_id','event_key'] then raise exception 'notification page exposed internal fields'; end if;
  v_id:=(v->'rows'->0->>'id')::uuid;
  perform public.mark_notification_read(v_id);
  if (public.notifications_page(0,20)->>'unread')::integer<>6 then raise exception 'mark own read did not update unread count'; end if;
  perform public.mark_notification_read('7f430000-0000-4000-8000-000000000099');
  begin perform public.notifications_page(0,21); raise exception 'oversized notification page was accepted'; exception when sqlstate '22023' then null; end;
  begin insert into public.user_notifications(recipient_id,kind,event_key) values(auth.uid(),'lesson_cancelled','raw'); raise exception 'raw notification write succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f400000-0000-4000-8000-000000000005';
do $$ begin
  if (public.notifications_page(0,20)->>'total')::integer<>1 then raise exception 'admin own review notification was not private or missing'; end if;
end $$;
reset role;

rollback;
