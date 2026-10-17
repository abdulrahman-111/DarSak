begin;

-- Existing opt-ins no longer confer visitor access. Keep the legacy column and
-- RPC arguments for deployed clients, but normalize every stored value.
update public.teacher_contacts set visibility = 'enrolled' where visibility = 'public';

drop trigger if exists teacher_contacts_enrolled_visibility on public.teacher_contacts;
create or replace function public.normalize_teacher_contact_visibility()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.visibility = 'public' then
    new.visibility := 'enrolled';
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_teacher_contact_visibility() from public, anon, authenticated;
create trigger teacher_contacts_enrolled_visibility
before insert or update of visibility on public.teacher_contacts
for each row execute function public.normalize_teacher_contact_visibility();

alter table public.teacher_contacts drop constraint if exists teacher_contacts_visibility;
alter table public.teacher_contacts add constraint teacher_contacts_visibility check (visibility = 'enrolled');

create or replace function public.can_read_teacher_contacts(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(exists (
    select 1
    from public.teacher_contacts c
    join public.profiles tp on tp.id = c.teacher_id
    join public.teacher_profiles t on t.id = c.teacher_id
    where c.teacher_id = p_teacher_id
      and (
        (tp.id = auth.uid()
          and tp.role = 'teacher'::public.user_role
          and tp.status = 'active'::public.user_status)
        or exists (
          select 1 from public.profiles ap
          where ap.id = auth.uid()
            and ap.role = 'admin'::public.user_role
            and ap.status = 'active'::public.user_status
        )
        or (
          tp.role = 'teacher'::public.user_role
          and tp.status = 'active'::public.user_status
          and t.approved
          and exists (
            select 1
            from public.enrollments e
            join public.groups g on g.id = e.group_id
            join public.profiles sp on sp.id = e.student_id
            where g.teacher_id = c.teacher_id
              and e.student_id = auth.uid()
              and e.status = 'accepted'::public.enrollment_status
              and sp.role = 'student'::public.user_role
              and sp.status = 'active'::public.user_status
          )
        )
      )
  ), false)
$$;
revoke all on function public.can_read_teacher_contacts(uuid) from public;
grant execute on function public.can_read_teacher_contacts(uuid) to anon, authenticated;

commit;
