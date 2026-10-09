\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.delete_schedule_slot(uuid,uuid)') is null then
    raise exception 'delete_schedule_slot(uuid,uuid) is not installed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('56000000-0000-4000-8000-000000000001','authenticated','authenticated','slot-delete-owner@regression.test','{"full_name":"Slot delete owner","requested_role":"teacher"}'),
 ('56000000-0000-4000-8000-000000000002','authenticated','authenticated','slot-delete-other@regression.test','{"full_name":"Slot delete other","requested_role":"teacher"}'),
 ('56000000-0000-4000-8000-000000000003','authenticated','authenticated','slot-delete-admin@regression.test','{"full_name":"Slot delete admin","requested_role":"teacher"}');

set local session_replication_role = replica;
update public.profiles set role='admin' where id='56000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select g.id,g.teacher_id,o.id,g.name,5,g.status::public.group_status
from (values
 ('56100000-0000-4000-8000-000000000001'::uuid,'56000000-0000-4000-8000-000000000001'::uuid,'Deletion referenced','draft'),
 ('56100000-0000-4000-8000-000000000002'::uuid,'56000000-0000-4000-8000-000000000001'::uuid,'Deletion draft last','draft'),
 ('56100000-0000-4000-8000-000000000003'::uuid,'56000000-0000-4000-8000-000000000001'::uuid,'Deletion published','draft'),
 ('56100000-0000-4000-8000-000000000004'::uuid,'56000000-0000-4000-8000-000000000002'::uuid,'Deletion foreign','draft')
) as g(id,teacher_id,name,status)
cross join lateral (select id from public.offerings limit 1) o;

insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('56200000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000001',0,'08:00','09:00'),
 ('56200000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000001',1,'08:00','09:00'),
 ('56200000-0000-4000-8000-000000000003','56100000-0000-4000-8000-000000000001',2,'08:00','09:00'),
 ('56200000-0000-4000-8000-000000000004','56100000-0000-4000-8000-000000000002',3,'08:00','09:00'),
 ('56200000-0000-4000-8000-000000000005','56100000-0000-4000-8000-000000000003',4,'08:00','09:00'),
 ('56200000-0000-4000-8000-000000000006','56100000-0000-4000-8000-000000000003',5,'08:00','09:00'),
 ('56200000-0000-4000-8000-000000000007','56100000-0000-4000-8000-000000000004',6,'08:00','09:00');

insert into public.lessons(id,group_id,slot_id,local_date,title,starts_at,ends_at,status) values
 ('56300000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000001','56200000-0000-4000-8000-000000000001','2027-02-07','Scheduled occurrence','2027-02-07 06:00+00','2027-02-07 07:00+00','scheduled'),
 ('56300000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000001','56200000-0000-4000-8000-000000000002','2027-02-08','Cancelled occurrence','2027-02-08 06:00+00','2027-02-08 07:00+00','cancelled'),
 ('56300000-0000-4000-8000-000000000003','56100000-0000-4000-8000-000000000001','56200000-0000-4000-8000-000000000003','2027-02-09','Completed occurrence','2027-02-09 06:00+00','2027-02-09 07:00+00','completed');

-- Future publication checks may add guards; fixture state deliberately uses the same valid group/slot rows.
set local session_replication_role = replica;
update public.groups set status='published' where id='56100000-0000-4000-8000-000000000003';
set local session_replication_role = origin;

do $$
declare
  v_source text;
  v_advisory_pos integer;
  v_group_lock_pos integer;
  v_slot_lock_pos integer;
