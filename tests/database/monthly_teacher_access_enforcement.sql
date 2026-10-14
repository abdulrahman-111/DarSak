\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('public.is_group_owner(uuid)') is null
    or to_regprocedure('dars_private.guard_teacher_teaching_write()') is null
    or not has_schema_privilege('anon','dars_private','USAGE')
    or not has_function_privilege('anon','dars_private.teacher_has_access(uuid)','EXECUTE')
    or has_function_privilege('service_role','dars_private.teacher_has_access(uuid)','EXECUTE') then
    raise exception 'monthly enforcement helper ACL/signature is unsafe';
  end if;
  if (select prosecdef from pg_proc where oid='dars_private.lesson_generation_candidates(uuid,date,date)'::regprocedure) is distinct from true
    or has_function_privilege('authenticated','dars_private.lesson_generation_candidates(uuid,date,date)','EXECUTE') then
    raise exception 'lesson candidate engine must remain internal-only';
  end if;
end $$;

set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('9c000000-0000-4000-8000-000000000001','authenticated','authenticated','expired-enforcement@test.invalid','{}'),
 ('9c000000-0000-4000-8000-000000000002','authenticated','authenticated','current-enforcement@test.invalid','{}'),
 ('9c000000-0000-4000-8000-000000000003','authenticated','authenticated','student-enforcement@test.invalid','{}'),
 ('9c000000-0000-4000-8000-000000000004','authenticated','authenticated','admin-enforcement@test.invalid','{}');
insert into public.profiles(id,full_name,role,status) values
 ('9c000000-0000-4000-8000-000000000001','Expired enforcement teacher','teacher','active'),
 ('9c000000-0000-4000-8000-000000000002','Current enforcement teacher','teacher','active'),
 ('9c000000-0000-4000-8000-000000000003','Enforcement student','student','active'),
 ('9c000000-0000-4000-8000-000000000004','Enforcement admin','admin','active');
set local session_replication_role=origin;
insert into public.teacher_profiles(id,approved) values
 ('9c000000-0000-4000-8000-000000000001',true),('9c000000-0000-4000-8000-000000000002',false);
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '9c100000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001',id,'Expired published group',5,'draft'
from public.offerings order by id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '9c100000-0000-4000-8000-000000000002','9c000000-0000-4000-8000-000000000002',id,'Pending teacher draft',5,'draft'
from public.offerings order by id limit 1;
set local session_replication_role=replica;
insert into public.subjects(id,name_ar,name_en,slug,owner_teacher_id)
values('9c400000-0000-4000-8000-000000000001','Expired subject','Expired subject','9c400000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001');
insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id)
values('9c400000-0000-4000-8000-000000000002',null,'student_category','Expired category','Expired category','9c400000-0000-4000-8000-000000000002','9c000000-0000-4000-8000-000000000001');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id)
values('9c400000-0000-4000-8000-000000000003','9c400000-0000-4000-8000-000000000002','9c400000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001');
update public.groups set offering_id='9c400000-0000-4000-8000-000000000003' where id='9c100000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values('9c200000-0000-4000-8000-000000000001','9c100000-0000-4000-8000-000000000001',1,'10:00','11:00');
update public.groups set status='published' where id='9c100000-0000-4000-8000-000000000001';
insert into public.lessons(id,group_id,local_date,title,starts_at,ends_at,status)
values('9c300000-0000-4000-8000-000000000001','9c100000-0000-4000-8000-000000000001',current_date,'Accepted history',now()-interval '1 hour',now()+interval '1 hour','completed');
insert into public.enrollments(group_id,student_id,status)
values('9c100000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000003','accepted');
insert into public.student_saved_groups(student_id,group_id)
values('9c000000-0000-4000-8000-000000000003','9c100000-0000-4000-8000-000000000001');
insert into public.user_notifications(recipient_id,kind,event_key,payload)
values('9c000000-0000-4000-8000-000000000001','teacher_review_requested','enforcement-test','{}');
insert into dars_private.teacher_cover_objects(bucket_id,name)
values('teacher-avatars','9c000000-0000-4000-8000-000000000001/cover/9c500000-0000-4000-8000-000000000001.png');
insert into public.lesson_materials(lesson_id,kind,title,storage_path,file_size,mime_type,uploaded_by)
values('9c300000-0000-4000-8000-000000000001','file','Accepted material',
 '9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/file.pdf',32,'application/pdf',
 '9c000000-0000-4000-8000-000000000001');
