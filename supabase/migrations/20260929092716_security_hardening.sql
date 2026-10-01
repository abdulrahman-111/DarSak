begin;

-- Keep authorization based on live database state. Accepted membership alone is
-- insufficient because an already-issued JWT can outlive an account suspension.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select exists(
  select 1
  from public.enrollments e
  join public.profiles p on p.id=e.student_id
  where e.group_id=gid
    and e.student_id=auth.uid()
    and e.status='accepted'
    and p.status='active'
)
$$;

-- Trusted operator tooling uses the service role; ordinary users and stale
-- sessions must still be unable to change protected authorization fields.
create or replace function public.prevent_protected_profile_changes()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    if current_user <> 'service_role'
       and public.current_role() is distinct from 'admin'::public.user_role then
      raise exception 'role and status are admin-managed';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.prevent_teacher_approval_change()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.approved is distinct from old.approved
     and current_user <> 'service_role'
     and public.current_role() is distinct from 'admin'::public.user_role then
    raise exception 'teacher approval is admin-managed';
  end if;
  return new;
end
$$;

-- Guard update identifiers inside the privileged RPC, rather than authorizing
-- only the destination group and then updating an arbitrary row.
create or replace function public.save_schedule_slot(
  p_group_id uuid,
  p_weekday int,
  p_start_time time,
  p_end_time time,
  p_slot_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  teacher uuid;
  existing_group uuid;
  rid uuid;
  bad boolean;
begin
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized';
  end if;
  if p_weekday not between 0 and 6 or p_start_time>=p_end_time then
    raise exception 'invalid schedule slot';
  end if;

  select teacher_id into teacher from public.groups where id=p_group_id;
  if teacher is null then raise exception 'group not found'; end if;

  if p_slot_id is not null then
    select group_id into existing_group
    from public.group_schedule_slots
    where id=p_slot_id
    for update;
    if existing_group is null then raise exception 'slot not found'; end if;
    if existing_group<>p_group_id then raise exception 'slot belongs to another group'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher::text,0));
  select exists(
    select 1
    from public.group_schedule_slots s
    join public.groups g on g.id=s.group_id
    where g.teacher_id=teacher
      and s.weekday=p_weekday
      and s.start_time<p_end_time
      and s.end_time>p_start_time
      and s.id is distinct from p_slot_id
  ) into bad;
  if bad then raise exception 'teacher recurring schedule overlaps'; end if;

  select exists(
    select 1
    from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=teacher
      and l.status<>'cancelled'
      and extract(dow from (l.starts_at at time zone 'Africa/Cairo'))::int=p_weekday
      and (l.starts_at at time zone 'Africa/Cairo')::time<p_end_time
      and (l.ends_at at time zone 'Africa/Cairo')::time>p_start_time
  ) into bad;
  if bad then raise exception 'schedule overlaps existing lesson'; end if;

  if p_slot_id is null then
    insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
    values(p_group_id,p_weekday,p_start_time,p_end_time)
    returning id into rid;
  else
    update public.group_schedule_slots
    set weekday=p_weekday,start_time=p_start_time,end_time=p_end_time
    where id=p_slot_id and group_id=p_group_id
    returning id into rid;
  end if;
  return rid;
end
$$;

create or replace function public.create_lesson(
  p_group_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default '',
  p_lesson_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  teacher uuid;
  existing_group uuid;
  rid uuid;
  bad boolean;
begin
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized';
  end if;
  if p_starts_at>=p_ends_at then raise exception 'invalid lesson interval'; end if;
  if length(btrim(p_title)) not between 1 and 200 then raise exception 'invalid lesson title'; end if;
  if length(p_notes)>10000 then raise exception 'lesson notes too long'; end if;

  select teacher_id into teacher from public.groups where id=p_group_id;
  if teacher is null then raise exception 'group not found'; end if;

  if p_lesson_id is not null then
    select group_id into existing_group
    from public.lessons
    where id=p_lesson_id
    for update;
    if existing_group is null then raise exception 'lesson not found'; end if;
    if existing_group<>p_group_id then raise exception 'lesson belongs to another group'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher::text,0));
  select exists(
    select 1
    from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=teacher
      and l.status<>'cancelled'
      and l.id is distinct from p_lesson_id
      and l.starts_at<p_ends_at
      and l.ends_at>p_starts_at
  ) into bad;
  if bad then raise exception 'teacher dated lesson overlaps'; end if;

  if p_lesson_id is null then
    insert into public.lessons(group_id,title,starts_at,ends_at,notes,local_date)
    values(p_group_id,btrim(p_title),p_starts_at,p_ends_at,p_notes,(p_starts_at at time zone 'Africa/Cairo')::date)
    returning id into rid;
  else
    update public.lessons
    set title=btrim(p_title),starts_at=p_starts_at,ends_at=p_ends_at,notes=p_notes,
        local_date=(p_starts_at at time zone 'Africa/Cairo')::date
    where id=p_lesson_id and group_id=p_group_id
    returning id into rid;
  end if;
  return rid;
