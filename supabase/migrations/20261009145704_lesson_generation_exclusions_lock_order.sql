begin;

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
  select g.teacher_id into v_locked_teacher_id from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
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
    where g.teacher_id=v_teacher_id and s.weekday=p_weekday
      and s.start_time<p_end_time and s.end_time>p_start_time
      and s.id is distinct from p_slot_id
  ) into v_bad;
  if v_bad then raise exception 'teacher recurring schedule overlaps'; end if;

  select exists(
    select 1 from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=v_teacher_id
      and l.status in ('scheduled'::public.lesson_status,'completed'::public.lesson_status)
      and extract(dow from (l.starts_at at time zone 'Africa/Cairo'))::int=p_weekday
      and (l.starts_at at time zone 'Africa/Cairo')::time<p_end_time
      and (l.ends_at at time zone 'Africa/Cairo')::time>p_start_time
  ) into v_bad;
  if v_bad then raise exception 'schedule overlaps existing lesson'; end if;

  if p_slot_id is null then
    insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
    values(p_group_id,p_weekday,p_start_time,p_end_time) returning id into v_slot_id;
  else
    update public.group_schedule_slots
    set weekday=p_weekday,start_time=p_start_time,end_time=p_end_time
    where id=p_slot_id and group_id=p_group_id returning id into v_slot_id;
    if v_slot_id is null then raise exception 'slot not found'; end if;
  end if;
  return v_slot_id;
end
$$;

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
  select g.teacher_id into v_locked_teacher_id from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;

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
  v_bad boolean;
begin
  if p_status not in ('scheduled','cancelled','completed') then raise exception 'invalid lesson status'; end if;
  select l.group_id,g.teacher_id into v_group_id,v_teacher_id
  from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id;
  if v_group_id is null then raise exception 'lesson not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(v_group_id) then raise exception 'not authorized'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id into v_locked_teacher_id from public.groups g where g.id=v_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  select l.group_id into v_locked_group_id from public.lessons l where l.id=p_lesson_id for update;
  if v_locked_group_id is null then raise exception 'lesson not found'; end if;
  if v_locked_group_id<>v_group_id then raise exception 'lesson group changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(v_locked_group_id) then raise exception 'not authorized'; end if;

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

create or replace function public.set_lesson_exclusions(p_group_id uuid,p_dates date[])
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_date_count integer;
begin
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_dates is null then raise exception 'exclusion dates are required'; end if;
  if exists(select 1 from unnest(p_dates) as dates(local_date) where local_date is null or not isfinite(local_date)) then
    raise exception 'exclusion dates must be finite and cannot contain NULL';
  end if;
  select count(distinct dates.local_date)::integer into v_date_count from unnest(p_dates) as dates(local_date);
  if v_date_count>366 then raise exception 'at most 366 exclusion dates are allowed'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id into v_locked_teacher_id from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;

  delete from public.group_lesson_exclusions e where e.group_id=p_group_id;
  insert into public.group_lesson_exclusions(group_id,local_date)
  select p_group_id,dates.local_date from unnest(p_dates) as dates(local_date) group by dates.local_date;
end
$$;

create or replace function public.generate_lessons(p_group_id uuid,p_from date,p_until date)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,dars_private
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
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
  select g.teacher_id into v_locked_teacher_id from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;

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

revoke all on public.group_lesson_exclusions from public,anon,authenticated;
grant select on public.group_lesson_exclusions to authenticated;
revoke all on function public.save_schedule_slot(uuid,int,time,time,uuid) from public,anon,authenticated;
revoke all on function public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.set_lesson_status(uuid,text) from public,anon,authenticated;
revoke all on function public.set_lesson_exclusions(uuid,date[]) from public,anon,authenticated;
revoke all on function public.generate_lessons(uuid,date,date) from public,anon,authenticated;
grant execute on function public.save_schedule_slot(uuid,int,time,time,uuid) to authenticated;
grant execute on function public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid) to authenticated;
grant execute on function public.set_lesson_status(uuid,text) to authenticated;
grant execute on function public.set_lesson_exclusions(uuid,date[]) to authenticated;
grant execute on function public.generate_lessons(uuid,date,date) to authenticated;

commit;
