begin;

-- A student's first prompt is a durable pair-level decision.  Removing a row
-- from the inbox, or marking it read, must never make it eligible again.
create table dars_private.feedback_prompt_state (
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  state text not null check (state in ('prompted','dismissed','submitted')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(group_id,student_id)
);
alter table dars_private.feedback_prompt_state enable row level security;
revoke all on dars_private.feedback_prompt_state from public,anon,authenticated,service_role;
create index feedback_prompt_state_student_idx on dars_private.feedback_prompt_state(student_id,group_id);

-- Lock order shared by attendance, feedback submission and reconciliation:
-- group row, then the advisory student/group pair lock. Dismissal takes only
-- the pair lock, so it cannot introduce a reverse edge in that order.
create or replace function dars_private.feedback_prompt_pair_lock(p_group uuid,p_student uuid)
returns void language sql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$ select pg_advisory_xact_lock(hashtextextended('feedback-prompt:'||p_group::text||':'||p_student::text,0)) $$;
revoke all on function dars_private.feedback_prompt_pair_lock(uuid,uuid) from public,anon,authenticated,service_role;

-- Parent profile rows must precede any group/feedback/pair lock that can later
-- insert a ledger or notification FK. Acquire all discovered parents in one
-- UUID order; a missing group still locks the caller's student parent.
create or replace function dars_private.lock_feedback_profile_parents(
  p_group_id uuid,p_student_id uuid,p_include_admins boolean default false
) returns uuid language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_teacher uuid;
begin
  if p_group_id is not null then
    select g.teacher_id into v_teacher from public.groups g where g.id=p_group_id;
  end if;
  perform p.id from public.profiles p
    where p.id=p_student_id or p.id=v_teacher
       or (p_include_admins and p.role='admin' and p.status='active')
    order by p.id for key share of p;
  return v_teacher;
end $$;
revoke all on function dars_private.lock_feedback_profile_parents(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create or replace function dars_private.ensure_feedback_prompt(p_group_id uuid,p_student_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_inserted integer:=0;
begin
  perform dars_private.lock_feedback_profile_parents(null,p_student_id,false);
  -- Existing group writers (including save_group_feedback) acquire this row
  -- before the pair lock. Holding it also serializes lesson/enrollment state.
  perform 1 from public.groups where id=p_group_id for update;
  if not found then return; end if;
  perform dars_private.feedback_prompt_pair_lock(p_group_id,p_student_id);

  if not dars_private.feedback_eligible(p_group_id,p_student_id)
     or (select count(distinct l.id)
         from public.lessons l
         join public.lesson_attendance a on a.lesson_id=l.id
         where l.group_id=p_group_id and l.status<>'cancelled'
           and l.ends_at<=statement_timestamp()
           and a.student_id=p_student_id and a.status in ('present','late')) < 2
     or exists(select 1 from dars_private.group_feedback f
               where f.group_id=p_group_id and f.student_id=p_student_id)
     or not exists(
       select 1 from public.groups g
       join public.profiles tp on tp.id=g.teacher_id and tp.role='teacher' and tp.status='active'
       join public.teacher_profiles t on t.id=g.teacher_id and t.approved
       join public.enrollments e on e.group_id=g.id and e.student_id=p_student_id and e.status='accepted'
       join public.profiles sp on sp.id=e.student_id and sp.role='student' and sp.status='active'
       where g.id=p_group_id and g.status='published'
         and dars_private.teacher_has_access(g.teacher_id)
     ) then
    -- Prompt notifications are pair-owned; never touch other event kinds.
    delete from public.user_notifications
      where recipient_id=p_student_id and kind='feedback_prompt'
        and event_key='feedback-prompt:'||p_group_id::text;
    return;
  end if;

  insert into dars_private.feedback_prompt_state(group_id,student_id,state)
    values(p_group_id,p_student_id,'prompted')
    on conflict(group_id,student_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted>0 then
    perform dars_private.add_user_notification(
      p_student_id,'feedback_prompt','feedback-prompt:'||p_group_id::text,
      jsonb_build_object('group_id',p_group_id)
    );
  end if;
end $$;
revoke all on function dars_private.ensure_feedback_prompt(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function dars_private.ensure_my_feedback_prompts()
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_uid uuid:=auth.uid(); v_group uuid;
begin
  if v_uid is null or public.current_role() is distinct from 'student'::public.user_role then return; end if;
  perform dars_private.lock_feedback_profile_parents(null,v_uid,false);
  -- Reconcile currently accepted groups (including legacy attendance) and all
  -- durable prompt decisions so visibility/access changes clean pending rows.
  for v_group in
    select e.group_id from public.enrollments e
    where e.student_id=v_uid and e.status='accepted'
      and not exists(select 1 from dars_private.feedback_prompt_state s
                     where s.group_id=e.group_id and s.student_id=v_uid)
    union
    select s.group_id from dars_private.feedback_prompt_state s
    join public.user_notifications n on n.recipient_id=s.student_id and n.kind='feedback_prompt'
      and n.event_key='feedback-prompt:'||s.group_id::text
    where s.student_id=v_uid and s.state='prompted'
    order by 1
  loop
    perform dars_private.ensure_feedback_prompt(v_group,v_uid);
  end loop;
end $$;
revoke all on function dars_private.ensure_my_feedback_prompts() from public,anon,authenticated,service_role;

create or replace function dars_private.feedback_prompt_attendance_changed()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_group uuid;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select group_id into v_group from public.lessons where id=new.lesson_id;
  if v_group is not null then perform dars_private.ensure_feedback_prompt(v_group,new.student_id); end if;
  return new;
end $$;
revoke all on function dars_private.feedback_prompt_attendance_changed() from public,anon,authenticated,service_role;
create trigger feedback_prompt_attendance_changed
after insert or update of status on public.lesson_attendance
for each row execute function dars_private.feedback_prompt_attendance_changed();

-- A successful submission creates the durable submitted state in the same
-- transaction and removes the pair's prompt. The trigger covers every save path.
create or replace function dars_private.feedback_notifications_produce()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_group public.groups; v_teacher uuid; v_decision text;
  v_submission boolean:=coalesce(tg_argv[0]='submission',false);
  v_pending_review boolean:=false; v_pending_reply boolean:=false;
begin
  select * into v_group from public.groups where id=new.group_id;
  if not found then return new; end if;
  v_teacher:=v_group.teacher_id;
  if v_submission and new.status='pending' then
    v_pending_review:=true;
    -- This trigger is limited to canonical review submission columns. It is
    -- the only producer path that creates/updates the durable submitted ledger.
    -- Canonical save locks profiles, group and feedback before taking pair.
    perform dars_private.feedback_prompt_pair_lock(new.group_id,new.student_id);
    insert into dars_private.feedback_prompt_state(group_id,student_id,state)
      values(new.group_id,new.student_id,'submitted')
      on conflict(group_id,student_id) do update
        set state='submitted',updated_at=clock_timestamp()
        where dars_private.feedback_prompt_state.state is distinct from 'submitted';
    delete from public.user_notifications where recipient_id=new.student_id
      and kind='feedback_prompt' and event_key='feedback-prompt:'||new.group_id::text;
  end if;
  if not v_submission and tg_op='UPDATE' then
    v_pending_reply:=new.reply_pending is distinct from old.reply_pending and new.reply_pending<>'';
  end if;
  if v_pending_review then
    if exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
              where p.id=v_teacher and p.role='teacher' and p.status='active'
                and t.approved and dars_private.teacher_has_access(p.id)) then
      perform dars_private.add_user_notification(v_teacher,'feedback_pending',
        'feedback-pending:'||new.id::text||':'||new.version::text,
        jsonb_build_object('feedback_id',new.id,'group_id',new.group_id,'category','review'));
    end if;
    perform dars_private.add_user_notification(p.id,'feedback_pending',
      'feedback-pending:'||new.id::text||':'||new.version::text,
      jsonb_build_object('feedback_id',new.id,'group_id',new.group_id,'category','review'))
      from public.profiles p where p.role='admin' and p.status='active';
  elsif v_pending_reply then
    perform dars_private.add_user_notification(p.id,'feedback_pending',
      'feedback-pending:'||new.id::text||':'||new.version::text,
      jsonb_build_object('feedback_id',new.id,'group_id',new.group_id,'category','reply'))
      from public.profiles p where p.role='admin' and p.status='active';
  end if;

  -- Reply decisions are intentionally omitted: they are not review decisions.
  if not v_submission and tg_op='UPDATE' then
    if old.status is distinct from new.status and new.status in ('approved','hidden') then
      v_decision:=case when new.status='approved' then 'approved' else 'hidden' end;
    end if;
  end if;
  if v_decision is not null then
    perform dars_private.add_user_notification(new.student_id,'feedback_decision',
      'feedback-decision:'||new.id::text||':'||new.version::text,
      jsonb_build_object('feedback_id',new.id,'group_id',new.group_id,
        'category','review','decision',v_decision,
        'reason_code',case when new.status='hidden' then 'publication_guidelines' else null end));
  end if;
  return new;
end $$;
revoke all on function dars_private.feedback_notifications_produce() from public,anon,authenticated,service_role;
drop trigger if exists feedback_notifications_produce on dars_private.group_feedback;
create trigger feedback_notifications_produce
after insert or update of rating,comment on dars_private.group_feedback
for each row execute function dars_private.feedback_notifications_produce('submission');
create trigger feedback_moderation_notifications_produce
after update on dars_private.group_feedback
for each row execute function dars_private.feedback_notifications_produce('other');

-- Preserve the canonical save path while acquiring notification FK parents
-- before the existing group → feedback → student/group-pair lock sequence.
create or replace function public.save_group_feedback(p_group_id uuid,p_rating integer,p_comment text,p_expected_version bigint default 0)
returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old dars_private.group_feedback; v_next bigint; v_discovered_teacher uuid; v_locked_teacher uuid;
begin
 if public.current_role() is distinct from 'student'::public.user_role then raise exception 'student required' using errcode='42501'; end if;
 v_discovered_teacher:=dars_private.lock_feedback_profile_parents(p_group_id,auth.uid(),true);
 select teacher_id into v_locked_teacher from public.groups where id=p_group_id for update;
 if found and v_locked_teacher is distinct from v_discovered_teacher then
   raise exception 'group changed; retry feedback submission' using errcode='40001';
 end if;
 if not dars_private.feedback_eligible(p_group_id,auth.uid()) then raise exception 'accepted attendance required' using errcode='42501'; end if;
 select * into v_old from dars_private.group_feedback where group_id=p_group_id and student_id=auth.uid() for update;
 if coalesce(v_old.version,0) is distinct from p_expected_version then raise exception 'feedback changed' using errcode='40001'; end if;
 insert into dars_private.group_feedback(group_id,student_id,rating,comment)values(p_group_id,auth.uid(),p_rating,btrim(p_comment))
 on conflict(group_id,student_id)do update set rating=excluded.rating,comment=excluded.comment,status='pending',reply_pending='',reply_public='',version=group_feedback.version+1,updated_at=clock_timestamp()
 returning version into v_next;return v_next;
end $$;

create or replace function public.teacher_reply_feedback(p_id uuid,p_reply text,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_group uuid; v_student uuid; v_discovered_teacher uuid; v_locked_teacher uuid; v_next bigint;
begin
 select group_id,student_id into v_group,v_student from dars_private.group_feedback where id=p_id;
 v_discovered_teacher:=dars_private.lock_feedback_profile_parents(v_group,v_student,true);
 select g.teacher_id into v_locked_teacher
   from public.groups g join public.teacher_profiles t on t.id=g.teacher_id
   where g.id=v_group and g.teacher_id=auth.uid() and g.status='published' and t.approved
     and public.current_role()='teacher' and dars_private.teacher_has_access(auth.uid())
   for update of g;
 if not found then raise exception 'active approved owner required' using errcode='42501'; end if;
 if v_locked_teacher is distinct from v_discovered_teacher then
   raise exception 'group changed; retry feedback reply' using errcode='40001';
 end if;
 if p_reply is null or length(btrim(p_reply)) not between 1 and 1500 then raise exception 'invalid reply' using errcode='22023'; end if;
 update dars_private.group_feedback set reply_pending=btrim(p_reply),version=version+1,updated_at=clock_timestamp()
   where id=p_id and status='approved' and version=p_expected_version returning version into v_next;
 if v_next is null then raise exception 'feedback changed' using errcode='40001'; end if;return v_next;
end $$;

create or replace function public.moderate_group_feedback(p_id uuid,p_decision text,p_note text,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row dars_private.group_feedback; v_next bigint; v_group uuid; v_student uuid;
begin
 if public.current_role() is distinct from 'admin'::public.user_role then raise exception 'active admin required' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approve','hide','approve_reply','hide_reply') or length(coalesce(p_note,''))>1500 then raise exception 'invalid moderation' using errcode='22023'; end if;
 select group_id,student_id into v_group,v_student from dars_private.group_feedback where id=p_id;
 perform dars_private.lock_feedback_profile_parents(v_group,v_student,true);
 select * into v_row from dars_private.group_feedback where id=p_id for update;
 if not found or v_row.version is distinct from p_expected_version then raise exception 'feedback changed' using errcode='40001'; end if;
 if v_row.group_id is distinct from v_group or v_row.student_id is distinct from v_student then
   raise exception 'feedback changed; retry moderation' using errcode='40001';
 end if;
 if v_row.status='withdrawn' then raise exception 'feedback withdrawn' using errcode='22023'; end if;
 if p_decision='approve_reply' and (v_row.status<>'approved' or v_row.reply_pending='') then raise exception 'no pending reply' using errcode='22023'; end if;
 update dars_private.group_feedback set
   status=case when p_decision='approve' then 'approved' when p_decision='hide' then 'hidden' else status end,
   reply_public=case when p_decision='approve_reply' then reply_pending when p_decision='hide_reply' then '' else reply_public end,
   reply_pending=case when p_decision in ('approve_reply','hide_reply') then '' else reply_pending end,
   admin_note=coalesce(p_note,''),version=version+1,updated_at=clock_timestamp() where id=p_id returning version into v_next;return v_next;
end $$;

-- This latest source definition remains the only attendance writer. It locks
-- the student/teacher FK parents before acquiring the group, enrollment or
-- attendance row locks that can lead to a prompt notification insert.
create or replace function public.set_lesson_attendance(p_lesson_id uuid,p_student_id uuid,p_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_group_id uuid; v_owner uuid; v_discovered_teacher uuid; v_locked_teacher uuid;
  v_group_status public.group_status; v_starts_at timestamptz; v_lesson_status public.lesson_status;
begin
  if public.current_role()='teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()),false) then
    raise exception 'teacher teaching access expired' using errcode='42501'; end if;
  if auth.uid() is null or not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved) then
    raise exception 'not authorized' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('present','absent','late','excused') then
    raise exception 'invalid attendance status' using errcode='22023'; end if;
  select g.id,g.teacher_id into v_group_id,v_owner from public.groups g join public.lessons l on l.group_id=g.id where l.id=p_lesson_id;
  if not found or v_owner<>auth.uid() then raise exception 'lesson not found' using errcode='42501'; end if;
  v_discovered_teacher:=dars_private.lock_feedback_profile_parents(v_group_id,p_student_id,false);
  if v_discovered_teacher is distinct from v_owner then raise exception 'group changed; retry attendance' using errcode='40001'; end if;
  select status,teacher_id into v_group_status,v_locked_teacher from public.groups where id=v_group_id for update;
  if not found then raise exception 'lesson not found' using errcode='42501'; end if;
  if v_locked_teacher is distinct from v_discovered_teacher then raise exception 'group changed; retry attendance' using errcode='40001'; end if;
  select starts_at,status into v_starts_at,v_lesson_status from public.lessons where id=p_lesson_id and group_id=v_group_id for update;
  if not found then raise exception 'lesson not found' using errcode='P0002'; end if;
  if v_group_status='archived' then raise exception 'group archived' using errcode='22023'; end if;
  if v_lesson_status='cancelled' then raise exception 'lesson cancelled' using errcode='22023'; end if;
  if v_starts_at>now() then raise exception 'lesson has not started' using errcode='22023'; end if;
  perform 1 from public.enrollments e join public.profiles p on p.id=e.student_id
    where e.group_id=v_group_id and e.student_id=p_student_id and e.status='accepted' and p.role='student' for update of e;
  if not found then raise exception 'student is not currently accepted' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_status is null then
    delete from public.lesson_attendance where lesson_id=p_lesson_id and student_id=p_student_id;
  else
    insert into public.lesson_attendance(lesson_id,student_id,status,recorded_at,recorded_by)
    values(p_lesson_id,p_student_id,p_status,now(),auth.uid())
    on conflict(lesson_id,student_id) do update set status=excluded.status,recorded_at=excluded.recorded_at,recorded_by=excluded.recorded_by;
  end if;
end $$;

create or replace function public.dismiss_feedback_prompt(p_group_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or public.current_role() is distinct from 'student'::public.user_role then
    raise exception 'active student required' using errcode='42501';
  end if;
  if p_group_id is null then return; end if;
  perform dars_private.lock_feedback_profile_parents(null,v_uid,false);
  perform dars_private.feedback_prompt_pair_lock(p_group_id,v_uid);
  update dars_private.feedback_prompt_state set state='dismissed',updated_at=clock_timestamp()
    where group_id=p_group_id and student_id=v_uid and state='prompted';
  delete from public.user_notifications where recipient_id=v_uid and kind='feedback_prompt'
    and event_key='feedback-prompt:'||p_group_id::text;
end $$;
revoke all on function public.dismiss_feedback_prompt(uuid) from public,anon,service_role;
grant execute on function public.dismiss_feedback_prompt(uuid) to authenticated;

-- Bell reads are the bounded reconciliation point for time passage: lesson end
-- itself does not fire a trigger, so an old attendance can prompt on next read.
create or replace function public.notifications_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,auth
as $$
declare v_uid uuid:=auth.uid(); v_total bigint; v_unread bigint; v_rows jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  perform dars_private.ensure_my_feedback_prompts();
  select count(*),count(*) filter(where read_at is null) into v_total,v_unread from public.user_notifications where recipient_id=v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'payload',q.payload,'created_at',q.created_at,'read_at',q.read_at) order by q.created_at desc,q.id desc),'[]'::jsonb)
    into v_rows from (select id,kind,payload,created_at,read_at from public.user_notifications where recipient_id=v_uid order by created_at desc,id desc offset p_offset limit p_limit) q;
  return jsonb_build_object('rows',v_rows,'total',v_total,'unread',v_unread);
end $$;

create or replace function public.notifications_unread_count()
returns integer language plpgsql volatile security definer set search_path=pg_catalog,public,auth
as $$ declare v_uid uuid:=auth.uid(); v_count bigint; begin
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  perform dars_private.ensure_my_feedback_prompts();
  select count(*) into v_count from public.user_notifications where recipient_id=v_uid and read_at is null;
  return v_count::integer;
end $$;
-- Keep the prior notification RPC signature and authenticated-only grants.
revoke all on function public.notifications_page(integer,integer),public.notifications_unread_count() from public,anon,service_role;
grant execute on function public.notifications_page(integer,integer),public.notifications_unread_count() to authenticated;

-- Rebuild from the latest accepted set of existing kinds; adding one kind must
-- not accidentally remove a notification producer introduced by later work.
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check check(kind in (
  'lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed',
  'enrollment_requested','teacher_review_requested','teacher_review_decision','teacher_fee_announcement',
  'enrollment_accepted','booking_updated','waitlist_promoted',
  'feedback_prompt','feedback_pending','feedback_decision'
));

create or replace function public.moderate_group_feedback_with_reason(
  p_id uuid,p_decision text,p_note text,p_expected_version bigint,p_student_reason text
) returns bigint language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_row dars_private.group_feedback; v_next bigint; v_reason text:=btrim(coalesce(p_student_reason,''));
begin
  if public.current_role() is distinct from 'admin'::public.user_role then
    raise exception 'active admin required' using errcode='42501';
  end if;
  if p_decision is null or p_decision not in ('approve','hide','approve_reply','hide_reply') then
    raise exception 'invalid moderation decision' using errcode='22023';
  end if;
  if p_decision='hide' and (length(v_reason) not between 1 and 500) then
    raise exception 'student reason must be between 1 and 500 characters' using errcode='22023';
  end if;
  v_next:=public.moderate_group_feedback(p_id,p_decision,p_note,p_expected_version);
  -- The canonical routine holds its feedback row lock through this transaction
  -- and acquired recipient profile parents first. Read only its resulting row.
  select * into v_row from dars_private.group_feedback where id=p_id;
  if not found or v_row.version is distinct from v_next then
    raise exception 'feedback changed; retry moderation' using errcode='40001';
  end if;
  if p_decision='hide' then
    update public.user_notifications set payload=payload||jsonb_build_object('student_reason',v_reason)
      where recipient_id=v_row.student_id and kind='feedback_decision'
        and event_key='feedback-decision:'||p_id::text||':'||v_next::text;
  end if;
  return v_next;
end $$;
revoke all on function public.moderate_group_feedback_with_reason(uuid,text,text,bigint,text) from public,anon,service_role;
grant execute on function public.moderate_group_feedback_with_reason(uuid,text,text,bigint,text) to authenticated;

commit;
