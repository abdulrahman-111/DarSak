begin;

create or replace function public.admin_update_user(p_user_id uuid,p_status text,p_approved boolean default null)
returns void language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_teacher_approved boolean;
  v_state public.teacher_review_state;
  v_desired_status text;
  v_expected uuid;
begin
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  if v_actor is null or coalesce(public.current_role()='admin'::public.user_role,false) is not true
     or v_actor_status is distinct from 'active'::public.user_status then raise exception 'active admin only'; end if;
  if p_user_id is null or p_user_id=v_actor then raise exception 'administrators cannot target themselves'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid status'; end if;
  select role into v_target_role from public.profiles where id=p_user_id;
  if not found then raise exception 'user not found'; end if;
  if v_target_role='admin' then raise exception 'administrators cannot be targets'; end if;
  if p_approved is not null then
    if v_target_role is distinct from 'teacher'::public.user_role then raise exception 'approval applies only to teachers'; end if;
    perform 1 from public.teacher_profiles where id=p_user_id for update;
    select approved into v_teacher_approved from public.teacher_profiles where id=p_user_id;
    select * into v_state from public.teacher_review_state where teacher_id=p_user_id for update;
    if not found then raise exception 'teacher review state not found'; end if;
    v_desired_status:=case when p_approved then 'approved' else 'declined' end;
    if v_state.status='pending' then
      v_expected:=v_state.request_id;
      perform dars_private.apply_teacher_review_decision(p_user_id,v_expected,v_desired_status,
        case when p_approved then null else 'An administrator declined this review. Update your profile and request another review.' end,'legacy_admin');
    elsif v_state.status<>v_desired_status or v_teacher_approved is distinct from p_approved then
      raise exception 'completed review contradicts legacy approval request; use the explicit review workflow';
    end if;
  end if;
  update public.profiles set status=p_status::public.user_status where id=p_user_id;
end $$;

create or replace function public.admin_teacher_access_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_rows jsonb; v_total bigint; v_policy jsonb; begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if not coalesce(public.current_role()='admin'::public.user_role,false) then raise exception 'active admin only' using errcode='42501'; end if;
  select count(*) into v_total from public.teacher_profiles;
  select coalesce(jsonb_agg(jsonb_build_object('teacher_id',q.id,'full_name',q.full_name,'approved',q.approved,
    'has_access',dars_private.teacher_has_access(q.id),'expires_at',q.expires_at,'pending_request_id',q.pending_request_id)
    order by q.full_name,q.id),'[]'::jsonb) into v_rows from (
      select t.id,p.full_name,t.approved,s.expires_at,(select r.id from dars_private.teacher_access_requests r where r.teacher_id=t.id and r.status='pending') pending_request_id
      from public.teacher_profiles t join public.profiles p on p.id=t.id left join dars_private.teacher_access_state s on s.teacher_id=t.id
      order by p.full_name,t.id offset p_offset limit p_limit) q;
  select jsonb_build_object('fees_enabled',fees_enabled,'effective_at',effective_at,'announcement_en',announcement_en,'announcement_ar',announcement_ar)
    into v_policy from dars_private.teacher_access_fee_policy where singleton;
  return jsonb_build_object('rows',v_rows,'total',v_total,'policy',v_policy);
end $$;

