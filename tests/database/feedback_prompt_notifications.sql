\set ON_ERROR_STOP on
begin;

do $$
declare v_constraint text; v_kind text;
begin
  select pg_get_constraintdef(oid) into v_constraint from pg_constraint
    where conrelid='public.user_notifications'::regclass and conname='user_notifications_kind_check';
  if v_constraint is null then raise exception 'notification kind constraint missing'; end if;
  foreach v_kind in array array['lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed',
    'enrollment_requested','teacher_review_requested','teacher_review_decision','teacher_fee_announcement',
    'enrollment_accepted','booking_updated','waitlist_promoted','feedback_prompt','feedback_pending','feedback_decision'] loop
    if position(quote_literal(v_kind) in v_constraint)=0 then
      raise exception 'notification kind constraint lost kind %',v_kind;
    end if;
  end loop;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='dars_private' and c.relname='feedback_prompt_state' and c.relrowsecurity)
     or has_table_privilege('authenticated','dars_private.feedback_prompt_state','SELECT')
     or has_table_privilege('service_role','dars_private.feedback_prompt_state','SELECT') then
    raise exception 'prompt ledger is not private';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='dars_private' and indexname='feedback_prompt_state_student_idx')
     or (select count(*) from pg_constraint where conrelid='dars_private.feedback_prompt_state'::regclass and contype='f' and confdeltype='c')<>2 then
    raise exception 'ledger student lookup index or cascading parent FKs are missing';
  end if;
  if has_function_privilege('authenticated','dars_private.ensure_feedback_prompt(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','dars_private.ensure_my_feedback_prompts()','EXECUTE')
     or has_function_privilege('authenticated','dars_private.lock_feedback_profile_parents(uuid,uuid,boolean)','EXECUTE')
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
 ('14800000-0000-4000-8000-000000000003','authenticated','authenticated','ratings148-admin@test.invalid','{"full_name":"Ratings Admin","requested_role":"student"}'),
 ('14800000-0000-4000-8000-000000000004','authenticated','authenticated','ratings148-other-student@test.invalid','{"full_name":"Other Student","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='14800000-0000-4000-8000-000000000003';
update public.teacher_profiles set approved=true where id='14800000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '14810000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000001',o.id,'Ratings 148 fixture',5,'draft'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select x.id,'14800000-0000-4000-8000-000000000001',o.id,x.name,5,'draft'
from (values
 ('14810000-0000-4000-8000-000000000002'::uuid,'First lesson submission'),
 ('14810000-0000-4000-8000-000000000003'::uuid,'Read reconciliation'),
 ('14810000-0000-4000-8000-000000000004'::uuid,'Eligibility exclusions')
) x(id,name) cross join (select id from public.offerings order by id limit 1) o;
set local session_replication_role=replica;
update public.groups set status='published' where id in (
 '14810000-0000-4000-8000-000000000001','14810000-0000-4000-8000-000000000002',
 '14810000-0000-4000-8000-000000000003','14810000-0000-4000-8000-000000000004');
set local session_replication_role=origin;
insert into public.enrollments(group_id,student_id,status)
values
 ('14810000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000002','accepted'),
 ('14810000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000004','accepted'),
 ('14810000-0000-4000-8000-000000000002','14800000-0000-4000-8000-000000000002','accepted'),
 ('14810000-0000-4000-8000-000000000003','14800000-0000-4000-8000-000000000002','accepted'),
 ('14810000-0000-4000-8000-000000000004','14800000-0000-4000-8000-000000000002','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('14820000-0000-4000-8000-000000000001','14810000-0000-4000-8000-000000000001','Past one',now()-interval '4 hours',now()-interval '3 hours','scheduled'),
 ('14820000-0000-4000-8000-000000000002','14810000-0000-4000-8000-000000000001','Past two',now()-interval '2 hours',now()-interval '1 hour','scheduled'),
 ('14820000-0000-4000-8000-000000000003','14810000-0000-4000-8000-000000000002','First attended lesson',now()-interval '4 hours',now()-interval '3 hours','scheduled'),
 ('14820000-0000-4000-8000-000000000004','14810000-0000-4000-8000-000000000002','Second attended lesson',now()-interval '30 minutes',now()+interval '30 minutes','scheduled'),
 ('14820000-0000-4000-8000-000000000005','14810000-0000-4000-8000-000000000003','Not ended one',now()-interval '2 hours',now()+interval '30 minutes','scheduled'),
 ('14820000-0000-4000-8000-000000000006','14810000-0000-4000-8000-000000000003','Not ended two',now()-interval '1 hour',now()+interval '45 minutes','scheduled'),
 ('14820000-0000-4000-8000-000000000007','14810000-0000-4000-8000-000000000004','One valid',now()-interval '8 hours',now()-interval '7 hours','scheduled'),
 ('14820000-0000-4000-8000-000000000008','14810000-0000-4000-8000-000000000004','Cancelled',now()-interval '6 hours',now()-interval '5 hours','cancelled'),
 ('14820000-0000-4000-8000-000000000009','14810000-0000-4000-8000-000000000004','Future',now()+interval '1 hour',now()+interval '2 hours','scheduled'),
 ('14820000-0000-4000-8000-000000000010','14810000-0000-4000-8000-000000000004','Absent',now()-interval '4 hours',now()-interval '3 hours','scheduled'),
 ('14820000-0000-4000-8000-000000000011','14810000-0000-4000-8000-000000000004','Excused',now()-interval '2 hours',now()-interval '1 hour','scheduled'),
 ('14820000-0000-4000-8000-000000000012','14810000-0000-4000-8000-000000000004','Second valid',now()-interval '30 minutes',now()-interval '15 minutes','scheduled');
-- Seed lesson one without firing the new attendance hook; lesson two proves
-- that the producer counts distinct ended lessons, not attendance edits.
set local session_replication_role=replica;
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by)
values('14820000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001');
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values
 ('14820000-0000-4000-8000-000000000003','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000004','14800000-0000-4000-8000-000000000002','late','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000005','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000006','14800000-0000-4000-8000-000000000002','late','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000007','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000008','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000009','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000010','14800000-0000-4000-8000-000000000002','absent','14800000-0000-4000-8000-000000000001'),
 ('14820000-0000-4000-8000-000000000011','14800000-0000-4000-8000-000000000002','excused','14800000-0000-4000-8000-000000000001');
set local session_replication_role=origin;
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by)
values('14820000-0000-4000-8000-000000000002','14800000-0000-4000-8000-000000000002','late','14800000-0000-4000-8000-000000000001');
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by)
values('14820000-0000-4000-8000-000000000012','14800000-0000-4000-8000-000000000002','present','14800000-0000-4000-8000-000000000001');
update public.lesson_attendance set status='present'
where lesson_id='14820000-0000-4000-8000-000000000002' and student_id='14800000-0000-4000-8000-000000000002';
update public.lesson_attendance set status='late'
where lesson_id='14820000-0000-4000-8000-000000000002' and student_id='14800000-0000-4000-8000-000000000002';

