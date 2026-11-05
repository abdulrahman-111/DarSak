begin;

-- Ordinary admin authority requires the active stored admin role and the
-- top-level assurance claim from the signed access token. Profile metadata is
-- deliberately not consulted. Teachers and students retain their live role.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p.role = 'admin'::public.user_role
      and (select auth.jwt()->>'aal') is distinct from 'aal2'
      then null
    else p.role
  end
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'active'::public.user_status
$$;

-- Replace only the six active-admin RLS arms. Existing teacher ownership,
-- access, and accepted-student paths remain intact.
alter policy teacher_profile_details_owner_read on public.teacher_profile_details
  using (
    teacher_id = (select auth.uid())
    or (select public.current_role()) = 'admin'::public.user_role
  );

alter policy group_pinned_announcements_read_authorized on public.group_pinned_announcements
  using (
    exists (
      select 1
      from public.groups g
      join public.profiles p on p.id = g.teacher_id
      where g.id = group_pinned_announcements.group_id
        and g.teacher_id = (select auth.uid())
        and p.role = 'teacher'::public.user_role
        and p.status = 'active'::public.user_status
        and dars_private.teacher_has_access(g.teacher_id)
    )
    or (select public.current_role()) = 'admin'::public.user_role
    or exists (
      select 1
      from public.enrollments e
      join public.profiles p on p.id = e.student_id
      where e.group_id = group_pinned_announcements.group_id
        and e.student_id = (select auth.uid())
        and e.status = 'accepted'::public.enrollment_status
        and p.role = 'student'::public.user_role
        and p.status = 'active'::public.user_status
    )
  );

alter policy lesson_attendance_private_read on public.lesson_attendance
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'::public.user_status
    )
    and (
      (select public.current_role()) = 'admin'::public.user_role
      or (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'teacher'::public.user_role
        )
        and exists (
          select 1 from public.groups g
          where g.id = (select l.group_id from public.lessons l where l.id = lesson_attendance.lesson_id)
            and g.teacher_id = (select auth.uid())
            and dars_private.teacher_has_access(g.teacher_id)
        )
      )
      or (
        student_id = (select auth.uid())
        and exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'student'::public.user_role
        )
        and exists (
          select 1
          from public.enrollments e
          join public.lessons l on l.group_id = e.group_id
          where l.id = lesson_attendance.lesson_id
            and e.student_id = (select auth.uid())
            and e.status = 'accepted'::public.enrollment_status
        )
      )
    )
  );

alter policy teacher_applications_authorized_read on public.teacher_applications
  using (
    (
      teacher_id = (select auth.uid())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'teacher'::public.user_role
          and p.status = 'active'::public.user_status
      )
    )
    or (select public.current_role()) = 'admin'::public.user_role
  );

alter policy student_read on public.student_profiles
  using (
    (id = (select auth.uid()) and public.is_active_user())
    or (select public.current_role()) = 'admin'::public.user_role
  );

alter policy teacher_rules_authorized_read on public.teacher_rules_acceptances
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'::public.user_status
        and (
          (p.role = 'teacher'::public.user_role and p.id = teacher_id)
          or (select public.current_role()) = 'admin'::public.user_role
        )
    )
  );

commit;