create or replace function public.admin_teacher_access_history(p_teacher_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_grants jsonb; v_requests jsonb; v_gt bigint; v_rt bigint; begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if not coalesce(public.current_role()='admin'::public.user_role,false) then raise exception 'active admin only' using errcode='42501'; end if;
  if not exists(select 1 from public.teacher_profiles where id=p_teacher_id) then raise exception 'teacher not found'; end if;
  select count(*) into v_gt from dars_private.teacher_access_grants where teacher_id=p_teacher_id;
  select count(*) into v_rt from dars_private.teacher_access_requests where teacher_id=p_teacher_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_grants from (
    select id,starts_at,expires_at,source,created_at from dars_private.teacher_access_grants where teacher_id=p_teacher_id order by created_at desc,id desc offset p_offset limit p_limit) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_requests from (
    select id,status,created_at,decided_at from dars_private.teacher_access_requests where teacher_id=p_teacher_id order by created_at desc,id desc offset p_offset limit p_limit) q;
  return jsonb_build_object('grants',v_grants,'requests',v_requests,'total_grants',v_gt,'total_requests',v_rt);
end $$;

create or replace function public.set_teacher_access_fee_policy(p_enabled boolean,p_effective_at timestamptz,p_announcement_en text,p_announcement_ar text,p_confirm boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_old dars_private.teacher_access_fee_policy%rowtype; v_changed boolean; v_en text; v_ar text; begin
  if p_enabled is null then raise exception 'fee switch is required' using errcode='22023'; end if;
  if not coalesce(public.current_role()='admin'::public.user_role,false) then raise exception 'active admin only' using errcode='42501'; end if;
  select * into v_old from dars_private.teacher_access_fee_policy where singleton for update;
  v_en:=case when p_enabled then nullif(btrim(p_announcement_en),'') else null end;
  v_ar:=case when p_enabled then nullif(btrim(p_announcement_ar),'') else null end;
  v_changed:=v_old.fees_enabled is distinct from p_enabled or v_old.effective_at is distinct from case when p_enabled then p_effective_at else null end
    or v_old.announcement_en is distinct from v_en or v_old.announcement_ar is distinct from v_ar;
  if not v_changed then return; end if;
  if p_enabled and p_confirm is distinct from true then raise exception 'explicit confirmation required' using errcode='22023'; end if;
  if p_enabled and (p_effective_at is null or p_effective_at<=clock_timestamp() or length(coalesce(v_en,'')) not between 1 and 1000
      or length(coalesce(v_ar,'')) not between 1 and 1000) then raise exception 'future fee policy and bounded announcements required' using errcode='22023'; end if;
  update dars_private.teacher_access_fee_policy set fees_enabled=p_enabled,effective_at=case when p_enabled then p_effective_at else null end,
    announcement_en=v_en,announcement_ar=v_ar,
    updated_at=statement_timestamp(),updated_by=v_uid where singleton;
  if p_enabled then insert into dars_private.teacher_access_announcements(actor_id,effective_at,announcement_en,announcement_ar)
    values(v_uid,p_effective_at,v_en,v_ar); end if;
end $$;

create or replace function public.decide_teacher_access_request(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_req dars_private.teacher_access_requests%rowtype; v_teacher_status public.user_status; v_role public.user_role; v_now timestamptz; v_current_expiry timestamptz; begin
  if p_approve is null then raise exception 'decision is required' using errcode='22023'; end if;
  if not coalesce(public.current_role()='admin'::public.user_role,false) then raise exception 'active admin only' using errcode='42501'; end if;
  select * into v_req from dars_private.teacher_access_requests where id=p_request_id;
  if not found then raise exception 'request not found'; end if;
  perform 1 from dars_private.teacher_access_state where teacher_id=v_req.teacher_id for update;
  if not found then
    perform 1 from public.teacher_profiles where id=v_req.teacher_id for update;
    if not found then raise exception 'teacher profile missing'; end if;
    perform 1 from dars_private.teacher_access_state where teacher_id=v_req.teacher_id for update;
  end if;
  perform 1 from dars_private.teacher_access_fee_policy where singleton for share;
  select * into v_req from dars_private.teacher_access_requests where id=p_request_id for update;
  if v_req.status<>'pending' then
    if (v_req.status='approved')=p_approve then return; end if;
    raise exception 'access request already reviewed' using errcode='PT409';
  end if;
  select p.role,p.status into v_role,v_teacher_status from public.profiles p where p.id=v_req.teacher_id;
  if v_role is distinct from 'teacher'::public.user_role then raise exception 'request owner is not a teacher'; end if;
  if p_approve and v_teacher_status is distinct from 'active'::public.user_status then raise exception 'active teacher required for access approval'; end if;
  update dars_private.teacher_access_requests set status=case when p_approve then 'approved' else 'declined' end,
    decided_at=statement_timestamp(),decided_by=v_uid where id=p_request_id;
  if p_approve then
    v_now:=clock_timestamp();
    select expires_at into v_current_expiry from dars_private.teacher_access_state where teacher_id=v_req.teacher_id;
    perform dars_private.issue_teacher_access_grant(v_req.teacher_id,'admin_approved',v_uid,p_request_id,
      case when v_current_expiry>v_now then v_current_expiry else v_now end,true);
  end if;
end $$;

create or replace function public.teacher_lesson_attendance_page(p_lesson_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_total integer; v_rows jsonb; v_role public.user_role;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then
    raise exception 'invalid page' using errcode='22023';
  end if;
  v_role := public.current_role();
  if v_role not in ('teacher','admin') or v_role is null then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id and (v_role='admin' or g.teacher_id=auth.uid())) then
    raise exception 'lesson not found' using errcode='42501';
  end if;
  select count(*)::integer into v_total from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.status='accepted' where l.id=p_lesson_id;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',q.student_id,'full_name',q.full_name,'status',q.status,'recorded_at',q.recorded_at) order by q.full_name,q.student_id),'[]'::jsonb)
  into v_rows from (
    select p.id student_id,p.full_name,a.status,a.recorded_at from public.lessons l
    join public.enrollments e on e.group_id=l.group_id and e.status='accepted'
    join public.profiles p on p.id=e.student_id
    left join public.lesson_attendance a on a.lesson_id=l.id and a.student_id=p.id
    where l.id=p_lesson_id order by p.full_name,p.id offset p_offset limit p_limit
  ) q;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

CREATE OR REPLACE FUNCTION public.cancel_teacher_group(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_cancelled integer;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select teacher_id into v_teacher_id from public.groups where id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id into v_locked_teacher_id from public.groups where id=p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (coalesce(public.current_role()='admin'::public.user_role,false) or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active group owner or admin only';
  end if;
  update public.groups set status='archived'::public.group_status where id=p_group_id;
  update public.lessons set status='cancelled'::public.lesson_status
    where group_id=p_group_id and status='scheduled'::public.lesson_status and starts_at>statement_timestamp();
  get diagnostics v_cancelled=row_count;
  update public.enrollments set status='rejected'::public.enrollment_status
    where group_id=p_group_id and status='pending'::public.enrollment_status;
  return v_cancelled;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_unused_teacher_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_group_status public.group_status;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select teacher_id into v_teacher_id from public.groups where id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id,status into v_locked_teacher_id,v_group_status from public.groups where id=p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (coalesce(public.current_role()='admin'::public.user_role,false) or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active group owner or admin only';
  end if;
  if v_group_status not in ('draft'::public.group_status,'archived'::public.group_status) then raise exception 'published groups must be cancelled before deletion'; end if;
  if exists(select 1 from public.enrollments where group_id=p_group_id) then raise exception 'groups with enrollment history cannot be deleted'; end if;
  if exists(select 1 from public.lessons where group_id=p_group_id) then raise exception 'groups with lesson history cannot be deleted'; end if;
  delete from public.groups where id=p_group_id;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_manual_teacher_lesson(p_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
declare
  v_group_id uuid;
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_locked_group_id uuid;
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_lesson public.lessons%rowtype;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select l.group_id,g.teacher_id into v_group_id,v_teacher_id from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id;
  if v_group_id is null then raise exception 'lesson not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id into v_locked_teacher_id from public.groups where id=v_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (coalesce(public.current_role()='admin'::public.user_role,false) or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active lesson owner or admin only';
  end if;
  select * into v_lesson from public.lessons where id=p_lesson_id for update;
  if not found or v_lesson.group_id is distinct from v_group_id then raise exception 'lesson changed'; end if;
  if v_lesson.starts_at<=statement_timestamp() then raise exception 'only future manual lessons can be deleted'; end if;
  if v_lesson.status='completed'::public.lesson_status then raise exception 'completed lessons cannot be deleted'; end if;
  if v_lesson.slot_id is not null then raise exception 'generated lessons must be cancelled instead'; end if;
  if exists(select 1 from public.lesson_materials where lesson_id=p_lesson_id) then raise exception 'remove lesson materials before deleting this lesson'; end if;
  -- Uploads use teacher_id/lesson_id/object-id.extension. Never delete Storage rows here.
  if exists(select 1 from storage.objects o where o.bucket_id='lesson-materials'
      and o.name like v_teacher_id::text||'/'||p_lesson_id::text||'/%') then
    raise exception 'remove stored lesson files before deleting this lesson';
  end if;
  delete from public.lessons where id=p_lesson_id;
end $function$;

create or replace function dars_private.guard_teacher_teaching_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare
  v_actor uuid:=auth.uid();
  v_role public.user_role;
  v_actor_status public.user_status;
  v_old_group uuid;
  v_new_group uuid;
  v_old_owner uuid;
  v_new_owner uuid;
  v_old_lesson uuid;
  v_new_lesson uuid;
begin
  if v_actor is null then return coalesce(new,old); end if;
  select p.role,p.status into v_role,v_actor_status from public.profiles p where p.id=v_actor;
  if v_role='admin' and v_actor_status='active' then
    if public.current_role() is distinct from 'admin'::public.user_role then
      raise exception 'active admin assurance required' using errcode='42501';
    end if;
    return coalesce(new,old);
  end if;
  if v_role is distinct from 'teacher' then return coalesce(new,old); end if;
  if v_actor_status is distinct from 'active'::public.user_status then
    raise exception 'active teacher required' using errcode='42501';
  end if;

  if tg_table_name='groups' then
    if tg_op<>'INSERT' then v_old_owner:=old.teacher_id; end if;
    if tg_op<>'DELETE' then v_new_owner:=new.teacher_id; end if;
  elsif tg_table_name in ('group_schedule_slots','group_lesson_exclusions','group_pinned_announcements') then
    if tg_op<>'INSERT' then v_old_group:=old.group_id; end if;
    if tg_op<>'DELETE' then v_new_group:=new.group_id; end if;
  elsif tg_table_name in ('lessons','lesson_materials') then
    if tg_table_name='lessons' then
      if tg_op<>'INSERT' then v_old_group:=old.group_id; end if;
      if tg_op<>'DELETE' then v_new_group:=new.group_id; end if;
    else
      if tg_op<>'INSERT' then v_old_lesson:=old.lesson_id; end if;
      if tg_op<>'DELETE' then v_new_lesson:=new.lesson_id; end if;
      select l.group_id into v_old_group from public.lessons l where l.id=v_old_lesson;
      select l.group_id into v_new_group from public.lessons l where l.id=v_new_lesson;
    end if;
  elsif tg_table_name in ('enrollments','lesson_attendance') then
    if tg_table_name='enrollments' then
      if tg_op<>'INSERT' then v_old_group:=old.group_id; end if;
      if tg_op<>'DELETE' then v_new_group:=new.group_id; end if;
      -- A student's own cancellation remains available after the group teacher expires.
      if v_actor=coalesce(case when tg_op<>'INSERT' then old.student_id end,case when tg_op<>'DELETE' then new.student_id end)
         and (tg_op='DELETE' or (tg_op='UPDATE' and new.status='cancelled')) then return coalesce(new,old); end if;
    else
      if tg_op<>'INSERT' then v_old_lesson:=old.lesson_id; end if;
      if tg_op<>'DELETE' then v_new_lesson:=new.lesson_id; end if;
      select l.group_id into v_old_group from public.lessons l where l.id=v_old_lesson;
      select l.group_id into v_new_group from public.lessons l where l.id=v_new_lesson;
    end if;
  else return coalesce(new,old);
  end if;

  if v_old_group is not null then select g.teacher_id into v_old_owner from public.groups g where g.id=v_old_group; end if;
  if v_new_group is not null then select g.teacher_id into v_new_owner from public.groups g where g.id=v_new_group; end if;
  -- OLD and NEW ownership are both checked, including reassignment attempts.
  if (v_old_owner is not null and v_old_owner is distinct from v_actor)
     or (v_new_owner is not null and v_new_owner is distinct from v_actor) then
    raise exception 'active teaching owner required' using errcode='42501';
  end if;
  if (v_old_owner=v_actor or v_new_owner=v_actor) and not coalesce(dars_private.teacher_has_access(v_actor),false) then
    raise exception 'teacher teaching access expired' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;

create or replace function public.admin_email_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_rows jsonb; v_total bigint; v_summary jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then
    raise exception 'invalid page' using errcode='22023';
  end if;
  if not coalesce(public.current_role()='admin'::public.user_role,false) then
    raise exception 'active admin only' using errcode='42501';
  end if;
  select count(*) into v_total from dars_private.email_outbox;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_rows from (
    select o.id,o.kind,o.state,o.attempts,o.created_at,o.sent_at,o.next_attempt_at,o.safe_error_code,
      case when o.fixed_admin_recipient then 'Fixed admin mailbox'
        else coalesce(p.full_name,'Unavailable recipient') end recipient_label
    from dars_private.email_outbox o left join public.profiles p on p.id=o.recipient_user_id
    order by o.created_at desc,o.id desc offset p_offset limit p_limit
  ) q;
  select jsonb_build_object(
    'queued',count(*) filter(where state='queued'),'sending',count(*) filter(where state='sending'),
    'sent',count(*) filter(where state='sent'),'failed',count(*) filter(where state='failed'),
    'skipped',count(*) filter(where state='skipped'),
    'oldest_queued_at',min(created_at) filter(where state='queued')
  ) into v_summary from dars_private.email_outbox;
  return jsonb_build_object('rows',v_rows,'total',v_total,'summary',v_summary);
end $$;

create or replace function public.retry_email_job(p_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_state text;
begin
  if not coalesce(public.current_role()='admin'::public.user_role,false) then
    raise exception 'active admin only' using errcode='42501';
  end if;
  select state into v_state from dars_private.email_outbox where id=p_id for update;
  if not found or v_state<>'failed' then raise exception 'failed email job required' using errcode='22023'; end if;
  update dars_private.email_outbox set state='queued',attempts=0,next_attempt_at=clock_timestamp(),
    sent_at=null,safe_error_code=null,lease_token=null,lease_expires_at=null where id=p_id;
end $$;

create or replace function public.admin_update_problem_report(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_public_response text,
  p_admin_note text
) returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_updated_at timestamptz;
  v_status text := p_status;
  v_response text := btrim(coalesce(p_public_response, ''));
  v_note text := btrim(coalesce(p_admin_note, ''));
begin
  if not coalesce(public.current_role() = 'admin'::public.user_role, false) then
    raise exception using errcode = '42501', message = 'An active administrator account is required.';
  end if;
  if p_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'A report id and expected update time are required.';
  end if;
  if v_status is null or v_status not in ('open', 'resolved') then
    raise exception using errcode = '22023', message = 'Status must be open or resolved.';
  end if;
  if length(v_response) > 3000 or length(v_note) > 3000 then
    raise exception using errcode = '22023', message = 'Responses and notes must be 3,000 characters or fewer.';
  end if;
  if v_status = 'resolved' and v_response = '' then
    raise exception using errcode = '22023', message = 'A public response is required to resolve a report.';
  end if;

  select r.updated_at into v_updated_at
  from public.reports r where r.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found.';
  end if;
  if v_updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Report changed since it was opened; refresh and try again.';
  end if;

  update public.reports r
  set status = v_status::public.report_status,
      public_response = v_response,
      admin_note = v_note,
      reviewed_at = coalesce(r.reviewed_at, now()),
      updated_at = clock_timestamp()
  where r.id = p_id
  returning r.updated_at into v_updated_at;
  return v_updated_at;
end;
$$;

create or replace function public.admin_problem_report_page(
  p_status text default 'all',
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_total bigint;
  v_rows jsonb;
begin
  if not coalesce(public.current_role() = 'admin'::public.user_role, false) then
    raise exception using errcode = '42501', message = 'An active administrator account is required.';
  end if;
  if p_status is null or p_status not in ('all', 'open', 'resolved') then
    raise exception using errcode = '22023', message = 'Status must be all, open, or resolved.';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Offset must be nonnegative and limit must be between 1 and 20.';
  end if;

  select count(*) into v_total from public.reports r where p_status = 'all' or r.status::text = p_status;
  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc), '[]'::jsonb)
  into v_rows
  from (
    select r.id, r.reporter_id, p.full_name as reporter_name, p.role::text as reporter_role,
      r.subject, r.description, r.status::text as status, r.page_path, r.admin_note,
      r.public_response, r.reviewed_at, r.created_at, r.updated_at
    from public.reports r join public.profiles p on p.id = r.reporter_id
    where p_status = 'all' or r.status::text = p_status
    order by r.created_at desc, r.id desc offset p_offset limit p_limit
  ) page_row;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

commit;