update dars_private.teacher_access_state set starts_at=clock_timestamp()-interval '2 months',expires_at=clock_timestamp()-interval '1 second'
 where teacher_id='9c000000-0000-4000-8000-000000000001';

-- Expired teacher direct owner and no-op entry paths fail; public eligibility and
-- Storage owner fallback fail even though the owner remains an active approved account.
set local role authenticated;
set local request.jwt.claim.sub='9c000000-0000-4000-8000-000000000001';
do $$ begin
  if dars_private.teacher_has_access(auth.uid()) or public.is_group_owner('9c100000-0000-4000-8000-000000000001') then
    raise exception 'expired owner helper allowed access'; end if;
  if exists(select 1 from public.groups where id='9c100000-0000-4000-8000-000000000001')
     or exists(select 1 from public.group_schedule_slots where id='9c200000-0000-4000-8000-000000000001') then
    raise exception 'expired teacher SELECT leaked through permissive FOR ALL policies'; end if;
  if (public.teacher_access_status()->>'has_access')::boolean
     or not exists(select 1 from public.profiles where id=auth.uid())
     or not exists(select 1 from public.teacher_profiles where id=auth.uid())
     or not exists(select 1 from public.teacher_review_state where teacher_id=auth.uid())
     or (public.notifications_page(0,20)->>'total')::int<1 then
    raise exception 'account, review, or inbox access was coupled to monthly expiry'; end if;
  update public.profiles set preferred_language='en' where id=auth.uid();
  insert into public.teacher_contacts(teacher_id,phone_number,visibility) values(auth.uid(),'+201234567890','enrolled')
    on conflict(teacher_id) do update set phone_number=excluded.phone_number;
  insert into public.teacher_specializations(teacher_id,offering_id)
    select auth.uid(),id from public.offerings where owner_teacher_id is null order by id limit 1
    on conflict do nothing;
  if not public.set_teacher_avatar_path(null,null)
     or not public.set_teacher_cover_path(auth.uid()::text||'/cover/9c500000-0000-4000-8000-000000000001.png',null) then
    raise exception 'teacher photo/cover self-service write was coupled to expiry'; end if;
  if not public.can_read_teacher_contacts(auth.uid())
     or not exists(select 1 from public.public_teachers() where id=auth.uid())
     or not exists(select 1 from public.public_teacher_profile_details(auth.uid()))
     or public.public_teacher_cover_path(auth.uid()) is null
     or not exists(select 1 from public.public_teacher_specializations(auth.uid()))
     or not exists(select 1 from public.public_teacher_specialization_labels(auth.uid())) then
    raise exception 'expired teacher account/profile identity projections were hidden'; end if;
  if not exists(select 1 from public.subjects where id='9c400000-0000-4000-8000-000000000001')
     or exists(select 1 from public.public_groups() where id='9c100000-0000-4000-8000-000000000001')
     or ((public.public_discovery_catalogue()->'subjects') @> '[{"id":"9c400000-0000-4000-8000-000000000001"}]'::jsonb)
     or exists(select 1 from public.public_teacher_choices(null,'9c000000-0000-4000-8000-000000000001'))
     or public.can_upload_lesson_object(auth.uid()::text||'/9c300000-0000-4000-8000-000000000001/file.pdf')
     or public.storage_lesson_access('9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/file.pdf',false)
     or public.storage_lesson_access('9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/file.pdf',true)
     or public.can_cleanup_lesson_object('9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/file.pdf')
     or public.can_cleanup_lesson_object('9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/orphan.pdf') then
    raise exception 'expired teacher remained a public or Storage target'; end if;
  begin perform public.delete_schedule_slot('9c100000-0000-4000-8000-000000000001','9c200000-0000-4000-8000-000000000001');
    raise exception 'expired teacher no-op/action RPC succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.generate_lessons('9c100000-0000-4000-8000-000000000001',current_date,current_date);
    raise exception 'expired teacher zero-row generation succeeded';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.group_students('9c100000-0000-4000-8000-000000000001'))<>0 then raise exception 'expired teacher group_students read leaked'; end if;
  begin perform public.teacher_dashboard_summary(now(),now()+interval '1 day',now());
    raise exception 'expired teacher dashboard read succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.preview_lesson_generation('9c100000-0000-4000-8000-000000000001',current_date,current_date);
    raise exception 'expired teacher preview read succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.teacher_enrollment_page('pending',0,20);
    raise exception 'expired teacher enrollment page succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.group_enrollment_page('9c100000-0000-4000-8000-000000000001',0,20);
    raise exception 'expired teacher group enrollment page succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.teacher_enrollment_search('pending','',null,0,20);
    raise exception 'expired teacher enrollment search succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.teacher_group_choices('',null);
    raise exception 'expired teacher group choices succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.teacher_lesson_attendance_page('9c300000-0000-4000-8000-000000000001',0,20);
    raise exception 'expired teacher attendance page succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.calendar_lesson_export(current_date,current_date);
    raise exception 'expired teacher calendar export succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.save_teacher_group_draft('9c100000-0000-4000-8000-000000000001',null,null,'x','',1,'',null);
    raise exception 'expired teacher draft save succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.publish_group('9c100000-0000-4000-8000-000000000001',null,null);
    raise exception 'expired teacher publish succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.duplicate_group('9c100000-0000-4000-8000-000000000001');
    raise exception 'expired teacher duplicate succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.save_schedule_slot('9c100000-0000-4000-8000-000000000001',1,'10:00','11:00',null);
    raise exception 'expired teacher slot save succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_lesson_exclusions('9c100000-0000-4000-8000-000000000001',array[]::date[]);
    raise exception 'expired teacher empty exclusions write succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.create_lesson('9c100000-0000-4000-8000-000000000001','x',now()+interval '1 day',now()+interval '1 day 1 hour');
    raise exception 'expired teacher lesson create succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_lesson_status('9c300000-0000-4000-8000-000000000001','completed');
    raise exception 'expired teacher lesson status write succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.cancel_teacher_group('9c100000-0000-4000-8000-000000000001');
    raise exception 'expired teacher group cancellation succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_unused_teacher_group('9c100000-0000-4000-8000-000000000001');
    raise exception 'expired teacher no-op group delete succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_manual_teacher_lesson('9c300000-0000-4000-8000-000000000001');
    raise exception 'expired teacher lesson delete succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.decide_enrollment((select id from public.enrollments where group_id='9c100000-0000-4000-8000-000000000001'),'removed');
    raise exception 'expired teacher enrollment decision succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_group_pinned_announcement('9c100000-0000-4000-8000-000000000001','');
    raise exception 'expired teacher empty announcement delete succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_lesson_attendance('9c300000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000003',null);
    raise exception 'expired teacher attendance clear succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.save_teacher_subject(null,'x','');
    raise exception 'expired teacher subject save succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.save_teacher_category(null,'student_category','x','');
    raise exception 'expired teacher category save succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.set_teacher_catalogue_archived('subjects','9c400000-0000-4000-8000-000000000001',true);
    raise exception 'expired teacher catalogue archive succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.save_teacher_offering('9c400000-0000-4000-8000-000000000001','9c400000-0000-4000-8000-000000000002');
    raise exception 'expired teacher offering save succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Bypass RLS as the migration owner while retaining auth.uid(): prove each
