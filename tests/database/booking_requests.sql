\set ON_ERROR_STOP on
begin;

do $$ begin
 if to_regprocedure('public.publish_booking_slot(uuid,timestamptz,timestamptz)') is null
    or to_regprocedure('public.request_booking(uuid)') is null
    or to_regprocedure('public.decide_booking(uuid,boolean)') is null then
   raise exception 'booking RPC migration is missing';
 end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('b1000000-0000-4000-8000-000000000001','authenticated','authenticated','booking-teacher@test.invalid','{"full_name":"Booking Teacher","requested_role":"teacher"}'),
 ('b1000000-0000-4000-8000-000000000002','authenticated','authenticated','booking-student-one@test.invalid','{"full_name":"Student One","requested_role":"student"}'),
 ('b1000000-0000-4000-8000-000000000003','authenticated','authenticated','booking-student-two@test.invalid','{"full_name":"Student Two","requested_role":"student"}'),
 ('b1000000-0000-4000-8000-000000000004','authenticated','authenticated','booking-student-three@test.invalid','{"full_name":"Student Three","requested_role":"student"}'),
 ('b1000000-0000-4000-8000-000000000005','authenticated','authenticated','booking-teacher-two@test.invalid','{"full_name":"Booking Teacher Two","requested_role":"teacher"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000005');
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select 'b1100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',o.id,'Booking Group One',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select 'b1100000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000005',o.id,'Booking Group Two',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values
 ('b1100000-0000-4000-8000-000000000001',0,'08:00','09:00'),
 ('b1100000-0000-4000-8000-000000000002',1,'08:00','09:00');
update public.groups set status='published' where id in ('b1100000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000002');
insert into public.enrollments(group_id,student_id,status) values
 ('b1100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','accepted'),
 ('b1100000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','accepted'),
 ('b1100000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','pending');
insert into public.lessons(group_id,title,starts_at,ends_at,status) values
 ('b1100000-0000-4000-8000-000000000002','Second group lesson',now()+interval '4 days 10 minutes',now()+interval '4 days 50 minutes','scheduled'),
 ('b1100000-0000-4000-8000-000000000001','Reschedule test',now()+interval '4 days 2 hours',now()+interval '4 days 3 hours','scheduled');

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.publish_booking_slot('b1100000-0000-4000-8000-000000000001',now()+interval '4 days',now()+interval '4 days 1 hour');
reset role;
select id as booking_slot_id from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published' \gset

do $$
declare v_slot uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid; v_response jsonb; v_other uuid;
begin
 select id into v_slot from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published';
 select id into v_other from public.booking_slots where id='ffffffff-ffff-4fff-8fff-ffffffffffff';
 if v_slot is null then raise exception 'slot was not published'; end if;
 if has_table_privilege('authenticated','public.booking_requests','INSERT') or has_table_privilege('authenticated','public.booking_slots','UPDATE')
   or has_table_privilege('anon','public.booking_slots','SELECT') or has_table_privilege('service_role','public.booking_requests','SELECT') then
   raise exception 'booking tables expose direct writes or non-authenticated reads'; end if;
 if not has_function_privilege('authenticated','public.request_booking(uuid)','EXECUTE') or has_function_privilege('anon','public.request_booking(uuid)','EXECUTE') then raise exception 'booking RPC grants are incorrect'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
select public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '4 days',now()+interval '4 days 1 hour') as proposed_request_id \gset
select public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '4 days',now()+interval '4 days 1 hour') as retried_proposal_id \gset
select set_config('test.proposed_request_id',:'proposed_request_id',true);
select set_config('test.retried_proposal_id',:'retried_proposal_id',true);
do $$ begin
 if current_setting('test.proposed_request_id')::uuid is distinct from current_setting('test.retried_proposal_id')::uuid then raise exception 'exact proposal retry created a second request'; end if;
 if not exists(select 1 from public.student_booking_group_choices('no-match','b1100000-0000-4000-8000-000000000001') where id='b1100000-0000-4000-8000-000000000001') then raise exception 'selected eligible group was omitted from choices'; end if;