end
$$;

create or replace function public.set_lesson_status(p_lesson_id uuid,p_status text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  lesson_group uuid;
begin
  if p_status not in ('scheduled','cancelled','completed') then
    raise exception 'invalid lesson status';
  end if;
  select group_id into lesson_group
  from public.lessons
  where id=p_lesson_id
  for update;
  if lesson_group is null then raise exception 'lesson not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(lesson_group) then
    raise exception 'not authorized';
  end if;
  update public.lessons
  set status=p_status::public.lesson_status
  where id=p_lesson_id;
end
$$;
revoke all on function public.set_lesson_status(uuid,text) from public,anon,authenticated;
grant execute on function public.set_lesson_status(uuid,text) to authenticated;

-- A lesson occurrence may only point at a recurring slot from the same group.
create unique index if not exists group_schedule_slots_id_group_id_key
  on public.group_schedule_slots(id,group_id);
alter table public.lessons
  add constraint lessons_slot_group_fk
  foreign key(slot_id,group_id)
  references public.group_schedule_slots(id,group_id)
  on delete set null (slot_id)
  not valid;

-- Owners must use the lock-protected RPC for recurring schedule writes.
revoke insert,update,delete on public.group_schedule_slots from authenticated;

-- Repair public teacher and schedule visibility with fully correlated status checks.
drop policy if exists teacher_read on public.teacher_profiles;
create policy teacher_read on public.teacher_profiles
for select
using(
  (approved=true and exists(
    select 1 from public.profiles p
    where p.id=public.teacher_profiles.id and p.status='active' and p.role='teacher'
  ))
  or id=auth.uid()
  or public.current_role()='admin'
);

drop policy if exists slots_read on public.group_schedule_slots;
create policy slots_read on public.group_schedule_slots
for select
using(exists(
  select 1
  from public.groups g
  where g.id=group_id
    and (
      (g.teacher_id=auth.uid() and public.is_active_user())
      or public.current_role()='admin'
      or public.is_group_member(g.id)
      or (
        g.status='published'
        and exists(
          select 1
          from public.profiles p
          join public.teacher_profiles t on t.id=p.id
          where p.id=g.teacher_id and p.status='active' and p.role='teacher' and t.approved=true
        )
      )
    )
));

-- Catalogue and settings are still protected by active-admin RLS, while the
-- grants make the intended Data API mutations reachable.
grant insert,update,delete on public.education_nodes,public.subjects,public.offerings to authenticated;
grant select,insert,update,delete on public.platform_settings to authenticated;
grant delete on public.teacher_specializations to authenticated;
grant delete on public.lesson_materials to authenticated;

create policy education_nodes_admin_write on public.education_nodes
for all to authenticated
using(public.current_role()='admin')
with check(public.current_role()='admin');
create policy subjects_admin_write on public.subjects
for all to authenticated
using(public.current_role()='admin')
with check(public.current_role()='admin');
create policy offerings_admin_write on public.offerings
for all to authenticated
using(public.current_role()='admin')
with check(public.current_role()='admin');

-- Anonymous discovery uses one safe projection rather than embedding the
-- private profiles table. Counts expose capacity, never roster identities.
create or replace function public.public_groups()
returns table(
  id uuid,
  teacher_id uuid,
  offering_id uuid,
  name text,
  description text,
  capacity integer,
  status public.group_status,
  location text,
  created_at timestamptz,
  teacher_name text,
  subject_name_ar text,
  subject_name_en text,
  node_name_ar text,
  node_name_en text,
  accepted_count bigint,
  available_seats bigint
)
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select
  g.id,g.teacher_id,g.offering_id,g.name,g.description,g.capacity,g.status,g.location,g.created_at,
  p.full_name,s.name_ar,s.name_en,n.name_ar,n.name_en,
  count(e.id) filter(where e.status='accepted') as accepted_count,
  greatest(g.capacity::bigint-count(e.id) filter(where e.status='accepted'),0::bigint) as available_seats
from public.groups g
join public.profiles p on p.id=g.teacher_id and p.role='teacher' and p.status='active'
join public.teacher_profiles tp on tp.id=p.id and tp.approved=true
join public.offerings o on o.id=g.offering_id
join public.subjects s on s.id=o.subject_id
join public.education_nodes n on n.id=o.node_id
left join public.enrollments e on e.group_id=g.id
where g.status='published'
group by g.id,p.full_name,s.name_ar,s.name_en,n.name_ar,n.name_en
$$;
revoke all on function public.public_groups() from public,anon,authenticated;
grant execute on function public.public_groups() to anon,authenticated;

-- File uploads happen before metadata exists. Authorize the initial object from
-- its opaque owner/lesson path; subsequent reads and changes still require the
-- corresponding metadata row through storage_lesson_access().
create or replace function public.can_upload_lesson_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select case
  when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
       and split_part(object_name,'/',1)=auth.uid()::text
  then exists(
      select 1
      from public.lessons l
      join public.groups g on g.id=l.group_id
      join public.profiles p on p.id=g.teacher_id
      where l.id=split_part(object_name,'/',2)::uuid
        and g.teacher_id=auth.uid()
        and p.status='active'
    )
  else false
end
$$;
revoke all on function public.can_upload_lesson_object(text) from public,anon,authenticated;
grant execute on function public.can_upload_lesson_object(text) to authenticated;

drop policy if exists lesson_objects_insert on storage.objects;
create policy lesson_objects_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='lesson-materials'
  and public.can_upload_lesson_object(name)
);

