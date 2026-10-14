\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regprocedure('public.student_group_schedule_overlap(uuid)') is null
     or not has_function_privilege('authenticated','public.student_group_schedule_overlap(uuid)','EXECUTE')
     or has_function_privilege('anon','public.student_group_schedule_overlap(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.student_group_schedule_overlap(uuid)','EXECUTE') then
    raise exception 'student schedule overlap signature or grants are unsafe';
  end if;
  if pg_get_function_result('public.student_group_schedule_overlap(uuid)'::regprocedure)<>'TABLE(weekly_overlap boolean, dated_overlap boolean)' then
    raise exception 'schedule overlap RPC returns unexpected fields';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7f000000-0000-4000-8000-000000000001','authenticated','authenticated','overlap-teacher@test.invalid','{"full_name":"Overlap teacher","requested_role":"teacher"}'),
 ('7f000000-0000-4000-8000-000000000002','authenticated','authenticated','overlap-student@test.invalid','{"full_name":"Overlap student","requested_role":"student"}'),
 ('7f000000-0000-4000-8000-000000000003','authenticated','authenticated','overlap-foreign@test.invalid','{"full_name":"Overlap foreign","requested_role":"student"}'),
 ('7f000000-0000-4000-8000-000000000004','authenticated','authenticated','overlap-inactive@test.invalid','{"full_name":"Inactive student","requested_role":"student"}');
update public.profiles set status='suspended' where id='7f000000-0000-4000-8000-000000000004';
set local session_replication_role = replica;
update public.teacher_profiles set headline='Teacher',bio='',approved=true where id='7f000000-0000-4000-8000-000000000001';

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select x.id,'7f000000-0000-4000-8000-000000000001',o.id,x.name,10,x.status::public.group_status
from (values
 ('7f100000-0000-4000-8000-000000000001'::uuid,'Candidate overlap group','published'),
 ('7f100000-0000-4000-8000-000000000002'::uuid,'Accepted overlap group','published'),
 ('7f100000-0000-4000-8000-000000000003'::uuid,'Archived overlap group','archived'),
 ('7f100000-0000-4000-8000-000000000004'::uuid,'Unpublished overlap group','draft')
) x(id,name,status) cross join lateral (select id from public.offerings order by id limit 1) o;
set local session_replication_role = origin;
insert into public.enrollments(id,group_id,student_id,status) values
 ('7f200000-0000-4000-8000-000000000001','7f100000-0000-4000-8000-000000000002','7f000000-0000-4000-8000-000000000002','accepted'),
 ('7f200000-0000-4000-8000-000000000002','7f100000-0000-4000-8000-000000000003','7f000000-0000-4000-8000-000000000002','accepted');

-- The touching boundary is not an overlap. Weekday 2 is Tuesday in Cairo.
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('7f300000-0000-4000-8000-000000000001','7f100000-0000-4000-8000-000000000001',2,'10:00','11:00'),
 ('7f300000-0000-4000-8000-000000000002','7f100000-0000-4000-8000-000000000002',2,'09:00','10:00'),
 ('7f300000-0000-4000-8000-000000000003','7f100000-0000-4000-8000-000000000003',2,'10:15','10:45'),
 ('7f300000-0000-4000-8000-000000000004','7f100000-0000-4000-8000-000000000004',2,'10:15','10:45');