end $$;
select public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '8 days 10 hours',now()+interval '8 days 11 hours') as lesson_overlap_proposal_id \gset
select set_config('test.lesson_overlap_proposal_id',:'lesson_overlap_proposal_id',true);
reset role;
insert into public.lessons(group_id,title,starts_at,ends_at,status) values('b1100000-0000-4000-8000-000000000001','Pending proposal does not block lesson',now()+interval '8 days 10 hours',now()+interval '8 days 11 hours','scheduled');
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.publish_booking_slot('b1100000-0000-4000-8000-000000000001',now()+interval '10 days',now()+interval '10 days 1 hour');
select public.publish_booking_slot('b1100000-0000-4000-8000-000000000001',now()+interval '20 days',now()+interval '20 days 1 hour') as proposal_collision_slot_id \gset
select set_config('test.proposal_collision_slot_id',:'proposal_collision_slot_id',true);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
select public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '20 days',now()+interval '20 days 1 hour') as proposal_collision_request_id \gset
select set_config('test.proposal_collision_request_id',:'proposal_collision_request_id',true);
select set_config('test.proposal_collision_slot_id_private',(select slot_id::text from public.booking_requests where id=current_setting('test.proposal_collision_request_id')::uuid),true);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.decide_booking(current_setting('test.proposal_collision_request_id')::uuid,true);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
do $$ declare v_page jsonb; begin
 v_page:=public.student_available_booking_slots(0,20);
 if exists(select 1 from jsonb_array_elements(v_page->'rows') as rows(item) where item->>'id'=current_setting('test.proposal_collision_slot_id')) then raise exception 'published availability ignored accepted private appointment'; end if;
 begin
  perform public.request_booking(current_setting('test.proposal_collision_slot_id')::uuid);
  raise exception 'published slot request overlapped accepted private appointment';
 exception when exclusion_violation then null; end;
 perform public.cancel_my_booking(current_setting('test.proposal_collision_request_id')::uuid);
 v_page:=public.student_available_booking_slots(0,20);
 if not exists(select 1 from jsonb_array_elements(v_page->'rows') as rows(item) where item->>'id'=current_setting('test.proposal_collision_slot_id')) then raise exception 'cancelled private appointment did not reexpose published availability'; end if;
 if exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000002' and payload->>'booking_id'=current_setting('test.proposal_collision_request_id') and payload->>'status'='cancelled') then raise exception 'student received own cancellation notification'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000002' and payload->>'booking_id'=current_setting('test.proposal_collision_request_id') and payload->>'status'='cancelled') or not exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000001' and payload->>'booking_id'=current_setting('test.proposal_collision_request_id') and payload->>'status'='cancelled') then raise exception 'student cancellation notification routing is incorrect'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
select public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '22 days',now()+interval '22 days 1 hour') as private_conflict_request_id \gset
select set_config('test.private_conflict_request_id',:'private_conflict_request_id',true);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.decide_booking(current_setting('test.private_conflict_request_id')::uuid,true);
do $$ begin
 begin
  perform public.publish_booking_slot('b1100000-0000-4000-8000-000000000001',now()+interval '22 days',now()+interval '22 days 1 hour');
  raise exception 'publication overlapped accepted private appointment';
 exception when exclusion_violation then null; end;
end $$;
reset role;
do $$ begin
 begin
  insert into public.lessons(group_id,title,starts_at,ends_at,status) values('b1100000-0000-4000-8000-000000000001','Accepted proposal blocks lesson',now()+interval '22 days',now()+interval '22 days 1 hour','scheduled');
  raise exception 'lesson overlapped accepted private appointment';
 exception when exclusion_violation then null; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
select public.cancel_my_booking(current_setting('test.private_conflict_request_id')::uuid);
reset role;
do $$ begin
 if exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000002' and payload->>'booking_id'=current_setting('test.private_conflict_request_id') and payload->>'status'='cancelled') or not exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000001' and payload->>'booking_id'=current_setting('test.private_conflict_request_id') and payload->>'status'='cancelled') then raise exception 'student cancellation notification routing is incorrect'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
