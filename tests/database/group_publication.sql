\set ON_ERROR_STOP on
begin;

do $$
declare
  v_source text;
  v_guard_source text;
  v_lock_pos integer;
  v_group_pos integer;
  v_generation_pos integer;
begin
  if to_regprocedure('public.publish_group(uuid,date,date)') is null then
    raise exception 'publish_group(uuid,date,date) is not installed';
  end if;
  if not has_function_privilege('authenticated','public.publish_group(uuid,date,date)','EXECUTE')
     or has_function_privilege('anon','public.publish_group(uuid,date,date)','EXECUTE') then
    raise exception 'publication RPC grants must be authenticated-only';
  end if;
  if (select prosecdef from pg_proc where oid='public.publish_group(uuid,date,date)'::regprocedure) is not true
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid='public.publish_group(uuid,date,date)'::regprocedure) then
    raise exception 'publication RPC must be security definer with fixed search_path';
  end if;
  select prosrc into v_source from pg_proc where oid='public.publish_group(uuid,date,date)'::regprocedure;
  v_lock_pos:=position('pg_advisory_xact_lock' in v_source);
  v_group_pos:=position('for update' in v_source);
  v_generation_pos:=position('generate_lessons' in v_source);
  if v_lock_pos=0 or v_group_pos<=v_lock_pos or v_generation_pos<=v_group_pos then
    raise exception 'publication must lock calendar before group and generate only after locking';
  end if;
  select p.prosrc into v_guard_source from pg_proc p where p.oid='public.validate_group_publish()'::regprocedure;
  if (select prosecdef from pg_proc where oid='public.validate_group_publish()'::regprocedure) is true
     or position('current_user' in v_guard_source)=0
     or position('pg_advisory_xact_lock' in v_guard_source)>0
     or position('perform public.publish_group' in v_guard_source)>0 then
    raise exception 'publication trigger must use actual DB role and remain a nonblocking invoker guard';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('78000000-0000-4000-8000-000000000001','authenticated','authenticated','publish-owner@regression.test','{"full_name":"Publish owner","requested_role":"teacher"}'),
 ('78000000-0000-4000-8000-000000000002','authenticated','authenticated','publish-peer@regression.test','{"full_name":"Publish peer","requested_role":"teacher"}'),
 ('78000000-0000-4000-8000-000000000003','authenticated','authenticated','publish-student@regression.test','{"full_name":"Publish student","requested_role":"student"}'),
 ('78000000-0000-4000-8000-000000000004','authenticated','authenticated','publish-unapproved@regression.test','{"full_name":"Publish unapproved","requested_role":"teacher"}');

set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id in (
 '78000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000002'
);
set local session_replication_role = origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select f.id,f.teacher_id,o.id,f.name,5,'draft'
from (values
 ('78100000-0000-4000-8000-000000000001'::uuid,'78000000-0000-4000-8000-000000000001'::uuid,'Publish no slots'),
 ('78100000-0000-4000-8000-000000000002'::uuid,'78000000-0000-4000-8000-000000000001'::uuid,'Publish no generation'),
 ('78100000-0000-4000-8000-000000000003'::uuid,'78000000-0000-4000-8000-000000000002'::uuid,'Publish with generation'),
 ('78100000-0000-4000-8000-000000000004'::uuid,'78000000-0000-4000-8000-000000000002'::uuid,'Publish rollback conflict'),
 ('78100000-0000-4000-8000-000000000005'::uuid,'78000000-0000-4000-8000-000000000001'::uuid,'Publish direct bypass'),
 ('78100000-0000-4000-8000-000000000007'::uuid,'78000000-0000-4000-8000-000000000004'::uuid,'Publish unapproved')
) as f(id,teacher_id,name)
cross join lateral (select id from public.offerings order by id limit 1) o;

insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('78200000-0000-4000-8000-000000000001','78100000-0000-4000-8000-000000000002',0,'09:00','10:00'),
 ('78200000-0000-4000-8000-000000000002','78100000-0000-4000-8000-000000000003',0,'11:00','12:00'),
 ('78200000-0000-4000-8000-000000000003','78100000-0000-4000-8000-000000000004',0,'13:00','14:00'),
 ('78200000-0000-4000-8000-000000000004','78100000-0000-4000-8000-000000000005',0,'15:00','16:00'),
 ('78200000-0000-4000-8000-000000000005','78100000-0000-4000-8000-000000000007',0,'17:00','18:00');

