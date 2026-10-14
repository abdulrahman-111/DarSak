begin;

create or replace function public.calendar_lesson_export(p_from date, p_until date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.user_role;
  v_from timestamptz;
  v_until timestamptz;
  v_rows jsonb;
  v_total integer;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_actor and p.status = 'active';

  if v_actor is null or v_role is null or v_role not in ('student', 'teacher') then
    raise exception 'active student or teacher required' using errcode = '42501';
  end if;
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'calendar dates are required and must be ordered' using errcode = '22023';
  end if;
  if p_until - p_from + 1 > 93 then
    raise exception 'calendar range cannot exceed 93 days' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Africa/Cairo';
  v_until := (p_until + 1)::timestamp at time zone 'Africa/Cairo';

  with visible_lessons as materialized (
    select l.id, l.title, l.starts_at, l.ends_at, l.status, l.created_at,
           g.name as group_name, g.location
    from public.lessons l
    join public.groups g on g.id = l.group_id
    where l.starts_at >= v_from
      and l.starts_at < v_until
      and (
        (v_role = 'student' and exists (
          select 1 from public.enrollments e
          where e.group_id = l.group_id and e.student_id = v_actor and e.status = 'accepted'
        ))
        or (v_role = 'teacher' and g.teacher_id = v_actor)
      )
    order by l.starts_at, l.id
    limit 501
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'title', title,
           'starts_at', starts_at,
           'ends_at', ends_at,
           'status', status,
           'created_at', created_at,
           'group_name', group_name,
           'location', location
         ) order by starts_at, id), '[]'::jsonb)
  into v_total, v_rows
  from visible_lessons;

  if v_total > 500 then
    raise exception 'calendar export exceeds 500 lessons' using errcode = '54000';
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

revoke all on function public.calendar_lesson_export(date, date) from public;
revoke all on function public.calendar_lesson_export(date, date) from anon, service_role;
grant execute on function public.calendar_lesson_export(date, date) to authenticated;

commit;
