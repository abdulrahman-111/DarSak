\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.group_enrollment_page(uuid,integer,integer)') is null
     or not has_function_privilege('authenticated','public.group_enrollment_page(uuid,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.group_enrollment_page(uuid,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.group_enrollment_page(uuid,integer,integer)','EXECUTE') then
    raise exception 'group enrollment page signature or grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('7f000000-0000-4000-8000-' || lpad((i + 1)::text, 12, '0'))::uuid,
  'authenticated','authenticated','roster-student-'||i||'@test.invalid',
  jsonb_build_object('full_name','Roster Student '||lpad(i::text,2,'0'),'requested_role','student')
from generate_series(1, 22) i;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7e000000-0000-4000-8000-000000000001','authenticated','authenticated','roster-owner@test.invalid','{"full_name":"Roster owner","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000002','authenticated','authenticated','roster-foreign@test.invalid','{"full_name":"Foreign teacher","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000003','authenticated','authenticated','roster-suspended@test.invalid','{"full_name":"Suspended owner","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000004','authenticated','authenticated','roster-admin@test.invalid','{"full_name":"Roster admin","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='7e000000-0000-4000-8000-000000000004';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000001',o.id,'Roster group',30,'draft'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000002','7e000000-0000-4000-8000-000000000002',o.id,'Foreign roster group',30,'draft'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000003','7e000000-0000-4000-8000-000000000003',o.id,'Suspended roster group',30,'draft'
from public.offerings o order by o.id limit 1;
set local session_replication_role=replica;
update public.profiles set status='suspended' where id='7e000000-0000-4000-8000-000000000003';
set local session_replication_role=origin;

insert into public.enrollments(id,group_id,student_id,status,created_at)
select ('7e200000-0000-4000-8000-' || lpad((i + 1)::text, 12, '0'))::uuid,
  '7e100000-0000-4000-8000-000000000001',
  ('7f000000-0000-4000-8000-' || lpad((i + 1)::text, 12, '0'))::uuid,
  case when i % 5=0 then 'accepted'::public.enrollment_status
       when i % 5=1 then 'pending'::public.enrollment_status
       when i % 5=2 then 'rejected'::public.enrollment_status
       when i % 5=3 then 'cancelled'::public.enrollment_status
       else 'removed'::public.enrollment_status end,
  '2026-01-01 00:00:00+00'::timestamptz + (((i - 1) / 2) * interval '1 minute')
from generate_series(1,22) i;
insert into public.enrollments(id,group_id,student_id,status)
values ('7e200000-0000-4000-8000-000000000030','7e100000-0000-4000-8000-000000000002',
  '7f000000-0000-4000-8000-000000000002','accepted');

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$
declare v_first jsonb; v_second jsonb; v_last jsonb;
begin
  v_first:=public.group_enrollment_page('7e100000-0000-4000-8000-000000000001',0,20);
  v_second:=public.group_enrollment_page('7e100000-0000-4000-8000-000000000001',20,20);
  v_last:=public.group_enrollment_page('7e100000-0000-4000-8000-000000000001',40,20);
  if (v_first->>'total')::integer<>22 or (v_second->>'total')::integer<>22
     or jsonb_array_length(v_first->'rows')<>20 or jsonb_array_length(v_second->'rows')<>2
     or jsonb_array_length(v_last->'rows')<>0 then
    raise exception 'roster pages or stable counts are incorrect';
  end if;
  if v_first->'rows'->0->>'enrollment_id'<>'7e200000-0000-4000-8000-000000000002'
     or v_first->'rows'->1->>'enrollment_id'<>'7e200000-0000-4000-8000-000000000003' then
    raise exception 'roster ordering did not use created_at and id as a stable tie-breaker';
  end if;
  if (select count(distinct r->>'status') from jsonb_array_elements(v_first->'rows') r)<>5
     or (v_first->'rows'->0 ? 'group_id') then
    raise exception 'roster omitted statuses or returned unnecessary group identifiers';
  end if;
  begin perform public.group_enrollment_page('7e100000-0000-4000-8000-000000000001',-1,20);
    raise exception 'negative offset was accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.group_enrollment_page('7e100000-0000-4000-8000-000000000001',0,101);
    raise exception 'oversized page was accepted';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000004';
do $$ declare v_page jsonb;
begin
  v_page:=public.group_enrollment_page('7e100000-0000-4000-8000-000000000002');
  if (v_page->>'total')::integer<>1 then raise exception 'active admin could not inspect another group roster'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000002';
do $$ begin
  begin perform public.group_enrollment_page('7e100000-0000-4000-8000-000000000001');
    raise exception 'foreign teacher read a group roster';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000003';
do $$ begin
  begin perform public.group_enrollment_page('7e100000-0000-4000-8000-000000000003');
    raise exception 'suspended owner read a group roster';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000001';
do $$ begin
  begin perform public.group_enrollment_page('7e100000-0000-4000-8000-000000000001');
    raise exception 'student read a group roster';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
select 'group enrollment page SQL assertions passed' as result;
