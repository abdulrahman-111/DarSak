-- Keep row-independent auth helpers as initplans so PostgreSQL evaluates them
-- once per statement instead of once per candidate row.
begin;

alter policy profile_self_read on public.profiles
  using (id = (select auth.uid()) or (select public.current_role()) = 'admin');
alter policy profile_self_update on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy teacher_update on public.teacher_profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
alter policy teacher_read on public.teacher_profiles
  using ((approved = true and exists (
    select 1 from public.profiles p
    where p.id = teacher_profiles.id and p.status = 'active' and p.role = 'teacher'
  )) or id = (select auth.uid()) or (select public.current_role()) = 'admin');

alter policy student_read on public.student_profiles
  using (id = (select auth.uid()) or (select public.current_role()) = 'admin');
alter policy student_update on public.student_profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy specialization_all on public.teacher_specializations
  using (teacher_id = (select auth.uid()) or (select public.current_role()) = 'admin')
  with check (teacher_id = (select auth.uid()) or (select public.current_role()) = 'admin');

alter policy groups_read on public.groups
  using ((status = 'published' and exists (
    select 1 from public.profiles p join public.teacher_profiles t on t.id = p.id
    where p.id = groups.teacher_id and p.status = 'active' and t.approved = true
  )) or (teacher_id = (select auth.uid()) and (select public.is_active_user()))
  or (select public.current_role()) = 'admin' or public.is_group_member(id));
alter policy groups_write on public.groups
  using ((teacher_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.current_role()) = 'admin')
  with check ((teacher_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.current_role()) = 'admin');

alter policy enrollment_read on public.enrollments
  using (student_id = (select auth.uid()) or public.is_group_owner(group_id)
    or (select public.current_role()) = 'admin');

alter policy slots_read on public.group_schedule_slots
  using (exists (
    select 1 from public.groups g
    where g.id = group_schedule_slots.group_id and (
      (g.teacher_id = (select auth.uid()) and (select public.is_active_user()))
      or (select public.current_role()) = 'admin'
      or public.is_group_member(g.id)
      or (g.status = 'published' and exists (
        select 1 from public.profiles p join public.teacher_profiles t on t.id = p.id
        where p.id = g.teacher_id and p.status = 'active' and p.role = 'teacher' and t.approved = true
      ))
    )
  ));
alter policy slots_write on public.group_schedule_slots
  using (exists (
    select 1 from public.groups g
    where g.id = group_schedule_slots.group_id and (
      (g.teacher_id = (select auth.uid()) and (select public.is_active_user()))
      or (select public.current_role()) = 'admin'
    )
  ))
  with check (exists (
    select 1 from public.groups g
    where g.id = group_schedule_slots.group_id and (
      (g.teacher_id = (select auth.uid()) and (select public.is_active_user()))
      or (select public.current_role()) = 'admin'
    )
  ));

alter policy notification_read on public.notifications
  using (user_id = (select auth.uid()) or (select public.current_role()) = 'admin');
alter policy notification_update on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy report_read on public.reports
  using (reporter_id = (select auth.uid()) or (select public.current_role()) = 'admin');
alter policy report_insert on public.reports
  with check (reporter_id = (select auth.uid()) and (select public.is_active_user()));

alter policy material_write on public.lesson_materials
  using ((select public.current_role()) = 'admin' or (uploaded_by = (select auth.uid()) and (select public.is_active_user())
    and exists (
      select 1 from public.lessons l join public.groups g on g.id = l.group_id
      where l.id = lesson_materials.lesson_id and g.teacher_id = (select auth.uid())
    )))
  with check ((select public.current_role()) = 'admin' or (uploaded_by = (select auth.uid())
    and (select public.is_active_user())
    and ((kind <> 'file') or storage_path ~ ('^' || (select auth.uid())::text || '/' || lesson_id::text || '/[^/]+$'))
    and exists (
      select 1 from public.lessons l join public.groups g on g.id = l.group_id
      where l.id = lesson_materials.lesson_id and g.teacher_id = (select auth.uid())
    )));

alter policy teacher_contacts_manage on public.teacher_contacts
  using ((teacher_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher' and p.status = 'active'
  )) or (select public.current_role()) = 'admin')
  with check ((teacher_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher' and p.status = 'active'
  )) or (select public.current_role()) = 'admin');

alter policy teacher_review_state_authorized_read on public.teacher_review_state
  using ((teacher_id = (select auth.uid()) and (select public.is_active_user()))
    or ((select public.current_role()) = 'admin' and (select public.is_active_user())));
alter policy teacher_review_events_authorized_read on public.teacher_review_events
  using ((teacher_id = (select auth.uid()) and (select public.is_active_user()))
    or ((select public.current_role()) = 'admin' and (select public.is_active_user())));

create or replace function public.teacher_enrollment_page(
  p_status text,
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
language plpgsql
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
  if p_status is null or p_status not in ('pending', 'accepted') then
    raise exception 'status must be pending or accepted' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;

  with page_rows as materialized (
    select e.id as enrollment_id, e.student_id, e.status::text as status,
      g.id as group_id, g.name as group_name, e.updated_at
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    where g.teacher_id = v_actor and e.status = p_status::public.enrollment_status
    order by e.updated_at desc, e.id desc
    offset p_offset limit p_limit
  ), page as (
    select page_rows.*, p.full_name
    from page_rows join public.profiles p on p.id = page_rows.student_id
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', page.enrollment_id,
        'student_id', page.student_id,
        'full_name', page.full_name,
        'status', page.status,
        'group_id', page.group_id,
        'group_name', page.group_name
      ) order by page.updated_at desc, page.enrollment_id desc)
      from page
    ), '[]'::jsonb),
    'total', (
      select count(*) from public.enrollments e
      join public.groups g on g.id = e.group_id
      where g.teacher_id = v_actor and e.status = p_status::public.enrollment_status
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.teacher_enrollment_page(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.teacher_enrollment_page(text, integer, integer) to authenticated;

create index if not exists lessons_slot_group_idx on public.lessons(slot_id, group_id);
create index if not exists lesson_materials_uploaded_by_idx on public.lesson_materials(uploaded_by);
create index if not exists student_profiles_offering_id_idx on public.student_profiles(offering_id);
create index if not exists teacher_profiles_cover_object_idx on public.teacher_profiles(cover_bucket_id, cover_path);
create index if not exists teacher_review_events_actor_user_id_idx on public.teacher_review_events(actor_user_id);
create index if not exists teacher_review_state_reviewed_by_idx on public.teacher_review_state(reviewed_by);

commit;
