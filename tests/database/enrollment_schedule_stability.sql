\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('8e000000-0000-4000-8000-000000000001','authenticated','authenticated','stability-teacher@test.invalid','{"full_name":"Stability teacher","requested_role":"teacher"}'),
 ('8e000000-0000-4000-8000-000000000002','authenticated','authenticated','stability-unapproved@test.invalid','{"full_name":"Unapproved teacher","requested_role":"teacher"}'),
 ('8e000000-0000-4000-8000-000000000005','authenticated','authenticated','stability-suspended@test.invalid','{"full_name":"Suspended teacher","requested_role":"teacher"}'),
 ('8e000000-0000-4000-8000-000000000003','authenticated','authenticated','stability-student@test.invalid','{"full_name":"Stability student","requested_role":"student"}'),
 ('8e000000-0000-4000-8000-000000000004','authenticated','authenticated','stability-student-two@test.invalid','{"full_name":"Second student","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='8e000000-0000-4000-8000-000000000001';
update public.teacher_profiles set approved=true where id='8e000000-0000-4000-8000-000000000005';
update public.profiles set status='suspended' where id='8e000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

-- These rows model legacy published groups, including invalid/past schedules;
-- bypass publication triggers only while seeding and restore them before RPCs.
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select f.id,f.teacher_id,o.id,f.name,f.capacity,f.status
from (values
 ('8e100000-0000-4000-8000-000000000001'::uuid,'8e000000-0000-4000-8000-000000000001'::uuid,'Eligible',1,'published'::public.group_status),
 ('8e100000-0000-4000-8000-000000000002'::uuid,'8e000000-0000-4000-8000-000000000005'::uuid,'Suspended',3,'published'::public.group_status),
 ('8e100000-0000-4000-8000-000000000003'::uuid,'8e000000-0000-4000-8000-000000000002'::uuid,'Unapproved',3,'published'::public.group_status),
 ('8e100000-0000-4000-8000-000000000004'::uuid,'8e000000-0000-4000-8000-000000000001'::uuid,'Archived',2,'archived'::public.group_status),
 ('8e100000-0000-4000-8000-000000000005'::uuid,'8e000000-0000-4000-8000-000000000001'::uuid,'Replacement',3,'draft'::public.group_status),
 ('8e100000-0000-4000-8000-000000000006'::uuid,'8e000000-0000-4000-8000-000000000001'::uuid,'Active conflict',3,'draft'::public.group_status)
) f(id,teacher_id,name,capacity,status)
cross join lateral (select id from public.offerings order by id limit 1) o;
set local session_replication_role=origin;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('8e200000-0000-4000-8000-000000000001','8e100000-0000-4000-8000-000000000004',1,'10:00','11:00'),
 ('8e200000-0000-4000-8000-000000000002','8e100000-0000-4000-8000-000000000006',2,'10:00','11:00');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('8e300000-0000-4000-8000-000000000001','8e100000-0000-4000-8000-000000000004','Historical completed','2000-01-03 08:00+00','2000-01-03 09:00+00','completed'),
 ('8e300000-0000-4000-8000-000000000002','8e100000-0000-4000-8000-000000000005','Historical scheduled','2000-01-03 08:00+00','2000-01-03 09:00+00','scheduled');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
select '8e300000-0000-4000-8000-000000000003','8e100000-0000-4000-8000-000000000006','Future active conflict',
  (((current_date + (((4-extract(dow from current_date)::int+7)%7)+7))::date + time '10:00') at time zone 'Africa/Cairo'),
  (((current_date + (((4-extract(dow from current_date)::int+7)%7)+7))::date + time '11:00') at time zone 'Africa/Cairo'),
  'scheduled';
insert into public.enrollments(id,group_id,student_id,status) values
 ('8e400000-0000-4000-8000-000000000001','8e100000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000004','accepted'),
 ('8e400000-0000-4000-8000-000000000002','8e100000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000003','pending'),
 ('8e400000-0000-4000-8000-000000000003','8e100000-0000-4000-8000-000000000004','8e000000-0000-4000-8000-000000000003','pending'),
 ('8e400000-0000-4000-8000-000000000004','8e100000-0000-4000-8000-000000000002','8e000000-0000-4000-8000-000000000003','rejected');

set local role authenticated;
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000003';
do $$
declare v_id uuid; v_message text;
begin
  v_id:=public.request_enrollment('8e100000-0000-4000-8000-000000000001');
  if v_id is distinct from '8e400000-0000-4000-8000-000000000002'::uuid
     or (select status from public.enrollments where id=v_id)<>'pending' then
    raise exception 'eligible request did not preserve the existing pending enrollment';
  end if;
  foreach v_id in array array[
    '8e100000-0000-4000-8000-000000000002'::uuid,
    '8e100000-0000-4000-8000-000000000003'::uuid,
    '8e100000-0000-4000-8000-000000000004'::uuid
  ] loop
    begin
      perform public.request_enrollment(v_id);
      raise exception 'request accepted for ineligible group %',v_id;
    exception when others then
      get stacked diagnostics v_message=message_text;
      if v_message<>'published group not found' then raise; end if;
    end;
  end loop;
  if exists(select 1 from public.enrollments where group_id in ('8e100000-0000-4000-8000-000000000002','8e100000-0000-4000-8000-000000000003') and student_id='8e000000-0000-4000-8000-000000000003' and status='pending')
    or (select status from public.enrollments where id='8e400000-0000-4000-8000-000000000004')<>'rejected' then
    raise exception 'ineligible request created or reopened an enrollment';
  end if;
  if (select status from public.enrollments where id='8e400000-0000-4000-8000-000000000002')<>'pending'
    or (select status from public.enrollments where id='8e400000-0000-4000-8000-000000000003')<>'pending' then
    raise exception 'student-side checks unexpectedly changed enrollment states';
  end if;
end $$;
reset role;

-- Decisions run as the actual active owner; exact errors guard against false positives.
set local role authenticated;
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000001';
do $$
declare v_message text;
begin
  begin
    perform public.decide_enrollment('8e400000-0000-4000-8000-000000000002','accepted');
    raise exception 'capacity limit was bypassed';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'group is full' then raise; end if;
  end;
  begin
    perform public.decide_enrollment('8e400000-0000-4000-8000-000000000003','accepted');
    raise exception 'archived enrollment was accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'cannot accept enrollment for archived or unpublished group' then raise; end if;
  end;
  if (select status from public.enrollments where id='8e400000-0000-4000-8000-000000000002')<>'pending'
    or (select status from public.enrollments where id='8e400000-0000-4000-8000-000000000003')<>'pending' then
    raise exception 'failed decision changed enrollment state';
  end if;
end $$;
reset role;

-- An active approved owner may reuse a slot reserved only by archived history.
set local role authenticated;
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000001';
do $$
declare v_slot uuid; v_message text;
begin
  v_slot:=public.save_schedule_slot('8e100000-0000-4000-8000-000000000005',1,'10:00','11:00');
  if v_slot is null then raise exception 'replacement group could not reuse archived schedule'; end if;
  if not exists(select 1 from public.lessons where id='8e300000-0000-4000-8000-000000000001' and status='completed')
    or not exists(select 1 from public.lessons where id='8e300000-0000-4000-8000-000000000002' and status='scheduled') then
    raise exception 'schedule reuse changed historical lesson rows';
  end if;
  begin
    perform public.save_schedule_slot('8e100000-0000-4000-8000-000000000005',2,'10:00','11:00');
    raise exception 'active other group recurring reservation was ignored';
  exception when others then if sqlerrm<>'teacher recurring schedule overlaps' then raise; end if; end;
  begin
    perform public.save_schedule_slot('8e100000-0000-4000-8000-000000000005',4,'10:00','11:00');
    raise exception 'future active dated lesson conflict was ignored';
  exception when others then if sqlerrm<>'schedule overlaps existing lesson' then raise; end if; end;
  begin
    perform public.save_schedule_slot('8e100000-0000-4000-8000-000000000004',3,'10:00','11:00');
    raise exception 'stale archived group schedule mutation succeeded';
  exception when others then
    if sqlerrm<>'cannot edit archived group schedule' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','8e000000-0000-4000-8000-000000000003',true);
  begin
    perform public.save_schedule_slot('8e100000-0000-4000-8000-000000000006',4,'10:00','11:00');
    raise exception 'foreign owner changed another group schedule';
  exception when others then
    if sqlerrm<>'not authorized' then raise; end if;
  end;
end $$;
reset role;

rollback;
