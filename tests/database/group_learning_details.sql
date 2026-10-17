\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='teacher_contacts' and c.relrowsecurity
  ) then raise exception 'teacher_contacts table with RLS missing'; end if;
  if not has_function_privilege('anon','public.can_read_teacher_contacts(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_read_teacher_contacts(uuid)','EXECUTE') then
    raise exception 'narrow contact-read helper grants missing';
  end if;
  if has_function_privilege('anon','public.save_teacher_profile(text,text,text,uuid[],text,text,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.save_teacher_profile(text,text,text,uuid[],text,text,text,text)','EXECUTE') then
    raise exception 'profile-save RPC grants are too broad or missing';
  end if;
  if has_table_privilege('anon','public.teacher_contacts','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.teacher_contacts','TRUNCATE') then
    raise exception 'contact table write grants are too broad';
  end if;
  if (select provolatile from pg_proc where oid='public.can_read_teacher_contacts(uuid)'::regprocedure) <> 's'
     or not (select prosecdef from pg_proc where oid='public.can_read_teacher_contacts(uuid)'::regprocedure)
     or not (select proconfig @> array['search_path=pg_catalog, public, auth'] from pg_proc where oid='public.can_read_teacher_contacts(uuid)'::regprocedure) then
    raise exception 'contact helper must be stable security definer with fixed search_path';
  end if;
  if (select proargnames from pg_proc where oid='public.save_teacher_profile(text,text,text,uuid[],text,text,text,text)'::regprocedure)
     is distinct from array['p_full_name','p_headline','p_bio','p_offering_ids','p_phone_number','p_whatsapp_number','p_contact_email','p_visibility']::text[] then
    raise exception 'profile-save RPC signature changed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','contacts-teacher@regression.test','{"full_name":"Contact teacher","requested_role":"teacher"}'),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','contacts-student@regression.test','{"full_name":"Contact student","requested_role":"student"}'),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','contacts-pending@regression.test','{"full_name":"Pending student","requested_role":"student"}');

-- Fixture-only state changes bypass the admin-managed mutation triggers.
set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id='10000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
insert into public.groups(teacher_id,offering_id,name,capacity,status)
select '10000000-0000-4000-8000-000000000001', id, 'Contact access group', 5, 'draft'
from public.offerings limit 1;
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
select g.id,0,'10:00','11:00' from public.groups g
where g.teacher_id='10000000-0000-4000-8000-000000000001' and g.name='Contact access group';
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select public.publish_group(g.id,null,null)
from public.groups g where g.teacher_id='10000000-0000-4000-8000-000000000001' and g.name='Contact access group';
reset role;
insert into public.enrollments(group_id,student_id,status)
select g.id, '10000000-0000-4000-8000-000000000002', 'accepted'
from public.groups g where g.teacher_id='10000000-0000-4000-8000-000000000001' and g.name='Contact access group';
insert into public.enrollments(group_id,student_id,status)
select g.id, '10000000-0000-4000-8000-000000000003', 'pending'
from public.groups g where g.teacher_id='10000000-0000-4000-8000-000000000001' and g.name='Contact access group';
insert into public.teacher_contacts(teacher_id,phone_number,whatsapp_number,contact_email)
values ('10000000-0000-4000-8000-000000000001','+201234567890','   ','teacher-contact@regression.test');


set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$ declare gid uuid; version timestamptz; copyid uuid;
begin
 select id into gid from public.groups where teacher_id=auth.uid();
 version:=public.save_group_learning_details(gid,'{"outcomes":"Build programs","prerequisites":"Basic reading","delivery_mode":"online","fee_egp":100,"fee_basis":"month","fee_includes":"Practice"}',null);
 begin perform public.save_group_learning_details(gid,'{}',null); raise exception 'stale save accepted'; exception when serialization_failure then null; end;
 begin perform public.save_group_learning_details(gid,'{"fee_egp":100}',version); raise exception 'fee without unit accepted'; exception when check_violation then null; end;
 copyid:=public.duplicate_group(gid);
 if not exists(select 1 from public.group_learning_details where group_id=copyid and fee_egp=100 and outcomes='Build programs') then raise exception 'duplicate lost details'; end if;
end $$;
reset role;
set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
 if (select count(*) from public.group_learning_details)<>1 then raise exception 'anonymous cannot see published details or saw draft'; end if;
 if not exists(select 1 from public.group_learning_details where fee_egp=100) then raise exception 'public fee missing'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ declare gid uuid; version timestamptz;
begin
 select group_id,updated_at into gid,version from public.group_learning_details limit 1;
 begin perform public.save_group_learning_details(gid,'{}',version); raise exception 'student changed details'; exception when insufficient_privilege then null; end;
 begin update public.group_learning_details set fee_egp=0; raise exception 'direct update allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'group learning details regression passed';
rollback;