-- Links and notes intentionally have no storage path; only file rows need the
-- owner/lesson path constraint.
drop policy if exists material_write on public.lesson_materials;
create policy material_write on public.lesson_materials
for all to authenticated
using(
  public.current_role()='admin'
  or (
    uploaded_by=auth.uid()
    and public.is_active_user()
    and exists(
      select 1
      from public.lessons l
      join public.groups g on g.id=l.group_id
      where l.id=lesson_id and g.teacher_id=auth.uid()
    )
  )
)
with check(
  public.current_role()='admin'
  or (
    uploaded_by=auth.uid()
    and public.is_active_user()
    and (kind<>'file' or storage_path ~ ('^'||auth.uid()::text||'/'||lesson_id::text||'/[^/]+$'))
    and exists(
      select 1
      from public.lessons l
      join public.groups g on g.id=l.group_id
      where l.id=lesson_id and g.teacher_id=auth.uid()
    )
  )
);

-- New writes get bounded payloads without making deployment depend on cleaning
-- legacy rows first. Constraints can be validated after any legacy cleanup.
alter table public.groups
  add constraint groups_name_length check(length(btrim(name)) between 1 and 160) not valid,
  add constraint groups_description_length check(length(description)<=5000) not valid,
  add constraint groups_location_length check(length(location)<=500) not valid;
alter table public.lessons
  add constraint lessons_title_length check(length(btrim(title)) between 1 and 200) not valid,
  add constraint lessons_notes_length check(length(notes)<=10000) not valid;
alter table public.lesson_materials
  add constraint lesson_materials_title_length check(length(btrim(title)) between 1 and 200) not valid,
  add constraint lesson_materials_url_length check(url is null or length(url)<=2048) not valid,
  add constraint lesson_materials_url_no_credentials check(url is null or url !~* '^https?://[^/[:space:]]*@') not valid,
  add constraint lesson_materials_content_length check(content is null or length(content)<=20000) not valid;
alter table public.reports
  add constraint reports_subject_length check(length(btrim(subject)) between 1 and 200) not valid,
  add constraint reports_description_length check(length(btrim(description)) between 1 and 10000) not valid,
  add constraint reports_admin_note_length check(length(admin_note)<=3000) not valid;
alter table public.notifications
  add constraint notifications_kind_length check(length(btrim(kind)) between 1 and 80) not valid,
  add constraint notifications_title_ar_length check(length(btrim(title_ar)) between 1 and 300) not valid,
  add constraint notifications_title_en_length check(length(btrim(title_en)) between 1 and 300) not valid,
  add constraint notifications_href_length check(href is null or length(href)<=2048) not valid;

create index if not exists education_nodes_parent_id_idx on public.education_nodes(parent_id);
create index if not exists offerings_subject_id_idx on public.offerings(subject_id);
create index if not exists groups_teacher_id_idx on public.groups(teacher_id);
create index if not exists groups_offering_id_idx on public.groups(offering_id);
create index if not exists groups_published_created_at_idx on public.groups(created_at desc) where status='published';
create index if not exists group_schedule_slots_group_day_time_idx on public.group_schedule_slots(group_id,weekday,start_time);
create index if not exists enrollments_student_status_idx on public.enrollments(student_id,status);
create index if not exists enrollments_group_status_idx on public.enrollments(group_id,status);
create index if not exists lessons_group_starts_at_idx on public.lessons(group_id,starts_at);
create index if not exists lesson_materials_lesson_created_at_idx on public.lesson_materials(lesson_id,created_at);
create index if not exists notifications_user_created_at_idx on public.notifications(user_id,created_at desc);
create index if not exists reports_reporter_created_at_idx on public.reports(reporter_id,created_at desc);
create index if not exists reports_status_created_at_idx on public.reports(status,created_at desc);
create index if not exists teacher_specializations_offering_id_idx on public.teacher_specializations(offering_id);

commit;
