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

-- Lock order shared by attendance, feedback submission and reconciliation:
-- group row, then the advisory student/group pair lock. Dismissal takes only
-- the pair lock, so it cannot introduce a reverse edge in that order.
create or replace function dars_private.feedback_prompt_pair_lock(p_group uuid,p_student uuid)
returns void language sql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$ select pg_advisory_xact_lock(hashtextextended('feedback-prompt:'||p_group::text||':'||p_student::text,0)) $$;
revoke all on function dars_private.feedback_prompt_pair_lock(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function dars_private.ensure_feedback_prompt(p_group_id uuid,p_student_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_inserted integer:=0;
begin
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
  -- Reconcile currently accepted groups (including legacy attendance) and all
  -- durable prompt decisions so visibility/access changes clean pending rows.
  for v_group in
    select e.group_id from public.enrollments e
    where e.student_id=v_uid and e.status='accepted'
    union
    select s.group_id from dars_private.feedback_prompt_state s where s.student_id=v_uid
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
declare v_group uuid; v_student uuid; v_lesson uuid;
begin
  if tg_op='DELETE' then v_lesson:=old.lesson_id; v_student:=old.student_id;
  else v_lesson:=new.lesson_id; v_student:=new.student_id; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status
     and old.lesson_id is not distinct from new.lesson_id
     and old.student_id is not distinct from new.student_id then return new; end if;
  select group_id into v_group from public.lessons where id=v_lesson;
  if v_group is not null then perform dars_private.ensure_feedback_prompt(v_group,v_student); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function dars_private.feedback_prompt_attendance_changed() from public,anon,authenticated,service_role;
create trigger feedback_prompt_attendance_changed
after insert or update of status,lesson_id,student_id or delete on public.lesson_attendance
for each row execute function dars_private.feedback_prompt_attendance_changed();

-- A successful submission creates the durable submitted state in the same
-- transaction and removes the pair's prompt. The trigger covers every save path.
create or replace function dars_private.feedback_notifications_produce()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_group public.groups; v_teacher uuid; v_decision text; v_pending_review boolean:=false;
begin
  if tg_op='INSERT' then
    perform dars_private.feedback_prompt_pair_lock(new.group_id,new.student_id);
  else
    perform dars_private.feedback_prompt_pair_lock(new.group_id,new.student_id);
  end if;
  insert into dars_private.feedback_prompt_state(group_id,student_id,state)
    values(new.group_id,new.student_id,'submitted')
    on conflict(group_id,student_id) do update
      set state='submitted',updated_at=clock_timestamp()
      where dars_private.feedback_prompt_state.state is distinct from 'submitted';
  delete from public.user_notifications where recipient_id=new.student_id
    and kind='feedback_prompt' and event_key='feedback-prompt:'||new.group_id::text;

  select * into v_group from public.groups where id=new.group_id;
  if not found then return new; end if;
  v_teacher:=v_group.teacher_id;
  v_pending_review:=new.status='pending' and
    (tg_op='INSERT' or (new.version is distinct from old.version));
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
  elsif tg_op='UPDATE' and new.reply_pending is distinct from old.reply_pending
        and new.reply_pending<>'' then
    perform dars_private.add_user_notification(p.id,'feedback_pending',
      'feedback-pending:'||new.id::text||':'||new.version::text,
      jsonb_build_object('feedback_id',new.id,'group_id',new.group_id,'category','reply'))
      from public.profiles p where p.role='admin' and p.status='active';
  end if;

  -- Reply decisions are intentionally omitted: they are not review decisions.
  if tg_op='UPDATE' and old.status is distinct from new.status and new.status in ('approved','hidden') then
    v_decision:=case when new.status='approved' then 'approved' else 'hidden' end;
    perform dars_private.add_user_notification(new.student_id,'feedback_decision',
      'feedback-decision:'||new.id::text||':'||new.version::text,
      jsonb_build_object('feedback_id',new.id,'group_id',new.group_id,
        'category','review','decision',v_decision,
        'reason_code',case when new.status='hidden' then 'publication_guidelines' else null end));
  end if;
  return new;
end $$;
revoke all on function dars_private.feedback_notifications_produce() from public,anon,authenticated,service_role;
create trigger feedback_notifications_produce
after insert or update on dars_private.group_feedback
for each row execute function dars_private.feedback_notifications_produce();

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
  if p_decision not in ('approve','hide') then raise exception 'review decision required' using errcode='22023'; end if;
  if p_decision='hide' and (length(v_reason) not between 1 and 500) then
    raise exception 'student reason must be between 1 and 500 characters' using errcode='22023';
  end if;
  select * into v_row from dars_private.group_feedback where id=p_id for update;
  if not found or v_row.version is distinct from p_expected_version then
    raise exception 'feedback changed' using errcode='40001';
  end if;
  v_next:=public.moderate_group_feedback(p_id,p_decision,p_note,p_expected_version);
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
