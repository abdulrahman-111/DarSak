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

set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 0 then
    raise exception 'anonymous read enrolled-only teacher contact';
  end if;
  if public.can_read_teacher_contacts('10000000-0000-4000-8000-000000000001') then
    raise exception 'anonymous contact helper returned true for enrolled-only contact';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 1 then
    raise exception 'accepted active student cannot read enrolled-only contact';
  end if;
end $$;
reset role;

update public.enrollments set status='rejected' where student_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.teacher_contacts) then raise exception 'rejected enrollment retained contact access'; end if;
end $$;
reset role;
update public.enrollments set status='cancelled' where student_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.teacher_contacts) then raise exception 'cancelled enrollment retained contact access'; end if;
end $$;
reset role;
update public.enrollments set status='removed' where student_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.teacher_contacts) then raise exception 'removed enrollment retained contact access'; end if;
end $$;
reset role;
update public.enrollments set status='accepted' where student_id='10000000-0000-4000-8000-000000000002';

update public.enrollments set status='pending' where student_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.teacher_contacts) then raise exception 'pending enrollment retained contact access'; end if;
end $$;
reset role;
update public.enrollments set status='accepted' where student_id='10000000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 0 then
    raise exception 'pending student read enrolled-only contact';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 1 then
    raise exception 'teacher cannot read own contact row';
  end if;
end $$;
reset role;

update public.teacher_contacts set visibility='public'
where teacher_id='10000000-0000-4000-8000-000000000001';
do $$ begin
  if (select visibility <> 'enrolled' from public.teacher_contacts where teacher_id='10000000-0000-4000-8000-000000000001') then
    raise exception 'legacy public visibility was not normalized on write';
  end if;
end $$;
set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 0 then
    raise exception 'legacy public visibility exposed contacts to anonymous viewer';
  end if;
end $$;
reset role;

set local session_replication_role = replica;
update public.teacher_profiles set approved=false where id='10000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 0 then
    raise exception 'unapproved teacher contact became public';
  end if;
end $$;
reset role;

set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id='10000000-0000-4000-8000-000000000001';
update public.profiles set status='suspended' where id='10000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(*) from public.teacher_contacts) <> 0 then
    raise exception 'suspended teacher read own contacts';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
do $$
begin
  begin
    insert into public.teacher_contacts(teacher_id,phone_number)
    values ('10000000-0000-4000-8000-000000000001','+201234567890');
    raise exception 'foreign teacher inserted a contact row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  begin
    insert into public.teacher_contacts(teacher_id,phone_number)
    values ('10000000-0000-4000-8000-000000000001','12345678');
    raise exception 'invalid E.164 phone accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.teacher_contacts(teacher_id,contact_email)
    values ('10000000-0000-4000-8000-000000000001',repeat('a',250)||'@example.test');
    raise exception 'overlong contact email accepted';
  exception when check_violation then null;
  end;
  if (select phone_number is distinct from '+201234567890' or whatsapp_number is not null
      from public.teacher_contacts where teacher_id='10000000-0000-4000-8000-000000000001') then
    raise exception 'blank phone values were not normalized to NULL';
  end if;
end $$;

select 'teacher contact privacy assertions passed' as result;
rollback;
