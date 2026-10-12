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

-- Recheck the locked parent group before every lesson mutation. The calendar
-- lock is shared with group cancellation, so a stale lesson form, generator,
-- or status action cannot repopulate an archived group's future schedule.
create or replace function public.create_lesson(
  p_group_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default '',
  p_lesson_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_existing_group uuid;
  v_slot_id uuid;
  v_local_date date;
  v_lesson_id uuid;
  v_bad boolean;
begin
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at) then
    raise exception 'lesson interval must be finite';
  end if;
  if p_starts_at>=p_ends_at then raise exception 'invalid lesson interval'; end if;
  if length(btrim(p_title)) not between 1 and 200 then raise exception 'invalid lesson title'; end if;
  if length(p_notes)>10000 then raise exception 'lesson notes too long'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if v_group_status='archived'::public.group_status then raise exception 'group is archived'; end if;

  if p_lesson_id is not null then
    select l.group_id,l.slot_id,l.local_date into v_existing_group,v_slot_id,v_local_date
    from public.lessons l where l.id=p_lesson_id for update;
    if v_existing_group is null then raise exception 'lesson not found'; end if;
    if v_existing_group<>p_group_id then raise exception 'lesson belongs to another group'; end if;
  end if;

  select exists(
    select 1 from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=v_teacher_id
      and l.status in ('scheduled'::public.lesson_status,'completed'::public.lesson_status)
      and l.id is distinct from p_lesson_id
      and l.starts_at<p_ends_at and l.ends_at>p_starts_at
  ) into v_bad;
  if v_bad then raise exception 'teacher dated lesson overlaps'; end if;

  if p_lesson_id is null then
    insert into public.lessons(group_id,title,starts_at,ends_at,notes,local_date)
    values(p_group_id,btrim(p_title),p_starts_at,p_ends_at,p_notes,(p_starts_at at time zone 'Africa/Cairo')::date)
    returning id into v_lesson_id;
  else
    update public.lessons
    set title=btrim(p_title),starts_at=p_starts_at,ends_at=p_ends_at,notes=p_notes,
        slot_id=v_slot_id,
        local_date=case when v_slot_id is not null then v_local_date else (p_starts_at at time zone 'Africa/Cairo')::date end
    where id=p_lesson_id and group_id=p_group_id returning id into v_lesson_id;
    if v_lesson_id is null then raise exception 'lesson not found'; end if;
  end if;
  return v_lesson_id;
end
$$;
revoke all on function public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid) to authenticated;

create or replace function public.set_lesson_status(p_lesson_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_group_id uuid;
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_locked_group_id uuid;
  v_group_status public.group_status;
  v_bad boolean;
begin
  if p_status not in ('scheduled','cancelled','completed') then raise exception 'invalid lesson status'; end if;
  select l.group_id,g.teacher_id into v_group_id,v_teacher_id
  from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id;
  if v_group_id is null then raise exception 'lesson not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(v_group_id) then raise exception 'not authorized'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status from public.groups g where g.id=v_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  select l.group_id into v_locked_group_id from public.lessons l where l.id=p_lesson_id for update;
  if v_locked_group_id is null then raise exception 'lesson not found'; end if;
  if v_locked_group_id<>v_group_id then raise exception 'lesson group changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(v_locked_group_id) then raise exception 'not authorized'; end if;
  if p_status='scheduled' and v_group_status='archived'::public.group_status then raise exception 'group is archived'; end if;

  if p_status in ('scheduled','completed') then
    select exists(
      select 1 from public.lessons target
      join public.lessons other on other.id<>target.id
      join public.groups other_group on other_group.id=other.group_id
      where target.id=p_lesson_id and other_group.teacher_id=v_teacher_id
        and other.status in ('scheduled'::public.lesson_status,'completed'::public.lesson_status)
        and other.starts_at<target.ends_at and other.ends_at>target.starts_at
    ) into v_bad;
    if v_bad then raise exception 'teacher dated lesson overlaps'; end if;
  end if;
  update public.lessons set status=p_status::public.lesson_status where id=p_lesson_id;
end
$$;
revoke all on function public.set_lesson_status(uuid,text) from public,anon,authenticated;
grant execute on function public.set_lesson_status(uuid,text) to authenticated;

create or replace function public.generate_lessons(p_group_id uuid,p_from date,p_until date)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,dars_private
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_candidate record;
  v_made integer := 0;
begin
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) then
    raise exception 'generation range dates must be finite';
  end if;
  if p_until<p_from or p_until-p_from>90 then
    raise exception 'range must be 0 to 90 days';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if v_group_status='archived'::public.group_status then raise exception 'group is archived'; end if;

  perform s.id from public.group_schedule_slots s where s.group_id=p_group_id order by s.id for update;
  for v_candidate in
    select * from dars_private.lesson_generation_candidates(p_group_id,p_from,p_until)
  loop
    if v_candidate.state='conflicting' then
      raise exception 'generated lesson overlaps on %',v_candidate.local_date;
    elsif v_candidate.state='ready' then
      insert into public.lessons(group_id,slot_id,local_date,title,starts_at,ends_at)
      values(p_group_id,v_candidate.slot_id,v_candidate.local_date,'Scheduled lesson',v_candidate.starts_at,v_candidate.ends_at)
      on conflict(group_id,slot_id,local_date)
        where slot_id is not null and local_date is not null do nothing;
      if found then v_made:=v_made+1; end if;
    end if;
  end loop;
  return v_made;
end
$$;
revoke all on function public.generate_lessons(uuid,date,date) from public,anon,authenticated;
grant execute on function public.generate_lessons(uuid,date,date) to authenticated;

commit;