do $$ declare i integer; begin
 for i in 1..18 loop
  perform public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '10 days'+i*interval '1 hour',now()+interval '10 days'+(i+1)*interval '1 hour');
 end loop;
 begin
  perform public.propose_booking_time('b1100000-0000-4000-8000-000000000001',now()+interval '40 days',now()+interval '40 days 1 hour');
  raise exception 'proposal cap did not reject a twenty-first proposal';
 exception when sqlstate '22023' then
  if sqlerrm<>'proposal limit reached' then raise; end if;
 end;
end $$;
select public.request_booking(:'booking_slot_id');
reset role;

do $$ declare v_slot uuid; v_req uuid:=current_setting('test.proposed_request_id')::uuid; begin
 select slot_id into v_slot from public.booking_requests where id=v_req;
 if not exists(select 1 from public.booking_slots where id=v_slot and source='student_proposed' and proposed_by='b1000000-0000-4000-8000-000000000002') then raise exception 'student proposal source was not recorded'; end if;
 if exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000002' and kind='booking_updated' and payload->>'booking_id'=v_req::text and payload->>'status'='pending') then raise exception 'student received own pending request notification'; end if;
end $$;
select set_config('test.proposed_slot_id',(select slot_id::text from public.booking_requests where id=current_setting('test.proposed_request_id')::uuid),true);

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000003';
do $$ begin
 if exists(select 1 from public.booking_requests where id=current_setting('test.proposed_request_id')::uuid) then raise exception 'another student can read a private proposal'; end if;
 begin
  perform public.request_booking(current_setting('test.proposed_slot_id')::uuid);
  raise exception 'another student booked a private proposal';
 exception when no_data_found then null; when sqlstate 'P0002' then null; end;
end $$;
reset role;

-- A competing accepted member may request the same slot. Acceptance picks one
-- student and closes every competing pending request atomically.
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000003';
select public.request_booking(:'booking_slot_id');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000004';
select set_config('test.booking_slot_id',:'booking_slot_id',true);
do $$ begin
 begin
  perform public.request_booking(current_setting('test.booking_slot_id')::uuid);
  raise exception 'non-enrolled student request succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.booking_requests where slot_id=current_setting('test.booking_slot_id')::uuid and student_id='b1000000-0000-4000-8000-000000000004') then raise exception 'non-enrolled student request was accepted'; end if;
end $$;

do $$ declare v_ids uuid[]; begin
 select array_agg(id order by student_id) into v_ids from public.booking_requests where slot_id=current_setting('test.booking_slot_id')::uuid;
 if cardinality(v_ids)<>2 then raise exception 'expected two competing requests'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.decide_booking(id,true) from public.booking_requests where student_id='b1000000-0000-4000-8000-000000000002' and slot_id=:'booking_slot_id';
reset role;

do $$
declare v_slot uuid; v_winner uuid; v_loser uuid; v_count integer; v_rows jsonb;
begin
 select id into v_slot from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published';
 select id into v_winner from public.booking_requests where slot_id=v_slot and status='accepted';
 select id into v_loser from public.booking_requests where slot_id=v_slot and status='declined';
 if v_winner is null or v_loser is null then raise exception 'accept did not settle competing requests'; end if;
 select count(*) into v_count from public.user_notifications where kind='booking_updated' and payload->>'booking_id'=v_loser::text and payload->>'status'='declined';
 if v_count<>1 then raise exception 'competing decline notification missing for affected student'; end if;
 if exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000001' and kind='booking_updated' and payload->>'booking_id'=v_loser::text and payload->>'status'='declined') then raise exception 'teacher received a notification for a decision they made'; end if;
 if not exists(select 1 from public.user_notifications where recipient_id='b1000000-0000-4000-8000-000000000003' and kind='booking_updated' and payload->>'booking_id'=v_loser::text and payload->>'group_name'='Booking Group One' and payload ? 'starts_at' and payload ? 'student_name') then raise exception 'decision notification lacks expected context'; end if;
 begin
  insert into public.lessons(group_id,title,starts_at,ends_at,status) values('b1100000-0000-4000-8000-000000000001','Conflict',now()+interval '4 days 15 minutes',now()+interval '4 days 45 minutes','scheduled');
  raise exception 'lesson insert overlapped accepted booking';
 exception when exclusion_violation then null; end;
 begin
  update public.lessons set starts_at=now()+interval '4 days 15 minutes',ends_at=now()+interval '4 days 45 minutes'
   where group_id='b1100000-0000-4000-8000-000000000001' and title='Reschedule test';
  raise exception 'lesson reschedule overlapped accepted booking';
 exception when exclusion_violation then null; end;
 begin
  update public.enrollments set status='accepted' where group_id='b1100000-0000-4000-8000-000000000002' and student_id='b1000000-0000-4000-8000-000000000002';
  raise exception 'enrollment acceptance introduced booked-student conflict';
 exception when exclusion_violation then null; end;
