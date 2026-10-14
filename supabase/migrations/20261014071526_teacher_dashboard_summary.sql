begin;

create or replace function public.teacher_dashboard_summary(
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_now timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(v_actor), false) then
    raise exception 'active teacher required' using errcode = '42501';
  end if;
  if p_day_start is null or p_day_end is null or p_now is null
     or p_day_end <= p_day_start
     or p_day_end - p_day_start < interval '22 hours'
     or p_day_end - p_day_start > interval '26 hours'
     or p_now < p_day_start or p_now >= p_day_end then
    raise exception 'invalid Cairo day bounds' using errcode = '22023';
  end if;

  with owned as materialized (
    select g.id, g.name, g.capacity, g.status::text as status, g.location,
      g.description, g.created_at, s.name_ar as subject_name_ar, s.name_en as subject_name_en
    from public.groups g
    join public.offerings o on o.id = g.offering_id
    join public.subjects s on s.id = o.subject_id
    where g.teacher_id = v_actor
  ), preview_groups as (
    select * from owned order by created_at desc, id desc limit 8
  ), today_lessons as (
    select l.id, l.group_id, l.title, l.starts_at, l.ends_at, l.status::text as status, g.name as group_name
    from public.lessons l join public.groups g on g.id = l.group_id
    where g.teacher_id = v_actor
      and l.status in ('scheduled','completed')
      and l.starts_at < p_day_end and l.ends_at > p_day_start
    order by l.starts_at, l.id limit 8
  ), upcoming_lessons as (
    select l.id, l.group_id, l.title, l.starts_at, l.ends_at, l.status::text as status, g.name as group_name
    from public.lessons l join public.groups g on g.id = l.group_id
    where g.teacher_id = v_actor and l.status = 'scheduled' and l.starts_at >= p_now
    order by l.starts_at, l.id limit 8
  ), draft_candidate as (
    select id, name, status from owned where status = 'draft' order by created_at, id limit 1
  ), missing_schedule_candidate as (
    select g.id, g.name, g.status from owned g
    where g.status <> 'archived'
      and not exists (select 1 from public.group_schedule_slots ss where ss.group_id = g.id)
    order by g.created_at desc, g.id desc limit 1
  )
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'capacity', capacity, 'status', status, 'location', location,
      'description', description,
      'offering', jsonb_build_object('subject', jsonb_build_object('name_ar', subject_name_ar, 'name_en', subject_name_en))
    ) order by created_at desc, id desc) from preview_groups), '[]'::jsonb),
    'group_count', (select count(*) from owned),
    'today', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'group_id', group_id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
      'status', status, 'group', jsonb_build_object('name', group_name)
    ) order by starts_at, id) from today_lessons), '[]'::jsonb),
    'today_count', (select count(*) from public.lessons l join public.groups g on g.id=l.group_id
      where g.teacher_id=v_actor and l.status in ('scheduled','completed') and l.starts_at < p_day_end and l.ends_at > p_day_start),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'group_id', group_id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
      'status', status, 'group', jsonb_build_object('name', group_name)
    ) order by starts_at, id) from upcoming_lessons), '[]'::jsonb),
    'upcoming_count', (select count(*) from public.lessons l join public.groups g on g.id=l.group_id
      where g.teacher_id=v_actor and l.status='scheduled' and l.starts_at >= p_now),
    'has_specializations', exists(select 1 from public.teacher_specializations ts where ts.teacher_id=v_actor),
    'draft_candidate', (select jsonb_build_object('id', id, 'name', name, 'status', status) from draft_candidate),
    'missing_schedule_candidate', (select jsonb_build_object('id', id, 'name', name, 'status', status) from missing_schedule_candidate)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.teacher_dashboard_summary(timestamptz,timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.teacher_dashboard_summary(timestamptz,timestamptz,timestamptz) to authenticated;

commit;
