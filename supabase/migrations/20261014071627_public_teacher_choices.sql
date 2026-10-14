create or replace function public.public_teacher_choices(
  p_search text default null,
  p_selected uuid default null
) returns table(id uuid, full_name text)
language sql stable security definer set search_path=pg_catalog,public as $$
  with eligible as (
    select p.id, p.full_name
    from public.profiles p
    join public.teacher_profiles t on t.id=p.id
    where p.role='teacher'::public.user_role
      and p.status='active'::public.user_status
      and t.approved=true
  ), matches as (
    select e.id, e.full_name
    from eligible e
    where nullif(left(trim(coalesce(p_search,'')),80),'') is null
       or position(lower(left(trim(p_search),80)) in lower(e.full_name)) > 0
    order by e.full_name, e.id
    limit 50
  )
  select m.id, m.full_name from matches m
  union
  select e.id, e.full_name from eligible e where p_selected is not null and e.id=p_selected
  order by full_name, id
$$;

revoke all on function public.public_teacher_choices(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.public_teacher_choices(text,uuid) to anon,authenticated;
