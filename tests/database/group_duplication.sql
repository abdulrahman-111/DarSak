\set ON_ERROR_STOP on
begin;

do $$
declare
  v_source text;
  v_lock_pos integer;
  v_group_lock_pos integer;
  v_fresh_auth_pos integer;
begin
  if to_regprocedure('public.duplicate_group(uuid)') is null then
    raise exception 'duplicate_group(uuid) is not installed';
  end if;
  if not has_function_privilege('authenticated','public.duplicate_group(uuid)','EXECUTE')
     or has_function_privilege('anon','public.duplicate_group(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.duplicate_group(uuid)','EXECUTE') then
    raise exception 'duplicate RPC grants must be authenticated-only without service-role execution';
  end if;
  if (select prosecdef from pg_proc where oid='public.duplicate_group(uuid)'::regprocedure) is not true
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid='public.duplicate_group(uuid)'::regprocedure) then
    raise exception 'duplicate RPC must be security definer with fixed search_path';
  end if;
  select prosrc into v_source from pg_proc where oid='public.duplicate_group(uuid)'::regprocedure;
  v_lock_pos:=position('pg_advisory_xact_lock' in v_source);
  v_group_lock_pos:=position('for update' in v_source);
  v_fresh_auth_pos:=position('v_actor_role:=public.current_role()' in substring(v_source from v_group_lock_pos));
  if v_lock_pos=0 or v_group_lock_pos<=v_lock_pos or v_fresh_auth_pos=0 then
    raise exception 'duplicate must take calendar lock before source group lock and recheck authorization afterward';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('79000000-0000-4000-8000-000000000001','authenticated','authenticated','duplicate-owner@regression.test','{"full_name":"Duplicate owner","requested_role":"teacher"}'),
 ('79000000-0000-4000-8000-000000000002','authenticated','authenticated','duplicate-peer@regression.test','{"full_name":"Duplicate peer","requested_role":"teacher"}'),
 ('79000000-0000-4000-8000-000000000003','authenticated','authenticated','duplicate-student@regression.test','{"full_name":"Duplicate student","requested_role":"student"}');

set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000002');
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
select f.id,f.teacher_id,o.id,f.name,f.description,f.capacity,f.status,f.location
from (values
 ('79100000-0000-4000-8000-000000000001'::uuid,'79000000-0000-4000-8000-000000000001'::uuid,repeat('N',120)||'     ','Private source details',23,'draft'::public.group_status,'Room source'),
 ('79100000-0000-4000-8000-000000000002'::uuid,'79000000-0000-4000-8000-000000000002'::uuid,'Foreign source','Foreign details',7,'draft'::public.group_status,'Foreign room')
) as f(id,teacher_id,name,description,capacity,status,location)
cross join lateral (select id from public.offerings order by id limit 1) o;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values ('79200000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000001',0,'10:00','11:00');

set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000001';
select public.publish_group('79100000-0000-4000-8000-000000000001',null,null);
insert into public.enrollments(group_id,student_id,status)
values ('79100000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000003','accepted');
insert into public.lessons(id,group_id,slot_id,local_date,title,starts_at,ends_at)
values ('79300000-0000-4000-8000-000000000001','79100000-0000-4000-8000-000000000001','79200000-0000-4000-8000-000000000001','2027-02-07','Private source lesson','2027-02-07 08:00+00','2027-02-07 09:00+00');
insert into public.lesson_materials(lesson_id,kind,title,content,uploaded_by)
values ('79300000-0000-4000-8000-000000000001','note','Private source material','Do not copy me','79000000-0000-4000-8000-000000000001');
insert into public.group_lesson_exclusions(group_id,local_date)
values ('79100000-0000-4000-8000-000000000001','2027-02-14');

set local role authenticated;
set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000001';
do $$
declare
  v_duplicate uuid;
  v_source public.groups;
  v_copy public.groups;
begin
  select * into v_source from public.groups where id='79100000-0000-4000-8000-000000000001';
  v_duplicate:=public.duplicate_group(v_source.id);
  select * into v_copy from public.groups where id=v_duplicate;
  if v_copy.teacher_id is distinct from v_source.teacher_id
     or v_copy.offering_id is distinct from v_source.offering_id
     or v_copy.description is distinct from v_source.description
     or v_copy.capacity is distinct from v_source.capacity
     or v_copy.location is distinct from v_source.location
     or v_copy.status is distinct from 'draft'::public.group_status then
    raise exception 'duplicate did not copy only the expected editable group details';
  end if;
  if length(v_copy.name) not between 2 and 120 or right(v_copy.name,7)<>' (copy)' then
    raise exception 'duplicate name suffix was not trimmed to the 2..120 character bound';
  end if;
  if v_copy.name<>left(rtrim(btrim(v_source.name)),113)||' (copy)' then
    raise exception 'duplicate name did not preserve a trimmed source prefix and suffix';
  end if;
  if exists(select 1 from public.group_schedule_slots s where s.group_id=v_duplicate)
     or exists(select 1 from public.enrollments e where e.group_id=v_duplicate)
     or exists(select 1 from public.lessons l where l.group_id=v_duplicate)
     or exists(select 1 from public.group_lesson_exclusions e where e.group_id=v_duplicate)
     or exists(select 1 from public.lesson_materials m join public.lessons l on l.id=m.lesson_id where l.group_id=v_duplicate) then
    raise exception 'duplicate copied schedule or private/history rows';
  end if;
  if (select count(*) from public.groups where id=v_source.id)<>1
     or (select count(*) from public.group_schedule_slots where group_id=v_source.id)<>1
     or (select count(*) from public.enrollments where group_id=v_source.id)<>1
     or (select count(*) from public.lessons where group_id=v_source.id)<>1
     or (select count(*) from public.group_lesson_exclusions where group_id=v_source.id)<>1 then
    raise exception 'source group changed during duplication';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    perform public.duplicate_group('79100000-0000-4000-8000-000000000002');
    raise exception 'foreign source duplication succeeded';
  exception when others then
    if sqlerrm='foreign source duplication succeeded' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000003';
do $$
begin
  begin
    perform public.duplicate_group('79100000-0000-4000-8000-000000000001');
    raise exception 'student source duplication succeeded';
  exception when others then
    if sqlerrm='student source duplication succeeded' then raise; end if;
  end;
end $$;
reset role;

set local session_replication_role=replica;
update public.profiles set role='admin' where id='79000000-0000-4000-8000-000000000003';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000003';
do $$
declare
  v_duplicate uuid;
begin
  v_duplicate:=public.duplicate_group('79100000-0000-4000-8000-000000000002');
  if not exists(select 1 from public.groups where id=v_duplicate and teacher_id='79000000-0000-4000-8000-000000000002' and status='draft') then
    raise exception 'admin duplicate did not remain owned by source teacher as draft';
  end if;
  if exists(select 1 from public.group_schedule_slots where group_id=v_duplicate) then
    raise exception 'admin duplicate copied source slots';
  end if;
end $$;
reset role;

rollback;
select 'group duplication assertions passed' as result;