do $$
begin
  if (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002' and kind='feedback_prompt')<>2
     or (select count(*) from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000001' and student_id='14800000-0000-4000-8000-000000000002' and state='prompted')<>1 then
    raise exception 'two valid groups did not each create one pair-level prompt';
  end if;
  if exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002' and kind='feedback_prompt'
       and payload->>'group_id' in ('14810000-0000-4000-8000-000000000002','14810000-0000-4000-8000-000000000003')) then
    raise exception 'one-ended or not-yet-ended lessons produced a prompt';
  end if;
  if (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002'
       and kind='feedback_prompt' and payload->>'group_id'='14810000-0000-4000-8000-000000000004')<>1 then
    raise exception 'cancelled, future, absent or excused lesson exclusions were not applied';
  end if;
  if exists(select 1 from public.user_notifications where kind='feedback_prompt'
       and (payload ? 'student_id' or payload ? 'student_name' or payload ? 'attendance')) then
    raise exception 'feedback prompt leaked student or attendance details';
  end if;
end $$;

-- Two attended lessons recorded before their end do not trigger a prompt.
-- The next ordinary bell read after those ends pass reconciles them.
update public.lessons set ends_at=now()-interval '1 minute'
where id in ('14820000-0000-4000-8000-000000000005','14820000-0000-4000-8000-000000000006');
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$
begin
  perform public.notifications_page(0,20);
  if (select count(*) from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000003')<>1 then
    raise exception 'bell read did not reconcile pre-end attendance after lesson end';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';

-- A second accepted student without attendance cannot dismiss or mutate the
-- first student's prompt for the same group.
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000004","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000004';
do $$ begin
  perform public.notifications_page(0,20);
  perform public.dismiss_feedback_prompt('14810000-0000-4000-8000-000000000001');
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000001') then
    raise exception 'unrelated student received a prompt';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';
do $$ begin
  if not exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002'
       and kind='feedback_prompt' and payload->>'group_id'='14810000-0000-4000-8000-000000000001') then
    raise exception 'other student dismissal changed the owner's prompt';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$
declare v_page jsonb; v_id uuid;
begin
  v_page:=public.notifications_page(0,20);
  select (item->>'id')::uuid into v_id from jsonb_array_elements(v_page->'rows') as items(item)
    where item->>'kind'='feedback_prompt' and item->'payload'->>'group_id'='14810000-0000-4000-8000-000000000001';
  if v_id is null then raise exception 'group one prompt missing from notification page'; end if;
  perform public.mark_notification_read(v_id);
  perform public.mark_all_notifications_read();
  if not exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000001') then
    raise exception 'read state removed prompt';
  end if;
  perform public.dismiss_feedback_prompt('14810000-0000-4000-8000-000000000001');
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000001') then
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
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000001') then
    raise exception 'dismissed prompt was restored by read reconciliation';
  end if;
  perform public.save_group_feedback('14810000-0000-4000-8000-000000000001',5,'The teacher explained the lesson clearly.',0);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000001') then
    raise exception 'successful save did not suppress prompt durably';
  end if;
  perform public.save_group_feedback('14810000-0000-4000-8000-000000000002',4,'The first class was useful and clear.',0);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000002') then
    raise exception 'first-lesson submission generated a prompt';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';
update public.lessons set ends_at=now()-interval '1 minute' where id='14820000-0000-4000-8000-000000000004';
select set_config('test.ratings148.feedback_first',
  (select id::text from dars_private.group_feedback where group_id='14810000-0000-4000-8000-000000000001'),true);
select set_config('test.ratings148.feedback_second',
  (select id::text from dars_private.group_feedback where group_id='14810000-0000-4000-8000-000000000002'),true);
do $$ begin
  if (select state from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000002'
       and student_id='14800000-0000-4000-8000-000000000002')<>'submitted' then
    raise exception 'first-lesson save did not create a durable submitted ledger';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$ begin
  perform public.notifications_page(0,20);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000002') then
    raise exception 'first-lesson submission failed to suppress the later second-lesson prompt';
  end if;
  if public.save_group_feedback('14810000-0000-4000-8000-000000000002',5,
       'The second class added useful examples.',1)<>2 then
    raise exception 'pending review revision did not advance its version';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';

set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$
declare v_review_id uuid; v_first_lesson_id uuid;
begin
  select (item->>'id')::uuid into v_review_id
    from jsonb_array_elements(public.manage_group_feedback_page(0)->'rows') as feedback_items(item)
    where item->>'group_id'='14810000-0000-4000-8000-000000000001';
  select (item->>'id')::uuid into v_first_lesson_id
    from jsonb_array_elements(public.manage_group_feedback_page(0)->'rows') as feedback_items(item)
    where item->>'group_id'='14810000-0000-4000-8000-000000000002';
  if v_review_id is null or v_first_lesson_id is null then raise exception 'pending reviews missing from admin page'; end if;
  begin
    perform public.moderate_group_feedback_with_reason(v_review_id,'hide','private admin note',1,'   ');
    raise exception 'blank public hide reason was accepted';
  exception when sqlstate '22023' then null; end;
  perform public.moderate_group_feedback_with_reason(v_review_id,'hide','private admin note',1,'Please keep comments focused on the lesson.');
  perform public.moderate_group_feedback_with_reason(v_first_lesson_id,'approve','',2,'');
end $$;
reset role;
set local request.jwt.claims='{}';
update dars_private.group_feedback set admin_note=admin_note
where id=current_setting('test.ratings148.feedback_second')::uuid;
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$ begin
  if public.save_group_feedback('14810000-0000-4000-8000-000000000002',4,
       'I refined this review after the second class.',3)<>4 then
    raise exception 'revision of an approved review did not return a new version';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$ begin
  perform public.moderate_group_feedback_with_reason(
    current_setting('test.ratings148.feedback_second')::uuid,'approve','',4,'');
end $$;
reset role;
set local request.jwt.claims='{}';
do $$
begin
  if (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000001'
       and kind='feedback_pending' and payload->>'category'='review')<>4
     or (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000003'
       and kind='feedback_pending' and payload->>'category'='review')<>4 then
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
  if (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000001'
       and kind='feedback_pending' and event_key like 'feedback-pending:'||current_setting('test.ratings148.feedback_second')||':%')<>3
     or (select count(*) from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000003'
       and kind='feedback_pending' and event_key like 'feedback-pending:'||current_setting('test.ratings148.feedback_second')||':%')<>3 then
    raise exception 'review initial save/revisions did not produce exactly one event per version';
  end if;
end $$;

-- The old pending row has no ledger. A legacy hide_reply mutation increments
-- its version while status remains pending; it must not be treated as a save.
do $$
declare v_legacy uuid;
begin
  alter table dars_private.group_feedback disable trigger feedback_notifications_produce;
  insert into dars_private.group_feedback(group_id,student_id,rating,comment)
    values('14810000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000004',3,
      'This is a legacy pending review row.') returning id into v_legacy;
  alter table dars_private.group_feedback enable trigger feedback_notifications_produce;
  perform set_config('test.ratings148.feedback_legacy',v_legacy::text,true);
end $$;
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$ begin
  perform public.moderate_group_feedback(current_setting('test.ratings148.feedback_legacy')::uuid,'hide_reply','private note',1);
end $$;
reset role;
set local request.jwt.claims='{}';
do $$ begin
  if exists(select 1 from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000001'
       and student_id='14800000-0000-4000-8000-000000000004')
     or exists(select 1 from public.user_notifications where recipient_id in ('14800000-0000-4000-8000-000000000001','14800000-0000-4000-8000-000000000003')
       and kind='feedback_pending' and event_key='feedback-pending:'||current_setting('test.ratings148.feedback_legacy')||':2') then
    raise exception 'pending hide_reply wrote a submission ledger or review notice';
  end if;
end $$;

-- The canonical moderation guards still reject stale versions, AAL1 admins,
-- teachers, and students. Rejected calls leave no resulting-version event.
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$ declare v_rejected boolean:=false; begin
  begin perform public.moderate_group_feedback_with_reason(current_setting('test.ratings148.feedback_first')::uuid,
    'hide','',1,'A stale decision must not be delivered.');
  exception when serialization_failure then v_rejected:=true; end;
  if not v_rejected then raise exception 'stale moderation unexpectedly succeeded'; end if;
end $$;
reset role;
set local request.jwt.claims='{}';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$ declare v_rejected boolean:=false; begin
  begin perform public.moderate_group_feedback_with_reason(current_setting('test.ratings148.feedback_first')::uuid,
    'hide','',2,'No AAL1 moderation.');
  exception when insufficient_privilege then v_rejected:=true; end;
  if not v_rejected then raise exception 'AAL1 admin moderation unexpectedly succeeded'; end if;
end $$;
reset role;
set local request.jwt.claims='{}';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000001';
do $$ declare v_rejected boolean:=false; begin
  begin perform public.moderate_group_feedback_with_reason(current_setting('test.ratings148.feedback_first')::uuid,
    'hide','',2,'Teacher cannot moderate.');
  exception when insufficient_privilege then v_rejected:=true; end;
  if not v_rejected then raise exception 'teacher moderation unexpectedly succeeded'; end if;
end $$;
reset role;
set local request.jwt.claims='{}';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$ declare v_rejected boolean:=false; begin
  begin perform public.moderate_group_feedback_with_reason(current_setting('test.ratings148.feedback_first')::uuid,
    'hide','',2,'Student cannot moderate.');
  exception when insufficient_privilege then v_rejected:=true; end;
  if not v_rejected then raise exception 'student moderation unexpectedly succeeded'; end if;
end $$;
reset role;
set local request.jwt.claims='{}';
do $$ begin
  if exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002'
       and kind='feedback_decision' and event_key='feedback-decision:'||current_setting('test.ratings148.feedback_first')||':3') then
    raise exception 'failed stale/unauthorized moderation emitted a decision notice';
  end if;
