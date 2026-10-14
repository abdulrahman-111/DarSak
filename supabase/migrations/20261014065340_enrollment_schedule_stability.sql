begin;

create or replace function public.request_enrollment(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  v_group public.groups;
  v_enrollment public.enrollments;
begin
  if public.current_role() is distinct from 'student'::public.user_role then
    raise exception 'only active students may request';
  end if;

  -- Match public_groups(): only a published group owned by an active,
  -- approved teacher is discoverable and therefore requestable.
  select * into v_group from public.groups where id=p_group_id for update;
  if not found or v_group.status is distinct from 'published'::public.group_status
     or not exists (
       select 1 from public.profiles p
       join public.teacher_profiles tp on tp.id=p.id
       where p.id=v_group.teacher_id and p.role='teacher'::public.user_role
         and p.status='active'::public.user_status and tp.approved
     ) then
    raise exception 'published group not found';
  end if;

  insert into public.enrollments(group_id,student_id) values(p_group_id,auth.uid())
  on conflict(group_id,student_id) do update
    set status=case when public.enrollments.status in ('rejected','cancelled','removed')
      then 'pending'::public.enrollment_status else public.enrollments.status end,
      updated_at=now()
  returning * into v_enrollment;
  return v_enrollment.id;
end
$$;

create or replace function public.decide_enrollment(p_enrollment_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  v_group_id uuid;
  v_group public.groups;
  v_enrollment public.enrollments;
  v_count integer;
begin
  -- Discover the parent id without locking, then follow cancellation's lock
  -- order: group first, enrollment second. Re-read after both locks.
  select group_id into v_group_id from public.enrollments where id=p_enrollment_id;
  if not found then raise exception 'not authorized'; end if;
  select * into v_group from public.groups where id=v_group_id for update;
  if not found then raise exception 'not authorized'; end if;
  select * into v_enrollment from public.enrollments
    where id=p_enrollment_id and group_id=v_group_id for update;
  if not found
     or (public.current_role() is distinct from 'admin'::public.user_role
       and not public.is_group_owner(v_group_id)) then
    raise exception 'not authorized';
  end if;

  if p_status='accepted' then
    if v_group.status is distinct from 'published'::public.group_status then
      raise exception 'cannot accept enrollment for archived or unpublished group';
    end if;
    if v_enrollment.status<>'pending' then raise exception 'only pending can be accepted'; end if;
    select count(*) into v_count from public.enrollments
      where group_id=v_group_id and status='accepted'::public.enrollment_status;
    if v_count>=v_group.capacity then raise exception 'group is full'; end if;
  elsif p_status='rejected' and v_enrollment.status<>'pending' then
    raise exception 'only pending can be rejected';
  elsif p_status='removed' and v_enrollment.status<>'accepted' then
    raise exception 'only accepted can be removed';
  elsif p_status not in ('accepted','rejected','removed') then
    raise exception 'invalid decision';
  end if;

  update public.enrollments set status=p_status::public.enrollment_status where id=v_enrollment.id;
  insert into public.notifications(user_id,kind,title_ar,title_en,href) values
    (v_enrollment.student_id,'enrollment_decision',
     case when p_status='accepted' then 'تم قبول طلب الانضمام' when p_status='removed' then 'تمت إزالة عضويتك' else 'تم رفض طلب الانضمام' end,
     case when p_status='accepted' then 'Your enrollment was accepted' when p_status='removed' then 'Your membership was removed' else 'Your enrollment was rejected' end,
     '/student/classes');
end
$$;

create or replace function public.save_schedule_slot(
  p_group_id uuid,
  p_weekday int,
  p_start_time time,
  p_end_time time,
  p_slot_id uuid default null
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
  v_bad boolean;
begin
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_weekday not between 0 and 6 or p_start_time is null or p_end_time is null or p_start_time>=p_end_time then
    raise exception 'invalid schedule slot';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status
    from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if v_group_status='archived'::public.group_status then raise exception 'cannot edit archived group schedule'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;

  if p_slot_id is not null then
    select s.group_id into v_existing_group from public.group_schedule_slots s where s.id=p_slot_id for update;
    if v_existing_group is null then raise exception 'slot not found'; end if;
    if v_existing_group<>p_group_id then raise exception 'slot belongs to another group'; end if;
  end if;

  select exists(
    select 1 from public.group_schedule_slots s
    join public.groups g on g.id=s.group_id
    where g.teacher_id=v_teacher_id and g.status<>'archived'::public.group_status
      and s.weekday=p_weekday and s.start_time<p_end_time and s.end_time>p_start_time
      and s.id is distinct from p_slot_id
  ) into v_bad;
  if v_bad then raise exception 'teacher recurring schedule overlaps'; end if;

  select exists(
    select 1 from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=v_teacher_id and g.status<>'archived'::public.group_status
      and l.status='scheduled'::public.lesson_status and l.starts_at>statement_timestamp()
      and extract(dow from (l.starts_at at time zone 'Africa/Cairo'))::int=p_weekday
      and (l.starts_at at time zone 'Africa/Cairo')::time<p_end_time
      and (l.ends_at at time zone 'Africa/Cairo')::time>p_start_time
  ) into v_bad;
  if v_bad then raise exception 'schedule overlaps existing lesson'; end if;

  if p_slot_id is null then
    insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
    values(p_group_id,p_weekday,p_start_time,p_end_time) returning id into v_slot_id;
  else
    update public.group_schedule_slots set weekday=p_weekday,start_time=p_start_time,end_time=p_end_time
    where id=p_slot_id and group_id=p_group_id returning id into v_slot_id;
    if v_slot_id is null then raise exception 'slot not found'; end if;
  end if;
  return v_slot_id;
end
$$;

revoke all on function public.request_enrollment(uuid),public.decide_enrollment(uuid,text),public.save_schedule_slot(uuid,int,time,time,uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_enrollment(uuid),public.decide_enrollment(uuid,text),public.save_schedule_slot(uuid,int,time,time,uuid) to authenticated;

commit;
