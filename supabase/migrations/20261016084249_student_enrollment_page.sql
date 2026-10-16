begin;

create or replace function public.student_enrollment_page(
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_student_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_student_id is null
     or public.current_role() is distinct from 'student'::public.user_role
     or not coalesce(public.is_active_user(v_student_id), false) then
    raise exception 'active student required' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;

  with page_rows as materialized (
    select e.id, e.group_id, e.status::text as status, e.updated_at,
      g.name, g.status::text as group_status,
      (g.status='published' and (e.status = 'accepted'::public.enrollment_status or exists(
        select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
        where p.id=g.teacher_id and p.role='teacher' and p.status='active'
          and tp.approved and g.status='published'
          and dars_private.teacher_has_access(g.teacher_id)
      ))) as can_view,
      case when e.status = 'accepted'::public.enrollment_status
                  or exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
                    where p.id=g.teacher_id and p.role='teacher' and p.status='active'
                      and tp.approved and g.status='published'
                      and dars_private.teacher_has_access(g.teacher_id))
        then g.location else null end as location
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    where e.student_id = v_student_id
    order by e.updated_at desc, e.id desc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'group_id', r.group_id, 'status', r.status, 'updated_at', r.updated_at,
      'group', jsonb_build_object('id', r.group_id, 'name', r.name,
        'status', r.group_status, 'location', r.location, 'can_view', r.can_view)
    ) order by r.updated_at desc, r.id desc) from page_rows r), '[]'::jsonb),
    'total', (select count(*) from public.enrollments e where e.student_id = v_student_id)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.student_enrollment_page(integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.student_enrollment_page(integer, integer) to authenticated;


commit;
