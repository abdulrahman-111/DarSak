\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('public.cancel_teacher_group(uuid)') is null
    or to_regprocedure('public.delete_unused_teacher_group(uuid)') is null
    or to_regprocedure('public.delete_manual_teacher_lesson(uuid)') is null
    or not has_function_privilege('authenticated','public.cancel_teacher_group(uuid)','EXECUTE')
    or has_function_privilege('anon','public.cancel_teacher_group(uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.delete_manual_teacher_lesson(uuid)','EXECUTE') then
    raise exception 'management RPC signatures or grants are unsafe';
  end if;
  if has_table_privilege('authenticated','public.groups','DELETE')
    or has_table_privilege('authenticated','public.lessons','DELETE') then
    raise exception 'raw group/lesson deletes must remain unavailable';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7d000000-0000-4000-8000-000000000001','authenticated','authenticated','manage-owner@test.invalid','{"full_name":"Management owner","requested_role":"teacher"}'),
 ('7d000000-0000-4000-8000-000000000002','authenticated','authenticated','manage-other@test.invalid','{"full_name":"Management other","requested_role":"teacher"}'),
 ('7d000000-0000-4000-8000-000000000003','authenticated','authenticated','manage-student@test.invalid','{"full_name":"Management student","requested_role":"student"}'),
 ('7d000000-0000-4000-8000-000000000004','authenticated','authenticated','manage-admin@test.invalid','{"full_name":"Management admin","requested_role":"student"}'),
 ('7d000000-0000-4000-8000-000000000005','authenticated','authenticated','manage-pending@test.invalid','{"full_name":"Management pending","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='7d000000-0000-4000-8000-000000000004';
update public.teacher_profiles set approved=true where id='7d000000-0000-4000-8000-000000000001';
update public.teacher_review_state set status='approved',request_id=null,reviewed_at=now() where teacher_id='7d000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7d100000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001',id,'Cancel me',10,'draft'
from public.offerings order by id limit 1;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values('7d200000-0000-4000-8000-000000000001','7d100000-0000-4000-8000-000000000001',1,'10:00','11:00');
insert into public.lessons(id,group_id,slot_id,local_date,title,starts_at,ends_at,status)
values
 ('7d300000-0000-4000-8000-000000000001','7d100000-0000-4000-8000-000000000001',null,'2020-01-01','Future manual',now()+interval '1 day',now()+interval '1 day 1 hour','scheduled'),
 ('7d300000-0000-4000-8000-000000000002','7d100000-0000-4000-8000-000000000001',null,'2020-01-02','Past manual',now()-interval '2 days',now()-interval '2 days'+interval '1 hour','scheduled');
insert into public.enrollments(group_id,student_id,status)
values
 ('7d100000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000003','accepted'),
 ('7d100000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000005','pending');
insert into public.lesson_materials(lesson_id,kind,title,url,uploaded_by)
values('7d300000-0000-4000-8000-000000000001','link','Preserve this','https://example.test/material','7d000000-0000-4000-8000-000000000001');
set local session_replication_role=replica;
update public.groups set status='published' where id='7d100000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

-- Owner cancel preserves accepted membership and lesson/material history, while
-- cancelling only future scheduled lessons and archiving the group.
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000001';
do $$
declare v_count integer; v_lesson_count integer;
begin
  begin perform public.delete_unused_teacher_group('7d100000-0000-4000-8000-000000000001');
    raise exception 'published group was deleted without cancellation';
  exception when raise_exception then
    if sqlerrm='published group was deleted without cancellation' then raise; end if;
  end;
  v_count:=public.cancel_teacher_group('7d100000-0000-4000-8000-000000000001');
  if v_count<>1 or (select status from public.groups where id='7d100000-0000-4000-8000-000000000001')<>'archived'
     or (select status from public.lessons where id='7d300000-0000-4000-8000-000000000001')<>'cancelled'
     or (select status from public.lessons where id='7d300000-0000-4000-8000-000000000002')<>'scheduled'
     or (select status from public.enrollments where group_id='7d100000-0000-4000-8000-000000000001' and student_id='7d000000-0000-4000-8000-000000000003')<>'accepted'
     or (select status from public.enrollments where group_id='7d100000-0000-4000-8000-000000000001' and student_id='7d000000-0000-4000-8000-000000000005')<>'rejected'
     or (select count(*) from public.lesson_materials where lesson_id='7d300000-0000-4000-8000-000000000001')<>1 then
    raise exception 'group cancellation failed to preserve history or cancel only future lessons';
  end if;
  select count(*) into v_lesson_count from public.lessons where group_id='7d100000-0000-4000-8000-000000000001';
  begin
    perform public.create_lesson('7d100000-0000-4000-8000-000000000001','Stale create',now()+interval '5 days',now()+interval '5 days 1 hour','');
    raise exception 'stale lesson create succeeded for archived group';
  exception when raise_exception then
    if sqlerrm='stale lesson create succeeded for archived group' then raise; end if;
  end;
  begin
    perform public.generate_lessons('7d100000-0000-4000-8000-000000000001','2027-01-04','2027-01-04');
    raise exception 'stale generation succeeded for archived group';
  exception when raise_exception then
    if sqlerrm='stale generation succeeded for archived group' then raise; end if;
  end;
  begin
    perform public.set_lesson_status('7d300000-0000-4000-8000-000000000001','scheduled');
    raise exception 'stale status action revived lesson in archived group';
  exception when raise_exception then
    if sqlerrm='stale status action revived lesson in archived group' then raise; end if;
  end;
  if (select count(*) from public.lessons where group_id='7d100000-0000-4000-8000-000000000001')<>v_lesson_count
     or (select status from public.lessons where id='7d300000-0000-4000-8000-000000000001')<>'cancelled' then
    raise exception 'archived stale lesson actions changed lesson history';
  end if;
  begin perform public.delete_unused_teacher_group('7d100000-0000-4000-8000-000000000001');
    raise exception 'group with enrollment/lesson history was deleted';
  exception when raise_exception then
    if sqlerrm='group with enrollment/lesson history was deleted' then raise; end if;
  end;
  begin perform public.delete_manual_teacher_lesson('7d300000-0000-4000-8000-000000000001');
    raise exception 'material-bearing lesson was deleted';
  exception when raise_exception then
    if sqlerrm='material-bearing lesson was deleted' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000003';
do $$
begin
  begin perform public.cancel_teacher_group('7d100000-0000-4000-8000-000000000001');
    raise exception 'student cancelled a teacher group';
  exception when raise_exception then if sqlerrm='student cancelled a teacher group' then raise; end if; end;
end $$;
reset role;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7d100000-0000-4000-8000-000000000002','7d000000-0000-4000-8000-000000000001',id,'Unused draft',10,'draft'
from public.offerings order by id limit 1;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values('7d200000-0000-4000-8000-000000000002','7d100000-0000-4000-8000-000000000002',2,'10:00','11:00');
insert into public.lessons(id,group_id,slot_id,local_date,title,starts_at,ends_at,status)
values
 ('7d300000-0000-4000-8000-000000000003','7d100000-0000-4000-8000-000000000002','7d200000-0000-4000-8000-000000000002','2030-01-01','Generated',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled'),
 ('7d300000-0000-4000-8000-000000000004','7d100000-0000-4000-8000-000000000002',null,'2030-01-02','Future manual',now()+interval '3 days',now()+interval '3 days 1 hour','scheduled'),
 ('7d300000-0000-4000-8000-000000000005','7d100000-0000-4000-8000-000000000002',null,'2030-01-03','Object only',now()+interval '4 days',now()+interval '4 days 1 hour','scheduled');
insert into storage.objects(bucket_id,name,metadata) values
 ('lesson-materials','7d000000-0000-4000-8000-000000000001/7d300000-0000-4000-8000-000000000005/01234567-89ab-cdef-0123-456789abcdef.pdf','{}');
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7d100000-0000-4000-8000-000000000003','7d000000-0000-4000-8000-000000000002',id,'Suspended owner draft',10,'draft'
from public.offerings order by id limit 1;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values('7d200000-0000-4000-8000-000000000003','7d100000-0000-4000-8000-000000000003',3,'10:00','11:00');
set local session_replication_role=replica;
update public.profiles set status='suspended' where id='7d000000-0000-4000-8000-000000000002';
set local session_replication_role=origin;

set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000001';
do $$
begin
  begin perform public.delete_manual_teacher_lesson('7d300000-0000-4000-8000-000000000003');
    raise exception 'generated recurring lesson was deleted';
  exception when raise_exception then if sqlerrm='generated recurring lesson was deleted' then raise; end if; end;
  begin perform public.delete_manual_teacher_lesson('7d300000-0000-4000-8000-000000000005');
    raise exception 'lesson with stored object was deleted';
  exception when raise_exception then if sqlerrm='lesson with stored object was deleted' then raise; end if; end;
  perform public.delete_manual_teacher_lesson('7d300000-0000-4000-8000-000000000004');
  if exists(select 1 from public.lessons where id='7d300000-0000-4000-8000-000000000004') then raise exception 'eligible future manual lesson was not deleted'; end if;
  begin perform public.cancel_teacher_group('7d100000-0000-4000-8000-000000000003');
    raise exception 'foreign lesson owner cancelled another group';
  exception when raise_exception then if sqlerrm='foreign lesson owner cancelled another group' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000002';
do $$
begin
  begin perform public.delete_unused_teacher_group('7d100000-0000-4000-8000-000000000003');
    raise exception 'suspended teacher could delete an unused group';
  exception when raise_exception then if sqlerrm='suspended teacher could delete an unused group' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000004';
do $$
begin
  perform public.delete_unused_teacher_group('7d100000-0000-4000-8000-000000000003');
  if exists(select 1 from public.groups where id='7d100000-0000-4000-8000-000000000003')
     or exists(select 1 from public.group_schedule_slots where id='7d200000-0000-4000-8000-000000000003') then
    raise exception 'admin delete did not remove an eligible group and its schedule';
  end if;
end $$;
reset role;

rollback;