begin
  if not has_function_privilege('authenticated','public.delete_schedule_slot(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.delete_schedule_slot(uuid,uuid)','EXECUTE') then
    raise exception 'delete schedule slot grants must be authenticated-only';
  end if;
  if (select prosecdef from pg_proc where oid='public.delete_schedule_slot(uuid,uuid)'::regprocedure) is not true
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid='public.delete_schedule_slot(uuid,uuid)'::regprocedure) then
    raise exception 'delete RPC must be security definer with a fixed search_path';
  end if;
  select p.prosrc into v_source from pg_proc p where p.oid='public.delete_schedule_slot(uuid,uuid)'::regprocedure;
  v_advisory_pos:=position('pg_advisory_xact_lock' in v_source);
  v_group_lock_pos:=position('for update' in v_source);
  v_slot_lock_pos:=position('for update' in substring(v_source from v_group_lock_pos+1));
  if v_advisory_pos=0 or v_group_lock_pos<=v_advisory_pos or v_slot_lock_pos=0 then
    raise exception 'calendar advisory lock must precede group and slot row locks';
  end if;
  if has_table_privilege('authenticated','public.group_schedule_slots','DELETE') then
    raise exception 'authenticated users can directly delete schedule slots';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '56000000-0000-4000-8000-000000000001';
do $$
declare
  v_slot uuid;
begin
  foreach v_slot in array array[
    '56200000-0000-4000-8000-000000000001'::uuid,
    '56200000-0000-4000-8000-000000000002'::uuid,
    '56200000-0000-4000-8000-000000000003'::uuid
  ] loop
    begin
      perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000001',v_slot);
      raise exception 'referenced slot % was deleted',v_slot;
    exception when others then
      if sqlerrm='referenced slot '||v_slot||' was deleted' then raise; end if;
      if position('schedule slot has generated lessons' in sqlerrm)=0 then raise; end if;
    end;
    if not exists(select 1 from public.group_schedule_slots where id=v_slot)
       or not exists(select 1 from public.lessons where slot_id=v_slot) then
      raise exception 'rejected deletion changed referenced slot/lesson identity';
    end if;
  end loop;

  begin
    perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000001','56200000-0000-4000-8000-000000000007');
    raise exception 'owner deleted a slot from another group';
  exception when others then
    if sqlerrm='owner deleted a slot from another group' then raise; end if;
    if position('slot belongs to another group' in sqlerrm)=0 then raise; end if;
  end;

  begin
    perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000004','56200000-0000-4000-8000-000000000007');
    raise exception 'foreign teacher deleted another teacher slot';
  exception when others then
    if sqlerrm='foreign teacher deleted another teacher slot' then raise; end if;
    if position('not authorized' in sqlerrm)=0 then raise; end if;
  end;

  perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000002','56200000-0000-4000-8000-000000000004');
  if exists(select 1 from public.group_schedule_slots where id='56200000-0000-4000-8000-000000000004') then
    raise exception 'owner could not delete the last slot from a draft group';
  end if;

  perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000003','56200000-0000-4000-8000-000000000005');
  if exists(select 1 from public.group_schedule_slots where id='56200000-0000-4000-8000-000000000005') then
    raise exception 'owner could not delete one of multiple published slots';
  end if;
  begin
    perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000003','56200000-0000-4000-8000-000000000006');
    raise exception 'owner deleted the last published group slot';
  exception when others then
    if sqlerrm='owner deleted the last published group slot' then raise; end if;
    if position('published group must keep at least one schedule slot' in sqlerrm)=0 then raise; end if;
  end;
  if not exists(select 1 from public.group_schedule_slots where id='56200000-0000-4000-8000-000000000006') then
    raise exception 'rejected last published-slot deletion removed its slot';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '56000000-0000-4000-8000-000000000003';
do $$
begin
  perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000004','56200000-0000-4000-8000-000000000007');
  if exists(select 1 from public.group_schedule_slots where id='56200000-0000-4000-8000-000000000007') then
    raise exception 'admin could not delete a schedule slot';
  end if;
end $$;
reset role;

set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.delete_schedule_slot('56100000-0000-4000-8000-000000000002','56200000-0000-4000-8000-000000000004');
    raise exception 'anonymous could execute delete RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'schedule slot deletion assertions passed' as result;
rollback;