-- teaching-row guard independently of policy/ACL denial.
do $$ begin
  begin update public.groups set name='raw expired mutation' where id='9c100000-0000-4000-8000-000000000001';
    raise exception 'expired teacher raw group update succeeded'; exception when insufficient_privilege then null; end;
  begin update public.group_schedule_slots set end_time='11:30' where id='9c200000-0000-4000-8000-000000000001';
    raise exception 'expired teacher raw slot update succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.group_lesson_exclusions(group_id,local_date) values('9c100000-0000-4000-8000-000000000001',current_date+1);
    raise exception 'expired teacher raw exclusion insert succeeded'; exception when insufficient_privilege then null; end;
  begin update public.lessons set title='raw expired mutation' where id='9c300000-0000-4000-8000-000000000001';
    raise exception 'expired teacher raw lesson update succeeded'; exception when insufficient_privilege then null; end;
  begin update public.lesson_materials set title='raw expired mutation' where lesson_id='9c300000-0000-4000-8000-000000000001';
    raise exception 'expired teacher raw material update succeeded'; exception when insufficient_privilege then null; end;
  begin update public.enrollments set status='removed' where group_id='9c100000-0000-4000-8000-000000000001' and student_id='9c000000-0000-4000-8000-000000000003';
    raise exception 'expired teacher raw enrollment update succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values('9c300000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000003','present','9c000000-0000-4000-8000-000000000001');
    raise exception 'expired teacher raw attendance insert succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.group_pinned_announcements(group_id,body) values('9c100000-0000-4000-8000-000000000001','expired');
    raise exception 'expired teacher raw announcement insert succeeded'; exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claim.sub='';