set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000001';
do $$
declare
 v_generated integer;
 v_denied boolean;
begin
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000001',null,null);
  raise exception 'publishing without a schedule slot succeeded';
 exception when others then
  if sqlerrm='publishing without a schedule slot succeeded' then raise; end if;
 end;
 v_denied:=not exists(select 1 from public.groups where id='78100000-0000-4000-8000-000000000001' and status='published');
 if not v_denied then raise exception 'group without a slot changed status'; end if;

 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000002',null,null);
 exception when others then raise exception 'valid no-range publication failed: %',sqlerrm; end;
 if not exists(select 1 from public.groups where id='78100000-0000-4000-8000-000000000002' and status='published') then
  raise exception 'no-range publication did not publish';
 end if;
 begin
  update public.groups set description='Published metadata edit' where id='78100000-0000-4000-8000-000000000002';
  raise exception 'owner raw edit of a published group succeeded';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.groups where id='78100000-0000-4000-8000-000000000002' and description='Published metadata edit') then
  raise exception 'owner raw edit of a published group changed the row';
 end if;

 begin
  update public.groups set status='published' where id='78100000-0000-4000-8000-000000000005';
  raise exception 'direct published transition bypass succeeded';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
  select '78100000-0000-4000-8000-000000000006','78000000-0000-4000-8000-000000000001',id,'Direct insert bypass',5,'published'
  from public.offerings order by id limit 1;
  raise exception 'direct published insert bypass succeeded';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000002';
do $$
declare
 v_generated integer;
begin
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000003',null,'2027-06-06');
  raise exception 'one-sided publication range succeeded';
 exception when others then
  if sqlerrm='one-sided publication range succeeded' then raise; end if;
 end;
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000003','2027-06-06','2027-06-06');
 exception when others then raise exception 'valid ranged publication failed: %',sqlerrm; end;
 select count(*) into v_generated from public.lessons where group_id='78100000-0000-4000-8000-000000000003' and local_date='2027-06-06';
 if v_generated<>1 or not exists(select 1 from public.groups where id='78100000-0000-4000-8000-000000000003' and status='published') then
  raise exception 'ranged publication did not atomically publish one generated lesson';
 end if;

end $$;
reset role;

insert into public.lessons(group_id,title,starts_at,ends_at)
values ('78100000-0000-4000-8000-000000000003','Existing teacher conflict','2027-06-06 10:30+00','2027-06-06 11:30+00');

set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000002';
do $$
begin
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000004','2027-06-06','2027-06-06');
  raise exception 'conflicting ranged publication succeeded';
 exception when others then
  if sqlerrm='conflicting ranged publication succeeded' then raise; end if;
 end;
 if not exists(select 1 from public.groups where id='78100000-0000-4000-8000-000000000004' and status='draft')
    or exists(select 1 from public.lessons where group_id='78100000-0000-4000-8000-000000000004') then
  raise exception 'conflicting publication left partial status or generated lessons';
 end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000001';
do $$
begin
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000003',null,null);
  raise exception 'foreign teacher published a group';
 exception when others then
  if sqlerrm='foreign teacher published a group' then raise; end if;
 end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000003';
do $$
begin
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000002',null,null);
  raise exception 'student published a group';
 exception when others then
  if sqlerrm='student published a group' then raise; end if;
 end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000004';
do $$
begin
 begin
  perform public.publish_group('78100000-0000-4000-8000-000000000007',null,null);
  raise exception 'unapproved teacher published a group';
 exception when others then
  if sqlerrm='unapproved teacher published a group' then raise; end if;
 end;
end $$;
reset role;

set local session_replication_role = replica;
update public.profiles set role='admin' where id='78000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub='78000000-0000-4000-8000-000000000003';
do $$
declare
 v_generated integer;
begin
 select public.publish_group('78100000-0000-4000-8000-000000000005',null,null) into v_generated;
 if v_generated<>0 or not exists(select 1 from public.groups where id='78100000-0000-4000-8000-000000000005' and status='published') then
  raise exception 'active admin could not publish a valid scheduled group';
 end if;
end $$;
reset role;

rollback;
select 'atomic publication assertions passed' as result;