end $$;

-- Request listing returns the teacher's student name, while another student
-- cannot read the request row or see the student name in privileged output.
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000003';
do $$ begin
 if exists(select 1 from public.booking_requests where student_id='b1000000-0000-4000-8000-000000000002') then raise exception 'another student can read a private request'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000003';
do $$ declare v_page jsonb; begin
 v_page:=public.student_available_booking_slots(0,20);
 if exists(select 1 from jsonb_array_elements(v_page->'rows') as rows(item) where item->>'id'=current_setting('test.booking_slot_id')) then raise exception 'student sees a slot accepted by another student'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.booking_page('teacher',0,20);
reset role;

-- Membership removal cancels an accepted appointment.
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.publish_booking_slot('b1100000-0000-4000-8000-000000000001',now()+interval '6 days',now()+interval '6 days 1 hour');
reset role;
select id as second_booking_slot_id from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published' and starts_at>now()+interval '5 days' and starts_at<now()+interval '7 days' \gset
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
select public.request_booking(:'second_booking_slot_id');
reset role;
select id as second_request_id from public.booking_requests where slot_id=:'second_booking_slot_id' \gset
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.decide_booking(:'second_request_id',true);
select public.decide_enrollment((select id from public.enrollments where group_id='b1100000-0000-4000-8000-000000000001' and student_id='b1000000-0000-4000-8000-000000000002'),'removed');
reset role;
do $$ begin
 if (select r.status from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where s.group_id='b1100000-0000-4000-8000-000000000001' and s.source='teacher_published' and r.student_id='b1000000-0000-4000-8000-000000000002' and s.starts_at>now()+interval '5 days' and s.starts_at<now()+interval '7 days')<>'cancelled' then raise exception 'membership removal did not cancel booking'; end if;
end $$;

-- Cancelling an open slot settles active requests, and a repeated cancel is a no-op.
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
select public.cancel_booking_slot((select id from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published' and starts_at<now()+interval '5 days'));
select public.cancel_booking_slot((select id from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published' and starts_at<now()+interval '5 days'));
reset role;

do $$ begin
 if exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where s.group_id='b1100000-0000-4000-8000-000000000001' and s.source='teacher_published' and s.starts_at<now()+interval '5 days' and r.status in ('pending','accepted')) then raise exception 'slot cancellation left active requests'; end if;
 if (select status from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000001' and source='teacher_published' and starts_at<now()+interval '5 days')<>'cancelled' then raise exception 'slot did not cancel'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000005';
select public.publish_booking_slot('b1100000-0000-4000-8000-000000000002',now()+interval '8 days',now()+interval '8 days 1 hour');
select public.cancel_teacher_group('b1100000-0000-4000-8000-000000000002');
reset role;
do $$ begin
 if exists(select 1 from public.booking_slots where group_id='b1100000-0000-4000-8000-000000000002' and status='open') then raise exception 'group archive left open booking slots'; end if;
end $$;

rollback;