set local role anon;
do $$ begin
  if exists(select 1 from public.public_groups() where id='9c100000-0000-4000-8000-000000000001')
     or exists(select 1 from public.discover_groups(null,null,'9c000000-0000-4000-8000-000000000001',null,false,'',0,12))
     or exists(select 1 from public.public_group_detail('9c100000-0000-4000-8000-000000000001'))
     or exists(select 1 from public.public_teacher_choices(null,'9c000000-0000-4000-8000-000000000001')) then
    raise exception 'anonymous discovery exposed expired teacher group'; end if;
  if (public.public_discovery_catalogue()->'subjects') @> '[{"id":"9c400000-0000-4000-8000-000000000001"}]'::jsonb then
    raise exception 'anonymous catalogue exposed expired teacher private label'; end if;
end $$;
reset role;

-- A pending teacher with a grant can still prepare drafts, independent of approval.
set local role authenticated;
set local request.jwt.claim.sub='9c000000-0000-4000-8000-000000000002';
do $$ begin
  if not public.is_group_owner('9c100000-0000-4000-8000-000000000002') then raise exception 'pending granted owner draft access was lost'; end if;
  insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
  select '9c100000-0000-4000-8000-000000000003',auth.uid(),id,'Raw current draft',5,'draft'
  from public.offerings order by id limit 1;
  begin update public.groups set teacher_id='9c000000-0000-4000-8000-000000000001'
    where id='9c100000-0000-4000-8000-000000000003';
    raise exception 'teacher ownership reassignment succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Exercise OLD/NEW owner validation with RLS bypass while auth.uid is still
-- the current teacher; the row trigger must reject self-to-foreign transfer.
do $$ begin
  begin update public.groups set teacher_id='9c000000-0000-4000-8000-000000000001'
    where id='9c100000-0000-4000-8000-000000000003';
    raise exception 'trigger allowed teacher owner reassignment';
  exception when insufficient_privilege then null; end;
end $$;

-- Accepted student history remains available after the group owner expires.
set local role authenticated;
set local request.jwt.claim.sub='9c000000-0000-4000-8000-000000000003';
do $$ declare v_unavailable boolean; v_calendar jsonb; v_denied boolean:=false; begin
  select not available into v_unavailable from public.student_saved_group_page(0,20)
    where group_id='9c100000-0000-4000-8000-000000000001';
  if v_unavailable is distinct from true then raise exception 'saved expired group should remain as unavailable card'; end if;
  if (select weekly_overlap or dated_overlap from public.student_group_schedule_overlap('9c100000-0000-4000-8000-000000000001')) then
    raise exception 'expired public target exposed overlap data'; end if;
  begin perform public.request_enrollment('9c100000-0000-4000-8000-000000000001'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'student enrollment request to expired target succeeded'; end if;
  v_denied:=false;
  begin perform public.save_student_group('9c100000-0000-4000-8000-000000000001'); exception when others then v_denied:=true; end;
  if not v_denied then raise exception 'student saved an expired target'; end if;
  v_calendar:=public.calendar_lesson_export(current_date,current_date);
  if (v_calendar->>'total')::int<1 then raise exception 'accepted student calendar history was lost'; end if;
  if not exists(select 1 from public.lessons where id='9c300000-0000-4000-8000-000000000001')
     or not exists(select 1 from public.lesson_materials where lesson_id='9c300000-0000-4000-8000-000000000001')
     or not public.storage_lesson_access('9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/file.pdf',false) then raise exception 'accepted student lost historical lesson/material access'; end if;
  perform public.cancel_enrollment((select id from public.enrollments where group_id='9c100000-0000-4000-8000-000000000001' and student_id=auth.uid()));
  if (select status from public.enrollments where group_id='9c100000-0000-4000-8000-000000000001' and student_id=auth.uid())<>'cancelled' then raise exception 'student cancellation was blocked by teacher expiry'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='9c000000-0000-4000-8000-000000000004';
do $$ begin
  if (public.group_enrollment_page('9c100000-0000-4000-8000-000000000001',0,20)->>'total')::int<1 then raise exception 'admin lost archived/expired enrollment history'; end if;
  if not public.storage_lesson_access('9c000000-0000-4000-8000-000000000001/9c300000-0000-4000-8000-000000000001/file.pdf',true) then raise exception 'admin material write access was coupled to owner expiry'; end if;
  update public.groups set name='Admin preserved write' where id='9c100000-0000-4000-8000-000000000001';
end $$;
reset role;

rollback;
select 'monthly teacher access enforcement SQL assertions passed' as result;