end $$;

-- Reply pending is an admin notice only. Reply moderation advances the
-- canonical version without masquerading as a review decision.
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000001","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000001';
do $$ begin
  if public.teacher_reply_feedback(current_setting('test.ratings148.feedback_second')::uuid,
       'Thank you for the detailed review.',5)<>6 then
    raise exception 'teacher reply did not increment the approved review version';
  end if;
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_pending'
       and event_key='feedback-pending:'||current_setting('test.ratings148.feedback_second')||':6') then
    raise exception 'teacher received a pending notice for their own reply';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000003';
do $$ begin
  perform public.moderate_group_feedback_with_reason(current_setting('test.ratings148.feedback_second')::uuid,
    'approve_reply','',6,'');
end $$;
reset role;
set local request.jwt.claims='{}';
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$ begin
  if public.withdraw_group_feedback(current_setting('test.ratings148.feedback_second')::uuid,7)<>8 then
    raise exception 'withdrawal did not preserve the submitted version state';
  end if;
  perform public.notifications_page(0,20);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid() and kind='feedback_prompt'
       and payload->>'group_id'='14810000-0000-4000-8000-000000000002') then
    raise exception 'withdrawal restored a future prompt';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';

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

-- Correction and public-visibility changes remove only their own prompt while
-- retaining the once-only ledger decision.
update public.lesson_attendance set status='absent'
where lesson_id='14820000-0000-4000-8000-000000000012' and student_id='14800000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002'
       and kind='feedback_prompt' and payload->>'group_id'='14810000-0000-4000-8000-000000000004')
     or (select state from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000004'
       and student_id='14800000-0000-4000-8000-000000000002')<>'prompted' then
    raise exception 'attendance correction did not remove only the pending event and keep durable history';
  end if;
