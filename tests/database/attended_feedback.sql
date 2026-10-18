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


-- No recorded attendance means no review, even with accepted enrollment.
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$declare gid uuid;begin
 select group_id into gid from public.enrollments where student_id=auth.uid();
 if public.my_group_feedback(gid)->>'reason'<>'completed_lesson_required' then raise exception 'missing completed-lesson eligibility reason';end if;
 begin perform public.save_group_feedback(gid,5,'This lesson was useful and clear.',0);raise exception 'unattended student reviewed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into public.lessons(id,group_id,title,local_date,starts_at,ends_at)
select '99100000-0000-4000-8000-000000000001',id,'Past class',(now() at time zone 'Africa/Cairo')::date,now()-interval '2 hours',now()-interval '1 hour' from public.groups where teacher_id=auth.uid();
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by)
values('99100000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','absent','10000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$declare gid uuid;begin
 select group_id into gid from public.enrollments where student_id=auth.uid();
 if public.my_group_feedback(gid)->>'reason'<>'present_or_late_attendance_required' then raise exception 'missing attendance eligibility reason';end if;
 begin perform public.save_group_feedback(gid,5,'This lesson was useful and clear.',0);raise exception 'absent student reviewed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
update public.lesson_attendance set status='late' where student_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$declare gid uuid;v bigint;begin
 select group_id into gid from public.enrollments where student_id=auth.uid();
 if public.my_group_feedback(gid)->>'reason'<>'eligible' or (public.my_group_feedback(gid)->>'eligible')::boolean is not true then raise exception 'present or late attendance did not enable feedback';end if;
 v:=public.save_group_feedback(gid,5,'This lesson was useful and clear.',0);
 if v<>1 then raise exception 'first review version wrong';end if;
 begin perform public.save_group_feedback(gid,4,'This lesson was useful and clear.',0);raise exception 'stale review accepted';exception when serialization_failure then null;end;
 begin perform public.save_group_feedback(gid,6,'This lesson was useful and clear.',1);raise exception 'invalid rating accepted';exception when check_violation then null;end;
 if(public.public_group_feedback(gid)->>'total')::integer<>0 then raise exception 'pending feedback public';end if;
end $$;
reset role;
-- Promote a separate fixture only; preserve existing operator accounts.
set local session_replication_role=replica;
update public.profiles set role='admin' where id='10000000-0000-4000-8000-000000000003';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
do $$declare f jsonb;begin
 f:=public.manage_group_feedback_page(0)->'rows'->0;
 perform public.moderate_group_feedback((f->>'id')::uuid,'approve','private moderation note',(f->>'version')::bigint);
end $$;
reset role;
set local role anon;
set local request.jwt.claim.sub='';
do $$declare gid uuid:='00000000-0000-4000-8000-000000000000';begin
 if has_function_privilege('anon','public.save_group_feedback(uuid,integer,text,bigint)','EXECUTE') then raise exception 'anon can submit';end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$declare f jsonb;p jsonb;begin
 f:=public.manage_group_feedback_page(0)->'rows'->0;
 p:=public.public_group_feedback((f->>'group_id')::uuid);
 if(p->>'total')::int<>1 or p::text like '%student_id%' or p::text like '%private moderation note%' then raise exception 'public projection invalid';end if;
 perform public.teacher_reply_feedback((f->>'id')::uuid,'Thank you for your thoughtful feedback.',(f->>'version')::bigint);
 p:=public.public_group_feedback((f->>'group_id')::uuid);
 if p->'rows'->0->>'reply_public'<>'' then raise exception 'pending reply public';end if;
 begin perform public.moderate_group_feedback((f->>'id')::uuid,'approve','','2');raise exception 'teacher moderated review';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000003';
do $$declare f jsonb;begin
 f:=public.manage_group_feedback_page(0)->'rows'->0;
 perform public.moderate_group_feedback((f->>'id')::uuid,'approve_reply','',(f->>'version')::bigint);
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$declare gid uuid;f jsonb;p jsonb;begin
 select group_id into gid from public.enrollments where student_id=auth.uid();
 f:=public.my_group_feedback(gid)->'own';p:=public.public_group_feedback(gid);
 if p->'rows'->0->>'reply_public'<>'Thank you for your thoughtful feedback.' then raise exception 'approved reply missing';end if;
 perform public.withdraw_group_feedback((f->>'id')::uuid,(f->>'version')::bigint);
 if(public.public_group_feedback(gid)->>'total')::int<>0 then raise exception 'withdrawn review public';end if;
end $$;
reset role;
select 'attended feedback regression passed';rollback;
