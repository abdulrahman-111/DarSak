\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists(select 1 from storage.buckets where id='teacher-avatars' and not public
      and file_size_limit=2097152 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
      and cardinality(allowed_mime_types)=3) then
    raise exception 'cover storage must keep the private two MiB image bucket limits';
  end if;
  if not has_function_privilege('anon','public.can_read_teacher_cover(text)','EXECUTE')
     or has_function_privilege('anon','public.can_upload_teacher_cover(text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.can_delete_teacher_cover(text)','EXECUTE')
     or has_function_privilege('anon','public.set_teacher_cover_path(text,text)','EXECUTE') then
    raise exception 'cover helper grants are too broad or incomplete';
  end if;
  if has_column_privilege('authenticated','public.teacher_profiles','cover_path','UPDATE')
     or not has_column_privilege('authenticated','public.teacher_profiles','avatar_path','UPDATE')
     or not has_column_privilege('authenticated','public.teacher_profiles','headline','UPDATE')
     or not has_column_privilege('authenticated','public.teacher_profiles','bio','UPDATE')
     or not has_column_privilege('authenticated','public.teacher_profiles','approved','UPDATE') then
    raise exception 'authenticated column updates must preserve avatar/headline while withholding cover_path';
  end if;
  if (select prosecdef from pg_proc where oid='public.can_read_teacher_cover(text)'::regprocedure) is not true
     or (select prosecdef from pg_proc where oid='public.set_teacher_cover_path(text,text)'::regprocedure) is not true then
    raise exception 'cover access helpers must run with constrained definer privileges';
  end if;
  if (select proargnames from pg_proc where oid='public.public_teachers()'::regprocedure) <> array['id','full_name','headline','bio','avatar_path']::text[] then
    raise exception 'public_teachers result shape changed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('34000000-0000-4000-8000-000000000001','authenticated','authenticated','cover-owner@regression.test','{"full_name":"Cover owner","requested_role":"teacher"}'),
 ('34000000-0000-4000-8000-000000000002','authenticated','authenticated','cover-foreign@regression.test','{"full_name":"Cover foreign","requested_role":"teacher"}');
set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id='34000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('teacher-avatars','34000000-0000-4000-8000-000000000001/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png','34000000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":68}'),
 ('teacher-avatars','34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp','34000000-0000-4000-8000-000000000001','{"mimetype":"image/webp","size":68}'),
 ('teacher-avatars','34000000-0000-4000-8000-000000000001/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png','34000000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":68}');
update public.teacher_profiles
set avatar_path='34000000-0000-4000-8000-000000000001/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png'
where id='34000000-0000-4000-8000-000000000001';
update public.teacher_profiles
set cover_path='34000000-0000-4000-8000-000000000001/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
where id='34000000-0000-4000-8000-000000000001';

set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if not public.can_read_teacher_cover('34000000-0000-4000-8000-000000000001/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') then
    raise exception 'currently referenced cover of approved teacher not public';
  end if;
  if public.can_read_teacher_cover('34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'unreferenced cover is public';
  end if;
  if public.can_read_teacher_cover('34000000-0000-4000-8000-000000000001/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png') then
    raise exception 'avatar path accepted as a cover';
  end if;
  if public.can_read_teacher_cover('../cover.png') then
    raise exception 'arbitrary cover path accepted';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '34000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    update public.teacher_profiles set cover_path=null where id='34000000-0000-4000-8000-000000000001';
    raise exception 'raw owner cover update bypassed the CAS RPC';
  exception when insufficient_privilege then null;
  end;
  update public.teacher_profiles set avatar_path=avatar_path where id='34000000-0000-4000-8000-000000000001';
  if not public.can_read_teacher_cover('34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'active owner cannot read unreferenced pending cover';
  end if;
  if public.can_upload_teacher_cover('34000000-0000-4000-8000-000000000001/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png','{"mimetype":"image/jpeg"}') then
    raise exception 'cover extension and MIME mismatch accepted';
  end if;
  if public.can_upload_teacher_cover('34000000-0000-4000-8000-000000000002/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png','{"mimetype":"image/png"}') then
    raise exception 'foreign owner cover upload accepted';
  end if;
  if not public.set_teacher_cover_path(
    '34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
    '34000000-0000-4000-8000-000000000001/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
  ) then raise exception 'cover compare-and-set did not replace the expected reference'; end if;
  if public.set_teacher_cover_path(
    '34000000-0000-4000-8000-000000000001/cover/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',null
  ) then raise exception 'stale cover compare-and-set overwrote a newer reference'; end if;
  if public.can_delete_teacher_cover('34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'current cover can be deleted';
  end if;
end $$;
reset role;
do $$
begin
  begin
    delete from dars_private.teacher_cover_objects where bucket_id='teacher-avatars' and name='34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp';
    raise exception 'foreign key did not protect current cover object key';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Removal atomically clears the reference; avatar remains untouched and the
-- former cover becomes eligible for owner cleanup.
set local role authenticated;
set local request.jwt.claim.sub = '34000000-0000-4000-8000-000000000001';
select public.set_teacher_cover_path(null,'34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp');
do $$
begin
  if not public.can_delete_teacher_cover('34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'cleared cover cannot be cleaned up';
  end if;
  if not public.can_read_teacher_avatar('34000000-0000-4000-8000-000000000001/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png') then
    raise exception 'avatar access was changed by cover actions';
  end if;
end $$;
reset role;

set local session_replication_role = replica;
update public.profiles set status='suspended' where id='34000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '34000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    update public.teacher_profiles set cover_path=null where id='34000000-0000-4000-8000-000000000001';
    raise exception 'suspended owner raw cover clear unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_teacher_cover_path(null,'34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp');
    raise exception 'suspended owner CAS unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  if public.can_read_teacher_cover('34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp')
     or public.can_delete_teacher_cover('34000000-0000-4000-8000-000000000001/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') then
    raise exception 'suspended teacher can still read or remove covers';
  end if;
end $$;
reset role;

select 'teacher cover storage assertions passed' as result;
rollback;
