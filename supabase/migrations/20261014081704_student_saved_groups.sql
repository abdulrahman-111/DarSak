begin;

create table if not exists public.student_saved_groups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (student_id, group_id)
);

alter table public.student_saved_groups enable row level security;
revoke all on public.student_saved_groups from public, anon, authenticated, service_role;
grant select, delete on public.student_saved_groups to authenticated;
create policy student_saved_groups_read_own on public.student_saved_groups
  for select to authenticated using (student_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.status='active'
  ));
create policy student_saved_groups_delete_own on public.student_saved_groups
  for delete to authenticated using (student_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.status='active'
  ));

create or replace function public.save_student_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_student uuid := auth.uid();
begin
  if v_student is null or not exists (
    select 1 from public.profiles p where p.id=v_student and p.role='student' and p.status='active'
  ) then raise exception 'active student required'; end if;
  if not exists (
    select 1 from public.groups g
    join public.profiles p on p.id=g.teacher_id and p.role='teacher' and p.status='active'
    join public.teacher_profiles tp on tp.id=p.id and tp.approved
    where g.id=p_group_id and g.status='published'
  ) then raise exception 'published group unavailable'; end if;
  insert into public.student_saved_groups(student_id,group_id)
  values(v_student,p_group_id) on conflict(student_id,group_id) do nothing;
end $$;

create or replace function public.unsave_student_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.status='active'
  ) then raise exception 'active student required'; end if;
  delete from public.student_saved_groups where student_id=auth.uid() and group_id=p_group_id;
end $$;

create or replace function public.student_saved_group_page(p_offset integer default 0, p_limit integer default 20)
returns table(id uuid, group_id uuid, saved_at timestamptz, available boolean, group_name text, next_lesson_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.status='active'
  ) then raise exception 'active student required'; end if;
  return query
  with bounded_saved as materialized (
    select saved.id, saved.group_id, saved.saved_at
    from public.student_saved_groups saved
    where saved.student_id=auth.uid()
    order by saved.saved_at desc, saved.id desc
    offset least(greatest(coalesce(p_offset,0),0),1000000)
    limit least(greatest(coalesce(p_limit,20),1),20)
  )
  select saved.id, saved.group_id, saved.saved_at, (detail.id is not null), detail.name, detail.next_lesson_at
  from bounded_saved saved
  left join lateral public.public_group_detail(saved.group_id) detail on true
  order by saved.saved_at desc, saved.id desc;
end $$;

revoke all on function public.save_student_group(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unsave_student_group(uuid) from public, anon, authenticated, service_role;
revoke all on function public.student_saved_group_page(integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.save_student_group(uuid) to authenticated;
grant execute on function public.unsave_student_group(uuid) to authenticated;
grant execute on function public.student_saved_group_page(integer,integer) to authenticated;
commit;
