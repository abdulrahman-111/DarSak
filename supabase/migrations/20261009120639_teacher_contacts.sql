create table public.teacher_contacts (
  teacher_id uuid primary key references public.teacher_profiles(id) on delete cascade,
  phone_number text,
  whatsapp_number text,
  contact_email text,
  visibility text not null default 'enrolled',
  constraint teacher_contacts_phone_e164 check (
    phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint teacher_contacts_whatsapp_e164 check (
    whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint teacher_contacts_email_format check (
    contact_email is null or (
      length(contact_email) between 3 and 254
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint teacher_contacts_visibility check (visibility in ('enrolled','public'))
);

create or replace function public.normalize_teacher_contact_blanks()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.phone_number := nullif(btrim(new.phone_number), '');
  new.whatsapp_number := nullif(btrim(new.whatsapp_number), '');
  new.contact_email := nullif(btrim(new.contact_email), '');
  return new;
end;
$$;

revoke all on function public.normalize_teacher_contact_blanks() from public, anon, authenticated;
create trigger teacher_contacts_normalize_blanks
before insert or update on public.teacher_contacts
for each row execute function public.normalize_teacher_contact_blanks();

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
        (
          tp.id = auth.uid()
          and tp.role = 'teacher'::public.user_role
          and tp.status = 'active'::public.user_status
        )
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
          and (
            c.visibility = 'public'
            or exists (
              select 1
              from public.enrollments e
              join public.groups g on g.id = e.group_id
              join public.profiles sp on sp.id = e.student_id
              where g.teacher_id = c.teacher_id
                and e.student_id = auth.uid()
                and e.status = 'accepted'
                and sp.role = 'student'::public.user_role
                and sp.status = 'active'::public.user_status
            )
          )
        )
      )
  ), false)
$$;

revoke all on function public.can_read_teacher_contacts(uuid) from public;
grant execute on function public.can_read_teacher_contacts(uuid) to anon, authenticated;

alter table public.teacher_contacts enable row level security;
revoke all on public.teacher_contacts from public, anon, authenticated;
grant select on public.teacher_contacts to anon, authenticated;
grant insert, update, delete on public.teacher_contacts to authenticated;

create policy teacher_contacts_read
on public.teacher_contacts for select to anon, authenticated
using (public.can_read_teacher_contacts(teacher_id));

create policy teacher_contacts_manage
on public.teacher_contacts for all to authenticated
using (
  (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'teacher'::public.user_role
        and p.status = 'active'::public.user_status
    )
  )
  or public.current_role() = 'admin'::public.user_role
)
with check (
  (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'teacher'::public.user_role
        and p.status = 'active'::public.user_status
    )
  )
  or public.current_role() = 'admin'::public.user_role
);

create or replace function public.save_teacher_profile(
  p_full_name text,
  p_headline text,
  p_bio text,
  p_offering_ids uuid[],
  p_phone_number text,
  p_whatsapp_number text,
  p_contact_email text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_full_name text := btrim(p_full_name);
  v_headline text := btrim(coalesce(p_headline, ''));
  v_bio text := btrim(coalesce(p_bio, ''));
  v_phone text := nullif(btrim(p_phone_number), '');
  v_whatsapp text := nullif(btrim(p_whatsapp_number), '');
  v_email text := nullif(btrim(p_contact_email), '');
begin
  if v_teacher_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_teacher_id
      and p.role = 'teacher'::public.user_role
      and p.status = 'active'::public.user_status
  ) then
    raise exception 'active teacher required';
  end if;

  if v_full_name is null or length(v_full_name) not between 2 and 100 then
    raise exception 'full name must be between 2 and 100 characters';
  end if;
  if length(v_headline) > 160 then raise exception 'headline exceeds 160 characters'; end if;
  if length(v_bio) > 5000 then raise exception 'bio exceeds 5000 characters'; end if;
  if p_visibility is null or p_visibility not in ('enrolled', 'public') then
    raise exception 'invalid contact visibility';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone number must use E.164 format';
  end if;
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'WhatsApp number must use E.164 format';
  end if;
  if v_email is not null and (
    length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'invalid contact email';
  end if;
  if p_offering_ids is null
     or cardinality(p_offering_ids) <> (select count(distinct x) from unnest(p_offering_ids) x)
     or cardinality(p_offering_ids) <> (select count(*) from public.offerings o where o.id = any(p_offering_ids)) then
    raise exception 'offering IDs must be distinct and valid';
  end if;

  update public.profiles set full_name = v_full_name where id = v_teacher_id;
  update public.teacher_profiles set headline = v_headline, bio = v_bio where id = v_teacher_id;

  delete from public.teacher_specializations where teacher_id = v_teacher_id;
  insert into public.teacher_specializations(teacher_id, offering_id)
  select v_teacher_id, x from unnest(p_offering_ids) x;

  insert into public.teacher_contacts(teacher_id, phone_number, whatsapp_number, contact_email, visibility)
  values (v_teacher_id, v_phone, v_whatsapp, v_email, p_visibility)
  on conflict (teacher_id) do update
    set phone_number = excluded.phone_number,
        whatsapp_number = excluded.whatsapp_number,
        contact_email = excluded.contact_email,
        visibility = excluded.visibility;
end;
$$;

revoke all on function public.save_teacher_profile(text,text,text,uuid[],text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_teacher_profile(text,text,text,uuid[],text,text,text,text) to authenticated;
