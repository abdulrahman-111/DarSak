\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='lesson_objects_read'
      and roles=array['authenticated']::name[]
      and qual like '%bucket_id = ''lesson-materials''%storage_lesson_access%can_cleanup_lesson_object%'
  ) then
    raise exception 'lesson read policy must retain its predicate and authenticated-only role scope';
  end if;
  if has_function_privilege('anon','public.storage_lesson_access(text,boolean)','EXECUTE') then
    raise exception 'anonymous lesson access helper privilege was broadened';
  end if;
  if has_function_privilege('anon','public.can_cleanup_lesson_object(text)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_cleanup_lesson_object(text)','EXECUTE') then
    raise exception 'orphan cleanup helper must be available only to authenticated callers';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='lesson_objects_delete'
      and roles=array['authenticated']::name[]
      and qual like '%bucket_id = ''lesson-materials''%storage_lesson_access%can_cleanup_lesson_object%'
  ) then
    raise exception 'lesson delete policy must scope orphan cleanup to the authenticated owner/lesson path';
  end if;
  if not exists(select 1 from storage.buckets where id='teacher-avatars' and not public
      and file_size_limit=2097152 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
      and cardinality(allowed_mime_types)=3) then
    raise exception 'private teacher-avatars bucket limits missing';
  end if;
  if not has_function_privilege('anon','public.can_read_teacher_avatar(text)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_read_teacher_avatar(text)','EXECUTE') then
    raise exception 'narrow avatar-read helper grants missing';
  end if;
  if not has_function_privilege('anon','public.public_teacher_specializations(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.public_teacher_specializations(uuid)','EXECUTE') then
    raise exception 'public specialization projection grants missing';
  end if;
  if has_table_privilege('anon','public.teacher_specializations','SELECT') then
    raise exception 'anonymous direct specialization reads were granted';
  end if;
  if (select prosecdef from pg_proc where oid='public.can_read_teacher_avatar(text)'::regprocedure) is not true
     or (select provolatile from pg_proc where oid='public.can_read_teacher_avatar(text)'::regprocedure) <> 's'
     or not (select proconfig @> array['search_path=pg_catalog, public, auth'] from pg_proc where oid='public.can_read_teacher_avatar(text)'::regprocedure) then
    raise exception 'avatar helper must be stable security definer with fixed search_path';
  end if;
  if (select prosecdef from pg_proc where oid='public.public_teacher_specializations(uuid)'::regprocedure) is not true
     or (select provolatile from pg_proc where oid='public.public_teacher_specializations(uuid)'::regprocedure) <> 's'
     or not (select proconfig @> array['search_path=pg_catalog, public, auth'] from pg_proc where oid='public.public_teacher_specializations(uuid)'::regprocedure) then
    raise exception 'specialization RPC must be stable security definer with fixed search_path';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','authenticated','authenticated','avatar-owner@regression.test','{"full_name":"Avatar owner","requested_role":"teacher"}'),
 ('30000000-0000-4000-8000-000000000002','authenticated','authenticated','avatar-foreign@regression.test','{"full_name":"Avatar foreign","requested_role":"teacher"}');

set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id='30000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
insert into public.teacher_specializations(teacher_id,offering_id)
select '30000000-0000-4000-8000-000000000001',id from public.offerings limit 1;
insert into storage.objects(bucket_id,name,owner_id,metadata)
values
 ('teacher-avatars','30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png','30000000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":68}'),
 ('teacher-avatars','30000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp','30000000-0000-4000-8000-000000000001','{"mimetype":"image/webp","size":68}');
update public.teacher_profiles set avatar_path='30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
where id='30000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    update public.teacher_profiles
    set avatar_path='30000000-0000-4000-8000-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
    where id='30000000-0000-4000-8000-000000000001';
    raise exception 'foreign owner avatar path was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.teacher_profiles
    set avatar_path='30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg'
    where id='30000000-0000-4000-8000-000000000001';
    raise exception 'unsupported avatar extension was accepted';
  exception when check_violation then null;
  end;
end $$;

set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if not public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'public referenced approved avatar denied';
  end if;
  if public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'unreferenced avatar exposed publicly';
  end if;
  if (select count(*) from public.public_teacher_specializations('30000000-0000-4000-8000-000000000001')) <> 1 then
    raise exception 'public specialization projection omitted approved active teacher';
  end if;
  if (select count(*) from public.public_teacher_specializations('30000000-0000-4000-8000-000000000002')) <> 0 then
    raise exception 'public specialization projection exposed unapproved teacher';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
do $$
begin
  if not public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'active owner cannot read their unreferenced private avatar';
  end if;
  if not public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'active owner cannot read their referenced avatar';
  end if;
  if not public.can_delete_teacher_avatar('30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'active owner cannot delete their own avatar';
  end if;
  if public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000002/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg') then
    raise exception 'owner can read foreign teacher avatar';
  end if;
  if public.can_read_teacher_avatar('../private.png') then
    raise exception 'avatar helper accepts arbitrary object path';
  end if;
end $$;
reset role;

-- The first upload is owner-only and validates path shape, UUID filename, and extension.
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    insert into storage.objects(bucket_id,name,owner_id,metadata)
    values('teacher-avatars','30000000-0000-4000-8000-000000000001/not-a-uuid.svg','30000000-0000-4000-8000-000000000001','{"mimetype":"image/svg+xml","size":80}');
    raise exception 'unsupported avatar path/MIME accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local session_replication_role = replica;
update public.profiles set status='suspended' where id='30000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001';
do $$
begin
  if public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'suspended owner can read own avatar';
  end if;
  if public.can_delete_teacher_avatar('30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'suspended owner can delete own avatar';
  end if;
  if (select count(*) from public.public_teacher_specializations('30000000-0000-4000-8000-000000000001')) <> 0 then
    raise exception 'public specialization projection exposed suspended teacher';
  end if;
end $$;
reset role;
set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if public.can_read_teacher_avatar('30000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'suspended teacher avatar remains publicly readable';
  end if;
end $$;
reset role;

select 'teacher avatar and specialization assertions passed' as result;
rollback;
