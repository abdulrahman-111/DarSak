-- Covers share the private teacher image bucket with avatars, while keeping a
-- distinct path shape and a reference that PostgreSQL can protect atomically.
-- Storage has version-aware partial unique indexes, so mirror cover object keys
-- in a private table. Its primary key supplies a real FK target for references.
create table dars_private.teacher_cover_objects (
  bucket_id text not null check(bucket_id='teacher-avatars'),
  name text not null check(name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  primary key(bucket_id,name)
);
alter table dars_private.teacher_cover_objects enable row level security;
revoke all on dars_private.teacher_cover_objects from public,anon,authenticated;

create or replace function dars_private.track_teacher_cover_object()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,dars_private
as $$
begin
  if tg_op='INSERT' then
    if new.bucket_id='teacher-avatars' and new.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$' then
      insert into dars_private.teacher_cover_objects(bucket_id,name) values(new.bucket_id,new.name)
      on conflict(bucket_id,name) do nothing;
    end if;
    return new;
  end if;
  if old.bucket_id='teacher-avatars' and old.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
     and not exists(select 1 from storage.objects o where o.bucket_id=old.bucket_id and o.name=old.name and o.id<>old.id) then
    delete from dars_private.teacher_cover_objects where bucket_id=old.bucket_id and name=old.name;
  end if;
  return old;
end
$$;
revoke all on function dars_private.track_teacher_cover_object() from public,anon,authenticated;
drop trigger if exists teacher_cover_object_tracking on storage.objects;
create trigger teacher_cover_object_tracking
before insert or delete on storage.objects
for each row execute function dars_private.track_teacher_cover_object();

insert into dars_private.teacher_cover_objects(bucket_id,name)
select bucket_id,name from storage.objects
where bucket_id='teacher-avatars'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
on conflict(bucket_id,name) do nothing;

alter table public.teacher_profiles
  add column cover_path text,
  add column cover_bucket_id text generated always as ('teacher-avatars') stored;

-- Keep the legacy authenticated writes while making cover_path RPC-only. The
-- definer CAS function below retains authority; service/admin SQL grants stay
-- unchanged, and avatar/profile/approval columns keep their prior privileges.
revoke update on public.teacher_profiles from authenticated;
grant update (id,bio,headline,avatar_path,approved,created_at)
  on public.teacher_profiles to authenticated;

alter table public.teacher_profiles
  add constraint teacher_profiles_cover_path_owner_format check (
    cover_path is null or cover_path ~ (
      '^'||id::text||'/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  ),
  add constraint teacher_profiles_cover_storage_object_fk
    foreign key (cover_bucket_id,cover_path)
    references dars_private.teacher_cover_objects(bucket_id,name)
    on delete restrict;

create or replace function public.can_read_teacher_cover(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select case
  when p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then false
  when exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active')
    then true
  when exists(
    select 1 from public.teacher_profiles t join public.profiles p on p.id=t.id
    where t.id=split_part(p_name,'/',1)::uuid and p.id=auth.uid()
      and p.role='teacher' and p.status='active'
  ) then true
  else exists(
    select 1 from public.teacher_profiles t join public.profiles p on p.id=t.id
    where t.cover_path=p_name and p.role='teacher' and p.status='active' and t.approved
  )
end
$$;
revoke all on function public.can_read_teacher_cover(text) from public,anon,authenticated;
grant execute on function public.can_read_teacher_cover(text) to anon,authenticated;

create or replace function public.can_upload_teacher_cover(p_name text,p_metadata jsonb)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case split_part(p_name,'.',2)
    when 'jpg' then p_metadata->>'mimetype'='image/jpeg'
    when 'png' then p_metadata->>'mimetype'='image/png'
    when 'webp' then p_metadata->>'mimetype'='image/webp'
    else false
  end
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.id=split_part(p_name,'/',1)::uuid
      and p.role='teacher' and p.status='active'
  )
$$;
revoke all on function public.can_upload_teacher_cover(text,jsonb) from public,anon,authenticated;
grant execute on function public.can_upload_teacher_cover(text,jsonb) to authenticated;

create or replace function public.can_delete_teacher_cover(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and not exists(select 1 from public.teacher_profiles t where t.cover_path=p_name)
  and (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active')
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid() and p.id=split_part(p_name,'/',1)::uuid
        and p.role='teacher' and p.status='active'
    )
  )
$$;
revoke all on function public.can_delete_teacher_cover(text) from public,anon,authenticated;
grant execute on function public.can_delete_teacher_cover(text) to authenticated;

-- Compare-and-set saves avoid races between concurrent uploads/removals. The
-- storage FK also prevents deletion if another transaction chooses this path.
create or replace function public.set_teacher_cover_path(p_cover_path text,p_expected_path text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  v_teacher_id uuid := auth.uid();
begin
  if v_teacher_id is null or not exists(
    select 1 from public.profiles p
    where p.id=v_teacher_id and p.role='teacher' and p.status='active'
  ) then
    raise exception 'active teacher required' using errcode='42501';
  end if;
  if p_cover_path is not null and p_cover_path !~ (
    '^'||v_teacher_id::text||'/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ) then
    raise exception 'invalid teacher cover path' using errcode='22023';
  end if;
  update public.teacher_profiles
    set cover_path=p_cover_path
    where id=v_teacher_id and cover_path is not distinct from p_expected_path;
  return found;
end
$$;
revoke all on function public.set_teacher_cover_path(text,text) from public,anon,authenticated;
grant execute on function public.set_teacher_cover_path(text,text) to authenticated;

drop policy if exists teacher_covers_read on storage.objects;
create policy teacher_covers_read on storage.objects
for select to anon,authenticated
using(bucket_id='teacher-avatars' and public.can_read_teacher_cover(name));

drop policy if exists teacher_covers_insert on storage.objects;
create policy teacher_covers_insert on storage.objects
for insert to authenticated
with check(bucket_id='teacher-avatars' and public.can_upload_teacher_cover(name,metadata));

drop policy if exists teacher_covers_delete on storage.objects;
create policy teacher_covers_delete on storage.objects
for delete to authenticated
using(bucket_id='teacher-avatars' and public.can_delete_teacher_cover(name));
