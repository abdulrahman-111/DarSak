begin;

-- Serialize an upload's pre-metadata object insert with lesson deletion. Both
-- sides take the existing teacher-calendar transaction lock before examining
-- the lesson/object path, so a successful upload cannot become an orphan race.
create or replace function public.can_upload_lesson_object(object_name text)
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,public,auth
as $$
declare v_teacher uuid:=auth.uid(); v_lesson uuid;
begin
  if v_teacher is null or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
     or split_part(object_name,'/',1)<>v_teacher::text then return false; end if;
  v_lesson:=split_part(object_name,'/',2)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  return exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id
    join public.profiles p on p.id=g.teacher_id
    where l.id=v_lesson and g.teacher_id=v_teacher and p.status='active');
end $$;
revoke all on function public.can_upload_lesson_object(text) from public,anon,authenticated,service_role;
grant execute on function public.can_upload_lesson_object(text) to authenticated;

create or replace function public.cancel_teacher_group(p_group_id uuid)
returns integer language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
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
  select teacher_id into v_teacher_id from public.groups where id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id into v_locked_teacher_id from public.groups where id=p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (v_actor_role='admin'::public.user_role or
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
end $$;
revoke all on function public.cancel_teacher_group(uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_teacher_group(uuid) to authenticated;

create or replace function public.delete_unused_teacher_group(p_group_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
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
  select teacher_id into v_teacher_id from public.groups where id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id,status into v_locked_teacher_id,v_group_status from public.groups where id=p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (v_actor_role='admin'::public.user_role or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active group owner or admin only';
  end if;
  if v_group_status not in ('draft'::public.group_status,'archived'::public.group_status) then raise exception 'published groups must be cancelled before deletion'; end if;
  if exists(select 1 from public.enrollments where group_id=p_group_id) then raise exception 'groups with enrollment history cannot be deleted'; end if;
  if exists(select 1 from public.lessons where group_id=p_group_id) then raise exception 'groups with lesson history cannot be deleted'; end if;
  delete from public.groups where id=p_group_id;
end $$;
revoke all on function public.delete_unused_teacher_group(uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_unused_teacher_group(uuid) to authenticated;

create or replace function public.delete_manual_teacher_lesson(p_lesson_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,auth,storage
as $$
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
  select l.group_id,g.teacher_id into v_group_id,v_teacher_id from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id;
  if v_group_id is null then raise exception 'lesson not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id into v_locked_teacher_id from public.groups where id=v_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (v_actor_role='admin'::public.user_role or
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
end $$;
revoke all on function public.delete_manual_teacher_lesson(uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_manual_teacher_lesson(uuid) to authenticated;

commit;
