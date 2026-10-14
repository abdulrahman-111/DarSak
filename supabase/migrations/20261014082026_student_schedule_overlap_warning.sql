begin;

-- Returns only whether either kind of schedule conflict exists. It deliberately
-- does not return group, slot, lesson, or material identifiers or descriptions.
create or replace function public.student_group_schedule_overlap(p_group_id uuid)
returns table(weekly_overlap boolean, dated_overlap boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null or not exists (
    select 1 from public.profiles p
    where p.id=v_student and p.role='student'::public.user_role
      and p.status='active'::public.user_status
  ) then
    raise exception 'active student required';
  end if;

  if not exists (
    select 1 from public.groups g
    join public.profiles p on p.id=g.teacher_id
    join public.teacher_profiles tp on tp.id=p.id
    where g.id=p_group_id and g.status='published'::public.group_status
      and p.role='teacher'::public.user_role and p.status='active'::public.user_status
      and tp.approved
  ) then
    return query select false, false;
    return;
  end if;

  return query
  with accepted_groups as (
    select g.id
    from public.enrollments e
    join public.groups g on g.id=e.group_id
    where e.student_id=v_student and e.status='accepted'::public.enrollment_status
      and g.status<>'archived'::public.group_status
      and g.id<>p_group_id
  ),
  recurring_conflict as (
    select exists (
      select 1 from public.group_schedule_slots candidate
      join public.group_schedule_slots existing
        on existing.weekday=candidate.weekday
       and existing.start_time<candidate.end_time
       and existing.end_time>candidate.start_time
      join accepted_groups ag on ag.id=existing.group_id
      where candidate.group_id=p_group_id
    ) as conflict
  ),
  date_conflict as (
    -- Compare two real future lessons by their absolute instants.
    select exists (
      select 1 from public.lessons candidate
      join public.lessons existing
        on existing.starts_at<candidate.ends_at and existing.ends_at>candidate.starts_at
      join accepted_groups ag on ag.id=existing.group_id
      where candidate.group_id=p_group_id and candidate.status='scheduled'::public.lesson_status
        and candidate.starts_at>statement_timestamp()
        and existing.status='scheduled'::public.lesson_status
        and existing.starts_at>statement_timestamp()
    )
    -- A proposed weekly slot against a member's real future lesson.
    or exists (
      select 1 from public.group_schedule_slots candidate
      join public.lessons existing on existing.group_id in (select id from accepted_groups)
      cross join lateral (
        select ((local_lesson.local_day + occurrence.day_offset) + candidate.start_time)
                 at time zone 'Africa/Cairo' as slot_start,
               ((local_lesson.local_day + occurrence.day_offset) + candidate.end_time)
                 at time zone 'Africa/Cairo' as slot_end
        from (select (existing.starts_at at time zone 'Africa/Cairo')::date as local_day) local_lesson
        cross join lateral (
          select ((candidate.weekday - extract(dow from local_lesson.local_day)::integer + 7) % 7) + step.days
            as day_offset
          from (values (0),(7)) as step(days)
        ) occurrence
      ) slot_time
      where candidate.group_id=p_group_id and existing.status='scheduled'::public.lesson_status
        and existing.starts_at>statement_timestamp()
        and existing.starts_at<slot_time.slot_end and existing.ends_at>slot_time.slot_start
    )
    -- A proposed dated lesson against a member's recurring weekly slot.
    or exists (
      select 1 from public.lessons candidate
      cross join public.group_schedule_slots existing
      join accepted_groups ag on ag.id=existing.group_id
      cross join lateral (
        select ((local_lesson.local_day + occurrence.day_offset) + existing.start_time)
                 at time zone 'Africa/Cairo' as slot_start,
               ((local_lesson.local_day + occurrence.day_offset) + existing.end_time)
                 at time zone 'Africa/Cairo' as slot_end
        from (select (candidate.starts_at at time zone 'Africa/Cairo')::date as local_day) local_lesson
        cross join lateral (
          select ((existing.weekday - extract(dow from local_lesson.local_day)::integer + 7) % 7) + step.days
            as day_offset
          from (values (0),(7)) as step(days)
        ) occurrence
      ) slot_time
      where candidate.group_id=p_group_id and candidate.status='scheduled'::public.lesson_status
        and candidate.starts_at>statement_timestamp()
        and candidate.starts_at<slot_time.slot_end and candidate.ends_at>slot_time.slot_start
    ) as conflict
  )
  select recurring_conflict.conflict, date_conflict.conflict from recurring_conflict, date_conflict;
end
$$;

revoke all on function public.student_group_schedule_overlap(uuid) from public, anon, authenticated, service_role;
grant execute on function public.student_group_schedule_overlap(uuid) to authenticated;
commit;
