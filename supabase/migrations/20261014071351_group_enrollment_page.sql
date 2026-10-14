create or replace function public.group_enrollment_page(
  p_group_id uuid,
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_role public.user_role := public.current_role();
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_active_user(auth.uid()), false)
     or (v_role is distinct from 'admin'::public.user_role
       and (v_role is distinct from 'teacher'::public.user_role
         or not coalesce(public.is_group_owner(p_group_id), false))) then
    raise exception 'active group owner or admin required' using errcode = '42501';
  end if;
  if p_group_id is null or p_offset is null or p_offset < 0
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;

  with page_rows as materialized (
    select e.id as enrollment_id, e.student_id, p.full_name, e.status::text as status,
      e.created_at
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    where e.group_id = p_group_id
    order by e.created_at asc, e.id asc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', page_rows.enrollment_id,
        'student_id', page_rows.student_id,
        'full_name', page_rows.full_name,
        'status', page_rows.status
      ) order by page_rows.created_at asc, page_rows.enrollment_id asc)
      from page_rows
    ), '[]'::jsonb),
    'total', (select count(*) from public.enrollments e where e.group_id = p_group_id)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.group_enrollment_page(uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.group_enrollment_page(uuid, integer, integer) to authenticated;
