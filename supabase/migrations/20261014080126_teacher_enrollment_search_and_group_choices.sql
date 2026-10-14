begin;

create or replace function public.teacher_enrollment_search(
  p_status text,
  p_query text default '',
  p_group_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_result jsonb;
  v_query text := left(coalesce(p_query, ''), 120);
  v_like text;
begin
  if auth.uid() is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(auth.uid()), false)
     or not exists (select 1 from public.teacher_profiles tp where tp.id = auth.uid() and tp.approved) then
    raise exception 'active approved teacher required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'accepted') then
    raise exception 'invalid enrollment status' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;
  if p_group_id is not null and not public.is_group_owner(p_group_id) then
    raise exception 'group not found' using errcode = '42501';
  end if;

  -- Escape wildcard characters so the supplied text is always a literal substring.
  v_like := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  with matching as materialized (
    select e.id as enrollment_id, e.student_id, p.full_name,
      e.status::text as status, g.id as group_id, g.name as group_name, e.created_at
    from public.enrollments e
    join public.groups g on g.id = e.group_id and g.teacher_id = auth.uid()
    join public.profiles p on p.id = e.student_id
    where e.status::text = p_status
      and (p_group_id is null or g.id = p_group_id)
      and (v_query = '' or p.full_name ilike v_like escape E'\\' or g.name ilike v_like escape E'\\')
  ), page_rows as (
    select * from matching order by created_at asc, enrollment_id asc offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'enrollment_id', enrollment_id, 'student_id', student_id, 'full_name', full_name,
      'status', status, 'group_id', group_id, 'group_name', group_name
    ) order by created_at asc, enrollment_id asc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from matching)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.teacher_group_choices(p_query text default '', p_selected uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_query text := left(coalesce(p_query, ''), 120);
  v_like text;
  v_result jsonb;
begin
  if auth.uid() is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(auth.uid()), false)
     or not exists (select 1 from public.teacher_profiles tp where tp.id = auth.uid() and tp.approved) then
    raise exception 'active approved teacher required' using errcode = '42501';
  end if;
  v_like := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with choices as (
    select g.id, g.name, g.status::text as status, g.created_at
    from public.groups g
    where g.teacher_id = auth.uid() and (v_query = '' or g.name ilike v_like escape E'\\')
    order by g.created_at desc, g.id desc
    limit 50
  ), selected as (
    select g.id, g.name, g.status::text as status, g.created_at
    from public.groups g
    where p_selected is not null and g.id = p_selected and g.teacher_id = auth.uid()
      and not exists (select 1 from choices c where c.id = g.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status)
    order by created_at desc, id desc), '[]'::jsonb) into v_result
  from (select * from choices union all select * from selected) all_choices;
  return v_result;
end;
$$;

revoke all on function public.teacher_enrollment_search(text, text, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.teacher_group_choices(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.teacher_enrollment_search(text, text, uuid, integer, integer) to authenticated;
grant execute on function public.teacher_group_choices(text, uuid) to authenticated;

commit;
