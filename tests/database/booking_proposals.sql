\set ON_ERROR_STOP on
begin;

do $$ begin
 if to_regprocedure('public.propose_booking_time(uuid,timestamptz,timestamptz)') is null
    or to_regprocedure('public.student_booking_group_choices(text,uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='booking_slots' and column_name='source') then
  raise exception 'booking proposal migration is missing';
 end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('b2000000-0000-4000-8000-000000000001','authenticated','authenticated','proposal-teacher@test.invalid','{"full_name":"Proposal Teacher","requested_role":"teacher"}'),
 ('b2000000-0000-4000-8000-000000000002','authenticated','authenticated','proposal-student@test.invalid','{"full_name":"Proposal Student","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='b2000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select 'b2100000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',o.id,'Proposal Fixture Group',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values
 ('b2100000-0000-4000-8000-000000000001',0,'08:00','09:00');
update public.groups set status='published' where id='b2100000-0000-4000-8000-000000000001';
insert into public.enrollments(group_id,student_id,status) values
 ('b2100000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','accepted');

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000001';
select public.publish_booking_slot('b2100000-0000-4000-8000-000000000001',now()+interval '30 days',now()+interval '30 days 1 hour') as available_slot_id \gset
select set_config('test.proposal_available_slot_id',:'available_slot_id',true);
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000002';
select public.propose_booking_time('b2100000-0000-4000-8000-000000000001',now()+interval '30 days',now()+interval '30 days 1 hour') as proposal_request_id \gset
select public.propose_booking_time('b2100000-0000-4000-8000-000000000001',now()+interval '30 days',now()+interval '30 days 1 hour') as proposal_retry_id \gset
select set_config('test.proposal_request_id',:'proposal_request_id',true);
select set_config('test.proposal_retry_id',:'proposal_retry_id',true);
do $$ begin
 if current_setting('test.proposal_request_id')::uuid is distinct from current_setting('test.proposal_retry_id')::uuid then raise exception 'proposal retry was not idempotent'; end if;
 if not exists(select 1 from public.student_booking_group_choices('missing','b2100000-0000-4000-8000-000000000001') where id='b2100000-0000-4000-8000-000000000001') then raise exception 'eligible selected group was omitted'; end if;
 if exists(select 1 from public.user_notifications where recipient_id='b2000000-0000-4000-8000-000000000002' and payload->>'booking_id'=current_setting('test.proposal_request_id') and payload->>'status'='pending') then raise exception 'student received own pending request notification'; end if;
end $$;
select set_config('test.proposal_slot_id',(select slot_id::text from public.booking_requests where id=current_setting('test.proposal_request_id')::uuid),true);
reset role;

do $$ begin
 if not exists(select 1 from public.booking_slots where id=current_setting('test.proposal_slot_id')::uuid and source='student_proposed' and proposed_by='b2000000-0000-4000-8000-000000000002') then raise exception 'proposal was not private student-sourced slot'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000001';
select public.decide_booking(current_setting('test.proposal_request_id')::uuid,true);
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000002';
do $$ declare v_page jsonb; begin
 v_page:=public.student_available_booking_slots(0,20);
 if exists(select 1 from jsonb_array_elements(v_page->'rows') as rows(item) where item->>'id'=current_setting('test.proposal_available_slot_id')) then raise exception 'accepted private appointment left overlapping availability visible'; end if;
 begin
  perform public.request_booking(current_setting('test.proposal_available_slot_id')::uuid);
  raise exception 'published request ignored accepted private appointment';
 exception when exclusion_violation then null; end;
 perform public.cancel_my_booking(current_setting('test.proposal_request_id')::uuid);
 v_page:=public.student_available_booking_slots(0,20);
 if not exists(select 1 from jsonb_array_elements(v_page->'rows') as rows(item) where item->>'id'=current_setting('test.proposal_available_slot_id')) then raise exception 'private cancellation did not reopen availability'; end if;
end $$;
reset role;

do $$ begin
 if exists(select 1 from public.user_notifications where recipient_id='b2000000-0000-4000-8000-000000000002' and payload->>'booking_id'=current_setting('test.proposal_request_id') and payload->>'status' in ('pending','cancelled')) then raise exception 'student received own request or cancellation alert'; end if;
 if not exists(select 1 from public.user_notifications where recipient_id='b2000000-0000-4000-8000-000000000001' and payload->>'booking_id'=current_setting('test.proposal_request_id') and payload->>'status'='pending') then raise exception 'teacher missed pending proposal alert'; end if;
 if not exists(select 1 from public.user_notifications where recipient_id='b2000000-0000-4000-8000-000000000002' and payload->>'booking_id'=current_setting('test.proposal_request_id') and payload->>'status'='accepted' and payload->>'group_name'='Proposal Fixture Group' and payload ? 'starts_at') then raise exception 'student decision alert is missing booking context'; end if;
 if not exists(select 1 from public.user_notifications where recipient_id='b2000000-0000-4000-8000-000000000001' and payload->>'booking_id'=current_setting('test.proposal_request_id') and payload->>'status'='cancelled') then raise exception 'teacher missed student cancellation alert'; end if;
end $$;

rollback;
