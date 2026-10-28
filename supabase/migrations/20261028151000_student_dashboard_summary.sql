begin;

-- One round trip for the student home page. SECURITY INVOKER: every table read
-- here (enrollments, groups, lessons) is already allowed to the student by RLS
-- (enrollment_read: own rows; groups_read/lesson_read: is_group_member), so RLS
-- stays in force as defence in depth. Because those policies also admit group
-- owners and admins, every read is additionally scoped to auth.uid() explicitly.
-- Week bounds are supplied by the caller (computed in TypeScript) so the week
-- definition lives in exactly one place.
create or replace function public.student_dashboard_summary(
  p_week_start timestamptz,
  p_week_end timestamptz,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_week_start is null or p_week_end is null or p_now is null
     or p_week_end <= p_week_start
     or p_week_end - p_week_start > interval '8 days' then
    raise exception 'invalid Cairo week bounds' using errcode = '22023';
  end if;

  with mine as materialized (
    select e.id, e.group_id, e.status::text as status, e.updated_at
    from public.enrollments e
    where e.student_id = v_actor and e.status::text in ('accepted', 'pending')
  ), accepted as materialized (
    select * from mine where status = 'accepted'
  ), upcoming_lessons as (
    select l.id, l.group_id, l.title, l.starts_at, l.ends_at, l.status::text as status,
      g.name as group_name
    from public.lessons l
    join public.groups g on g.id = l.group_id
    where l.status::text = 'scheduled'
      and l.ends_at > p_now
      and exists (select 1 from accepted a where a.group_id = l.group_id)
    order by l.starts_at, l.id
    limit 5
  ), recent_classes as (
    select a.id, a.group_id, g.name, g.status::text as status, g.location, a.updated_at
    from accepted a
    join public.groups g on g.id = a.group_id
    order by a.updated_at desc, a.id
    limit 4
  ), occupied as (
    select distinct to_char(l.starts_at at time zone 'Africa/Cairo', 'YYYY-MM-DD') as day
    from public.lessons l
    where l.status::text <> 'cancelled'
      and l.starts_at >= p_week_start and l.starts_at < p_week_end
      and exists (select 1 from accepted a where a.group_id = l.group_id)
  )
  select jsonb_build_object(
    'accepted_count', (select count(*) from accepted),
    'pending_count', (select count(*) from mine where status = 'pending'),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'group_id', group_id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
      'status', status, 'group', jsonb_build_object('id', group_id, 'name', group_name)
    ) order by starts_at, id) from upcoming_lessons), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'group_id', group_id,
      'group', jsonb_build_object('id', group_id, 'name', name, 'status', status, 'location', location)
    ) order by updated_at desc, id) from recent_classes), '[]'::jsonb),
    'occupied_days', coalesce((select jsonb_agg(day order by day) from occupied), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.student_dashboard_summary(timestamptz,timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.student_dashboard_summary(timestamptz,timestamptz,timestamptz) to authenticated;

commit;
