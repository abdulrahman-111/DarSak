\set ON_ERROR_STOP on
begin;

do $$
begin
  if not has_function_privilege('authenticated','public.set_teacher_avatar_path(text,text)','EXECUTE')
     or has_function_privilege('anon','public.set_teacher_avatar_path(text,text)','EXECUTE')
     or has_function_privilege('service_role','public.set_teacher_avatar_path(text,text)','EXECUTE') then
    raise exception 'avatar CAS grants must be authenticated-only';
  end if;
  if (select prosecdef from pg_proc where oid='public.set_teacher_avatar_path(text,text)'::regprocedure) is not true
     or (select proconfig from pg_proc where oid='public.set_teacher_avatar_path(text,text)'::regprocedure) is distinct from array['search_path=pg_catalog, public, auth, storage']::text[] then
    raise exception 'avatar CAS must use constrained definer privileges';
  end if;
  if has_column_privilege('authenticated','public.teacher_profiles','avatar_path','UPDATE') then
    raise exception 'authenticated direct avatar updates must use the CAS RPC';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('35000000-0000-4000-8000-000000000001','authenticated','authenticated','avatar-owner@regression.test','{"full_name":"Avatar owner","requested_role":"teacher"}'),
 ('35000000-0000-4000-8000-000000000002','authenticated','authenticated','avatar-other@regression.test','{"full_name":"Avatar other","requested_role":"teacher"}'),
 ('35000000-0000-4000-8000-000000000003','authenticated','authenticated','avatar-suspended@regression.test','{"full_name":"Avatar suspended","requested_role":"teacher"}');

-- Fixture object rows are inserted as the database owner so the test exercises
-- the RPC against real Storage metadata without weakening client policies.
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('teacher-avatars','35000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png','35000000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":68}'),
 ('teacher-avatars','35000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp','35000000-0000-4000-8000-000000000001','{"mimetype":"image/webp","size":68}'),
 ('teacher-avatars','teacher/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png','35000000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":68}'),
 ('teacher-avatars','35000000-0000-4000-8000-000000000002/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png','35000000-0000-4000-8000-000000000002','{"mimetype":"image/png","size":68}'),
 ('teacher-avatars','35000000-0000-4000-8000-000000000003/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg','35000000-0000-4000-8000-000000000003','{"mimetype":"image/jpeg","size":68}');

set local role authenticated;
set local request.jwt.claim.sub = '35000000-0000-4000-8000-000000000001';
do $$
begin
  if not public.set_teacher_avatar_path(
    '35000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',null
  ) then raise exception 'first upload CAS did not select its path'; end if;
  if public.set_teacher_avatar_path(
    '35000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',null
  ) then raise exception 'competing stale upload replaced the winning path'; end if;
  if not public.set_teacher_avatar_path(
    '35000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
    '35000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
  ) then raise exception 'second upload could not replace the expected winning path'; end if;
  if public.set_teacher_avatar_path(null,'35000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'stale removal cleared the newer avatar';
  end if;
  if (select avatar_path from public.teacher_profiles where id=auth.uid()) is distinct from
    '35000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp' then
    raise exception 'stale removal changed the selected avatar';
  end if;
  begin
    perform public.set_teacher_avatar_path('35000000-0000-4000-8000-000000000002/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png',null);
    raise exception 'foreign object path unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_teacher_avatar_path('teacher/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png',null);
    raise exception 'malformed owner path unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_teacher_avatar_path('35000000-0000-4000-8000-000000000001/ffffffff-ffff-4fff-8fff-ffffffffffff.png',null);
    raise exception 'missing Storage object unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

set local session_replication_role = replica;
update public.profiles set status='suspended' where id='35000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '35000000-0000-4000-8000-000000000003';
do $$
begin
  begin
    perform public.set_teacher_avatar_path(null,'35000000-0000-4000-8000-000000000003/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg');
    raise exception 'suspended teacher avatar mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.set_teacher_avatar_path(null,null);
    raise exception 'anonymous avatar mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'teacher avatar concurrency assertions passed' as result;
rollback;
