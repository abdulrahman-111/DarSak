\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7a800000-0000-4000-8000-000000000001','authenticated','authenticated','schedule-owner@regression.test','{"full_name":"Schedule owner","requested_role":"teacher"}'),
 ('7a800000-0000-4000-8000-000000000002','authenticated','authenticated','schedule-outsider@regression.test','{"full_name":"Schedule outsider","requested_role":"student"}'),
 ('7a800000-0000-4000-8000-000000000003','authenticated','authenticated','schedule-member@regression.test','{"full_name":"Schedule member","requested_role":"student"}'),
 ('7a800000-0000-4000-8000-000000000004','authenticated','authenticated','schedule-unapproved@regression.test','{"full_name":"Schedule unapproved owner","requested_role":"teacher"}'),
 ('7a800000-0000-4000-8000-000000000005','authenticated','authenticated','schedule-admin@regression.test','{"full_name":"Schedule admin","requested_role":"student"}');

-- Test-only approval setup follows existing application review fixtures.
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='7a800000-0000-4000-8000-000000000001';
update public.teacher_review_state set status='approved',request_id=null,reviewed_at=now()
 where teacher_id='7a800000-0000-4000-8000-000000000001';
update public.profiles set role='admin' where id='7a800000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select f.id,f.teacher_id,o.id,f.name,5,'draft'
from (values
 ('7a810000-0000-4000-8000-000000000001'::uuid,'7a800000-0000-4000-8000-000000000001'::uuid,'Public scheduled group'),
 ('7a810000-0000-4000-8000-000000000002'::uuid,'7a800000-0000-4000-8000-000000000001'::uuid,'Private draft schedule'),
 ('7a810000-0000-4000-8000-000000000003'::uuid,'7a800000-0000-4000-8000-000000000001'::uuid,'Member archived schedule'),
 ('7a810000-0000-4000-8000-000000000004'::uuid,'7a800000-0000-4000-8000-000000000004'::uuid,'Unapproved draft schedule')
) as f(id,teacher_id,name)
cross join lateral (select id from public.offerings order by id limit 1) o;

insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('7a820000-0000-4000-8000-000000000001','7a810000-0000-4000-8000-000000000001',1,'09:00','10:00'),
 ('7a820000-0000-4000-8000-000000000002','7a810000-0000-4000-8000-000000000002',2,'10:00','11:00'),
 ('7a820000-0000-4000-8000-000000000003','7a810000-0000-4000-8000-000000000003',3,'11:00','12:00'),
 ('7a820000-0000-4000-8000-000000000004','7a810000-0000-4000-8000-000000000004',4,'12:00','13:00');

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000001';
select public.publish_group('7a810000-0000-4000-8000-000000000001',null,null);
select public.publish_group('7a810000-0000-4000-8000-000000000003',null,null);
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000003';
select public.request_enrollment('7a810000-0000-4000-8000-000000000003') as enrollment_id \gset
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000001';
select public.decide_enrollment(:'enrollment_id'::uuid,'accepted');
select public.cancel_teacher_group('7a810000-0000-4000-8000-000000000003');
reset role;

set local role anon;
do $$ begin
  if (select count(*) from public.group_schedule_slots where group_id='7a810000-0000-4000-8000-000000000001')<>1 then
    raise exception 'anon could not read the eligible published schedule';
  end if;
  if exists(select 1 from public.group_schedule_slots where group_id in (
    '7a810000-0000-4000-8000-000000000002','7a810000-0000-4000-8000-000000000003','7a810000-0000-4000-8000-000000000004')) then
    raise exception 'anon read a draft, archived, or unapproved schedule';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.group_schedule_slots where group_id='7a810000-0000-4000-8000-000000000001')<>1 then
    raise exception 'signed-in nonmember could not read the eligible published schedule';
  end if;
  if exists(select 1 from public.group_schedule_slots where group_id in (
    '7a810000-0000-4000-8000-000000000002','7a810000-0000-4000-8000-000000000003','7a810000-0000-4000-8000-000000000004')) then
    raise exception 'signed-in nonmember read a draft, archived, or unapproved schedule';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000003';
do $$ begin
  if (select count(*) from public.group_schedule_slots where group_id='7a810000-0000-4000-8000-000000000001')<>1
    or (select count(*) from public.group_schedule_slots where group_id='7a810000-0000-4000-8000-000000000003')<>1 then
    raise exception 'existing accepted-member visibility changed';
  end if;
  if exists(select 1 from public.group_schedule_slots where group_id in (
    '7a810000-0000-4000-8000-000000000002','7a810000-0000-4000-8000-000000000004')) then
    raise exception 'member read a draft or unapproved schedule';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.group_schedule_slots where group_id in (
    '7a810000-0000-4000-8000-000000000001','7a810000-0000-4000-8000-000000000002','7a810000-0000-4000-8000-000000000003'))<>3 then
    raise exception 'owner visibility changed for their published/draft/archived schedules';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a800000-0000-4000-8000-000000000005';
do $$ begin
  if (select count(*) from public.group_schedule_slots where group_id in (
    '7a810000-0000-4000-8000-000000000001','7a810000-0000-4000-8000-000000000002','7a810000-0000-4000-8000-000000000003','7a810000-0000-4000-8000-000000000004'))<>4 then
    raise exception 'admin visibility changed for private schedules';
  end if;
end $$;
reset role;

rollback;
