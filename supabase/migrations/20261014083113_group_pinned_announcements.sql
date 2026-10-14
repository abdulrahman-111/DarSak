begin;

create table public.group_pinned_announcements (
  group_id uuid primary key references public.groups(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  edited_at timestamptz not null default clock_timestamp()
);

alter table public.group_pinned_announcements enable row level security;
revoke all on public.group_pinned_announcements from public, anon, authenticated, service_role;
grant select on public.group_pinned_announcements to authenticated;

create policy group_pinned_announcements_read_authorized on public.group_pinned_announcements
  for select to authenticated using (
    exists (
      select 1 from public.groups g
      join public.profiles owner_profile on owner_profile.id = g.teacher_id
      where g.id = group_pinned_announcements.group_id
        and g.teacher_id = (select auth.uid())
        and owner_profile.role = 'teacher'
        and owner_profile.status = 'active'
    )
    or exists (
      select 1 from public.profiles admin_profile
      where admin_profile.id = (select auth.uid())
        and admin_profile.role = 'admin'
        and admin_profile.status = 'active'
    )
    or exists (
      select 1 from public.enrollments e
      join public.profiles student_profile on student_profile.id = e.student_id
      where e.group_id = group_pinned_announcements.group_id
        and e.student_id = (select auth.uid())
        and e.status = 'accepted'
        and student_profile.role = 'student'
        and student_profile.status = 'active'
    )
  );

create or replace function public.set_group_pinned_announcement(p_group_id uuid, p_body text)
returns timestamptz
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_owner uuid;
  v_group_status text;
  v_body text;
  v_edited_at timestamptz;
begin
  if auth.uid() is null then raise exception 'active approved teacher owner required'; end if;

  -- Serialize writes against archive/status changes by locking the parent first.
  if not exists (
    select 1 from public.profiles p
    join public.teacher_profiles tp on tp.id = p.id
    where p.id = auth.uid() and p.role = 'teacher' and p.status = 'active' and tp.approved
  ) then raise exception 'active approved teacher owner required'; end if;

  select g.teacher_id, g.status into v_owner, v_group_status
  from public.groups g where g.id = p_group_id and g.teacher_id = auth.uid() for update;
  if not found then raise exception 'group not found or not owned'; end if;
  if v_group_status = 'archived' then raise exception 'archived group cannot be edited'; end if;
  if v_owner <> auth.uid() then raise exception 'active approved teacher owner required'; end if;

  if p_body is null then raise exception 'announcement text required'; end if;
  if char_length(p_body) > 2000 then raise exception 'announcement exceeds 2000 characters'; end if;
  if p_body ~ '^[[:space:]]*$' then
    delete from public.group_pinned_announcements where group_id = p_group_id;
    return null;
  end if;
  v_body := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_body = '' then
    delete from public.group_pinned_announcements where group_id = p_group_id;
    return null;
  end if;

  insert into public.group_pinned_announcements(group_id, body, edited_at)
  values (p_group_id, v_body, clock_timestamp())
  on conflict (group_id) do update set body = excluded.body, edited_at = excluded.edited_at
  returning edited_at into v_edited_at;
  return v_edited_at;
end;
$$;

revoke all on function public.set_group_pinned_announcement(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_group_pinned_announcement(uuid, text) to authenticated;

commit;