end $$;
set local session_replication_role=replica;
update public.groups set status='archived' where id='14810000-0000-4000-8000-000000000003';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claims='{"sub":"14800000-0000-4000-8000-000000000002","role":"authenticated"}';
set local request.jwt.claim.sub='14800000-0000-4000-8000-000000000002';
do $$ begin
  perform public.notifications_page(0,20);
  if exists(select 1 from public.user_notifications where recipient_id=auth.uid()
       and kind='feedback_prompt' and payload->>'group_id'='14810000-0000-4000-8000-000000000003')
     or (select state from dars_private.feedback_prompt_state where group_id='14810000-0000-4000-8000-000000000003'
       and student_id=auth.uid())<>'prompted' then
    raise exception 'archive reconciliation did not remove the event while retaining its ledger';
  end if;
end $$;
reset role;
set local request.jwt.claims='{}';

insert into public.user_notifications(recipient_id,kind,event_key,payload)
values('14800000-0000-4000-8000-000000000004','lesson_cancelled','ratings148-account-delete-control','{}');
set local role service_role;
select public.account_deletion_prepare('14800000-0000-4000-8000-000000000002',null,null,'password');
reset role;
do $$ begin
  if exists(select 1 from public.profiles where id='14800000-0000-4000-8000-000000000002')
     or exists(select 1 from dars_private.feedback_prompt_state where student_id='14800000-0000-4000-8000-000000000002')
     or exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000002') then
    raise exception 'account deletion did not cascade the student's prompt history and notifications';
  end if;
  if not exists(select 1 from public.user_notifications where recipient_id='14800000-0000-4000-8000-000000000004'
       and event_key='ratings148-account-delete-control') then
    raise exception 'account deletion touched an unrelated recipient notification';
  end if;
end $$;

rollback;
