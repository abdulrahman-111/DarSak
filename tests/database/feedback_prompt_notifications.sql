\set ON_ERROR_STOP on
begin;

do $$
declare v_constraint text;
begin
  select pg_get_constraintdef(oid) into v_constraint from pg_constraint
    where conrelid='public.user_notifications'::regclass and conname='user_notifications_kind_check';
  if v_constraint not like '%feedback_prompt%' or v_constraint not like '%waitlist_promoted%' then
    raise exception 'notification kind constraint lost an existing or feedback kind';
  end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='dars_private' and c.relname='feedback_prompt_state' and c.relrowsecurity)
     or has_table_privilege('authenticated','dars_private.feedback_prompt_state','SELECT')
     or has_table_privilege('service_role','dars_private.feedback_prompt_state','SELECT') then
    raise exception 'prompt ledger is not private';
  end if;
  if has_function_privilege('authenticated','dars_private.ensure_feedback_prompt(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','dars_private.ensure_my_feedback_prompts()','EXECUTE')
     or not has_function_privilege('authenticated','public.dismiss_feedback_prompt(uuid)','EXECUTE')
     or has_function_privilege('anon','public.dismiss_feedback_prompt(uuid)','EXECUTE') then
    raise exception 'prompt helper/dismiss grants are unsafe';
  end if;
  if (select provolatile from pg_proc where oid='public.notifications_page(integer,integer)'::regprocedure)<>'v'
     or (select provolatile from pg_proc where oid='public.notifications_unread_count()'::regprocedure)<>'v'
     or (select proargnames from pg_proc where oid='public.notifications_page(integer,integer)'::regprocedure)
        is distinct from array['p_offset','p_limit']::text[] then
    raise exception 'notification reconciliation changed RPC interface or is not volatile';
  end if;
  if not has_function_privilege('authenticated','public.moderate_group_feedback_with_reason(uuid,text,text,bigint,text)','EXECUTE')
     or has_function_privilege('anon','public.moderate_group_feedback_with_reason(uuid,text,text,bigint,text)','EXECUTE') then
    raise exception 'reason moderation grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('14800000-0000-4000-8000-000000000001','authenticated','authenticated','ratings148-teacher@test.invalid','{"full_name":"Ratings Teacher","requested_role":"teacher"}'),
 ('14800000-0000-4000-8000-000000000002','authenticated','authenticated','ratings148-student@test.invalid','{"full_name":"Ratings Student","requested_role":"student"}'),
 ('14800000-0000-4000-8000-000000000003','authenticated','authenticated','ratings148-admin@test.invalid','{"full_name":"Ratings Admin","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='14800000-0000-4000-8000-000000000003';
update public.teacher_profiles set approved=true where id='14800000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '14810000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000001',o.id,'Ratings 148 fixture',5,'draft'
from public.offerings o order by o.id limit 1;
set local session_replication_role=replica;
update public.groups set status='published' where id='14810000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.enrollments(group_id,student_id,status)
values('14810000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000002','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('14820000-0000-4000-8000-000000000001','14810000-0000-4000-8000-000000000001','Past one',now()-interval '4 hours',now()-interval '3 hours','scheduled'),
 ('14820000-0000-4000-8000-000000000002','14810000-0000-4000-8000-000000000001','Past two',now()-interval '2 hours',now()-interval '1 hour','scheduled');
-- Seed lesson one without firing the new attendance hook; lesson two proves
-- that the producer counts distinct ended lessons, not attendance edits.
set local session_replication_role=replica;
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by)
values('14820000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001');
set local session_replication_role=origin;
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by)
values('14820000-0000-4000-8000-000000000002','14800000-0000-4000-8000-000000000002','late','14800000-0000-4000-8000-000000000001');

do $$
begin
  if (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002' and kind='feedback_prompt')<>1
     or (select count(*) from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000001' and student_id='14800000-0000-4000-8000-000000000002' and state='prompted')<>1 then
    raise exception 'two distinct ended attended lessons did not create exactly one durable prompt';
  end if;
  if exists(select 1 from public.user_notifications where kind='feedback_prompt'
       and (payload ? 'student_id' or payload ? 'student_name' or payload ? 'attendance')) then
    raise exception 'feedback prompt leaked student or attendance details';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$
declare v_page jsonb; v_id uuid;
begin
  v_page:=public.notifications_page(0,20);
  v_id:=(v_page->'rows'->0->>'id')::uuid;
  perform public.mark_notification_read(v_id);
  perform public.mark_all_notifications_read();
  if (select count(*) from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt')<>1 then
    raise exception 'read state removed prompt';
  end if;
  perform public.dismiss_feedback_prompt('14810000-0000-4000-8000-000000000001');
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt') then
    raise exception 'dismissal was not durable';
  end if;
end $$;
reset role;
update public.lesson_attendance set status='present'
  where lesson_id='14820000-0000-4000-8000-000000000002' and student_id='14800000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$
begin
  perform public.notifications_page(0,20);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt') then
    raise exception 'dismissed prompt was restored by read reconciliation';
  end if;
  perform public.save_group_feedback('14810000-0000-4000-8000-000000000001',5,'The teacher explained the lesson clearly.',0);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt') then
    raise exception 'successful save did not suppress prompt durably';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';

set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$
begin
  perform public.moderate_group_feedback_with_reason(
    (public.manage_group_feedback_page(0)->'rows'->0->>'id')::uuid,
    'hide','private admin note',1,'Please keep comments focused on the lesson.'
  );
end $$;
reset role;
set local request.jwt.claims='{}';
do $$
begin
  if not exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000001'
       and kind='feedback_pending' and payload->>'category'='review')
     or not exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000003'
       and kind='feedback_pending' and payload->>'category'='review') then
    raise exception 'pending review notice recipient matrix is incomplete';
  end if;
  if exists(select 1 from public.user_notifications where kind='feedback_pending'
       and (payload ? 'student_id' or payload::text like '%Ratings Student%' or payload::text like '%explained the lesson%')) then
    raise exception 'pending notice leaked student identity or review text';
  end if;
  if not exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002' and kind='feedback_decision'
       and payload->>'student_reason'='Please keep comments focused on the lesson.'
       and payload->>'reason_code'='publication_guidelines') then
    raise exception 'student hide reason was not attached to resulting decision';
  end if;
  if exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002' and kind='feedback_decision'
       and payload::text like '%private admin note%') then
    raise exception 'private admin note leaked into student decision payload';
  end if;
  if (select state from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000001' and student_id='14800000-0000-4000-8000-000000000002')<>'submitted' then
    raise exception 'dismissed prompt did not become submitted after save';
  end if;
end $$;

-- Authenticated callers cannot dismiss another student's state; the RPC derives
-- the student exclusively from auth.uid().
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform public.dismiss_feedback_prompt('14810000-0000-4000-8000-000000000001');
    raise exception 'teacher dismissed a student prompt';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims='{}';

rollback;
