-- Teacher photos live in their own private bucket. Storage still enforces the
-- byte cap and MIME allowlist; policies below also bind extensions to MIME.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('teacher-avatars','teacher-avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table public.teacher_profiles
  drop constraint if exists teacher_profiles_avatar_path_owner_format;
alter table public.teacher_profiles
  add constraint teacher_profiles_avatar_path_owner_format check (
    avatar_path is null or avatar_path ~ (
      '^'||id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  );

-- Anonymous signing can only see the image currently referenced by a public
-- teacher. Owners can sign their own pending teacher image while active.
create or replace function public.can_read_teacher_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select case
  when p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then false
  when exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin' and p.status='active'
  ) then true
  when exists(
    select 1
    from public.teacher_profiles t
    join public.profiles p on p.id=t.id
    where t.id=split_part(p_name,'/',1)::uuid
      and p.id=auth.uid()
      and p.role='teacher'
      and p.status='active'
  ) then true
  else exists(
    select 1
    from public.teacher_profiles t
    join public.profiles p on p.id=t.id
    where t.avatar_path=p_name
      and p.role='teacher'
      and p.status='active'
      and t.approved
  )
end
$$;
revoke all on function public.can_read_teacher_avatar(text) from public,anon,authenticated;
grant execute on function public.can_read_teacher_avatar(text) to anon,authenticated;

-- Storage asks for this predicate only during INSERT. The path always has one
-- owner UUID and one random UUID filename; supported suffix and MIME agree.
create or replace function public.can_upload_teacher_avatar(p_name text,p_metadata jsonb)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case split_part(p_name,'.',2)
    when 'jpg' then p_metadata->>'mimetype'='image/jpeg'
    when 'png' then p_metadata->>'mimetype'='image/png'
    when 'webp' then p_metadata->>'mimetype'='image/webp'
    else false
  end
  and (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active')
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid()
        and p.id=split_part(p_name,'/',1)::uuid
        and p.role='teacher'
        and p.status='active'
    )
  )
$$;
revoke all on function public.can_upload_teacher_avatar(text,jsonb) from public,anon,authenticated;
grant execute on function public.can_upload_teacher_avatar(text,jsonb) to authenticated;

-- Deletion supports cleanup after a metadata-save failure, so it intentionally
-- does not require the object to be the currently referenced avatar.
create or replace function public.can_delete_teacher_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active')
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid()
        and p.id=split_part(p_name,'/',1)::uuid
        and p.role='teacher'
        and p.status='active'
    )
  )
$$;
revoke all on function public.can_delete_teacher_avatar(text) from public,anon,authenticated;
grant execute on function public.can_delete_teacher_avatar(text) to authenticated;

drop policy if exists teacher_avatars_read on storage.objects;
create policy teacher_avatars_read on storage.objects
for select to anon,authenticated
using(bucket_id='teacher-avatars' and public.can_read_teacher_avatar(name));

drop policy if exists teacher_avatars_insert on storage.objects;
create policy teacher_avatars_insert on storage.objects
for insert to authenticated
with check(bucket_id='teacher-avatars' and public.can_upload_teacher_avatar(name,metadata));

drop policy if exists teacher_avatars_delete on storage.objects;
create policy teacher_avatars_delete on storage.objects
for delete to authenticated
using(bucket_id='teacher-avatars' and public.can_delete_teacher_avatar(name));

-- Anonymous Storage requests evaluate every public SELECT policy on objects.
-- Lessons are private to signed-in users, so limit this existing read policy's
-- role scope while keeping its authorization predicate and access rules intact.
alter policy lesson_objects_read on storage.objects to authenticated;

-- Keep teacher_specializations private to their existing owner/admin RLS policy.
-- This explicitly safe projection supplies just offering IDs for public pages.
create or replace function public.public_teacher_specializations(p_teacher_id uuid)
returns table(offering_id uuid)
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select s.offering_id
from public.teacher_specializations s
join public.teacher_profiles t on t.id=s.teacher_id
join public.profiles p on p.id=t.id
where s.teacher_id=p_teacher_id
  and p.role='teacher'
  and p.status='active'
  and t.approved
$$;
revoke all on function public.public_teacher_specializations(uuid) from public,anon,authenticated;
grant execute on function public.public_teacher_specializations(uuid) to anon,authenticated;