set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000002';
do $$
declare v_result record; v_date date := date '2030-01-01';
begin
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.weekly_overlap or v_result.dated_overlap then raise exception 'adjacent weekly slots were treated as overlapping'; end if;

  update public.group_schedule_slots set start_time='10:30',end_time='11:30' where id='7f300000-0000-4000-8000-000000000002';
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if not v_result.weekly_overlap then raise exception 'overlapping weekly templates were not detected'; end if;
  update public.group_schedule_slots set start_time='09:00',end_time='10:00' where id='7f300000-0000-4000-8000-000000000002';

  -- A Cairo-local Tuesday occurrence must match the weekly candidate slot,
  -- even where UTC has a different date or offset around timezone changes.
  insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
   ('7f400000-0000-4000-8000-000000000001','7f100000-0000-4000-8000-000000000002','Private accepted lesson',
    ((v_date + time '10:30') at time zone 'Africa/Cairo'),((v_date + time '11:30') at time zone 'Africa/Cairo'),'scheduled');
  update public.group_schedule_slots set start_time='10:00',end_time='11:00' where id='7f300000-0000-4000-8000-000000000001';
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.weekly_overlap or not v_result.dated_overlap then raise exception 'weekly-versus-dated Cairo-local overlap was classified incorrectly'; end if;

  -- Two dated lessons use their absolute starts and ends to detect overlap.
  update public.group_schedule_slots set weekday=5,start_time='08:00',end_time='09:00' where id='7f300000-0000-4000-8000-000000000001';
  insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
   ('7f400000-0000-4000-8000-000000000002','7f100000-0000-4000-8000-000000000001','Private candidate lesson',
    ((v_date + time '11:00') at time zone 'Africa/Cairo'),((v_date + time '12:00') at time zone 'Africa/Cairo'),'scheduled');
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.weekly_overlap or not v_result.dated_overlap then raise exception 'overlapping actual dated lessons were not detected'; end if;
  delete from public.lessons where id='7f400000-0000-4000-8000-000000000002';
  update public.group_schedule_slots set weekday=2,start_time='10:00',end_time='11:00' where id='7f300000-0000-4000-8000-000000000001';

  -- Cancelled, completed, and past lessons do not create warnings.
  update public.lessons set status='cancelled' where id='7f400000-0000-4000-8000-000000000001';
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.dated_overlap then raise exception 'cancelled lesson caused a warning'; end if;
  update public.lessons set status='completed' where id='7f400000-0000-4000-8000-000000000001';
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.dated_overlap then raise exception 'completed lesson caused a warning'; end if;
  update public.lessons set status='scheduled',starts_at=statement_timestamp()-interval '3 days',ends_at=statement_timestamp()-interval '2 days' where id='7f400000-0000-4000-8000-000000000001';
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.dated_overlap then raise exception 'past lesson caused a warning'; end if;

  -- A multi-day dated candidate lesson overlaps a weekly accepted slot after midnight.
  update public.group_schedule_slots set weekday=3,start_time='10:00',end_time='11:00' where id='7f300000-0000-4000-8000-000000000002';
  insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
   ('7f400000-0000-4000-8000-000000000003','7f100000-0000-4000-8000-000000000001','Private candidate lesson',
    ((v_date + time '23:00') at time zone 'Africa/Cairo'),(((v_date + 2) + time '11:00') at time zone 'Africa/Cairo'),'scheduled');
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if not v_result.dated_overlap then raise exception 'multi-day dated lesson did not overlap a Cairo-local weekly slot'; end if;

  -- Archived groups never contribute even if an accepted enrollment and slot remain.
  update public.groups set status='archived' where id='7f100000-0000-4000-8000-000000000002';
  delete from public.lessons where id='7f400000-0000-4000-8000-000000000003';
  delete from public.lessons where id='7f400000-0000-4000-8000-000000000001';
  update public.group_schedule_slots set weekday=2,start_time='10:15',end_time='10:45' where id='7f300000-0000-4000-8000-000000000001';
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.weekly_overlap or v_result.dated_overlap then raise exception 'archived accepted group caused a warning'; end if;

  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000004');
  if v_result.weekly_overlap or v_result.dated_overlap then raise exception 'unpublished candidate was treated as eligible'; end if;
  if (to_jsonb(v_result) ?| array['lesson_id','lesson_title','group_id','group_name','slot_id']) then
    raise exception 'schedule RPC leaked private identifiers or descriptions';
  end if;
end $$;

set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000003';
do $$ declare v_result record; begin
  select * into v_result from public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
  if v_result.weekly_overlap or v_result.dated_overlap then raise exception 'foreign student's accepted groups affected result'; end if;
end $$;

set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000004';
do $$ begin
  begin
    perform public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
    raise exception 'inactive student was allowed to check schedule overlap';
  exception when others then
    if sqlerrm<>'active student required' then raise; end if;
  end;
end $$;

set local role anon;
do $$ begin
  begin perform public.student_group_schedule_overlap('7f100000-0000-4000-8000-000000000001');
    raise exception 'anonymous role called schedule overlap RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'student schedule overlap SQL assertions passed' as result;
