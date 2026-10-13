\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('8f000000-0000-4000-8000-000000000001','authenticated','authenticated','auth-role-sql-null@test.invalid',null),
 ('8f000000-0000-4000-8000-000000000002','authenticated','authenticated','auth-role-missing@test.invalid','{}'),
 ('8f000000-0000-4000-8000-000000000003','authenticated','authenticated','auth-role-json-null@test.invalid','{"requested_role":null}'),
 ('8f000000-0000-4000-8000-000000000004','authenticated','authenticated','auth-role-invalid@test.invalid','{"requested_role":"administrator"}'),
 ('8f000000-0000-4000-8000-000000000005','authenticated','authenticated','auth-role-admin@test.invalid','{"requested_role":"admin"}'),
 ('8f000000-0000-4000-8000-000000000006','authenticated','authenticated','auth-role-teacher@test.invalid','{"requested_role":"teacher","full_name":"Explicit teacher"}'),
 ('8f000000-0000-4000-8000-000000000007','authenticated','authenticated','auth-role-student@test.invalid','{"requested_role":"student","full_name":"Explicit student"}');

do $$
begin
  if exists (
    select 1 from public.profiles
    where id in (
      '8f000000-0000-4000-8000-000000000001',
      '8f000000-0000-4000-8000-000000000002',
      '8f000000-0000-4000-8000-000000000003',
      '8f000000-0000-4000-8000-000000000004',
      '8f000000-0000-4000-8000-000000000005'
    ) and role <> 'student'
  ) or (select count(*) from public.student_profiles where id in (
      '8f000000-0000-4000-8000-000000000001',
      '8f000000-0000-4000-8000-000000000002',
      '8f000000-0000-4000-8000-000000000003',
      '8f000000-0000-4000-8000-000000000004',
      '8f000000-0000-4000-8000-000000000005'
    )) <> 5
     or exists (select 1 from public.teacher_profiles where id in (
      '8f000000-0000-4000-8000-000000000001',
      '8f000000-0000-4000-8000-000000000002',
      '8f000000-0000-4000-8000-000000000003',
      '8f000000-0000-4000-8000-000000000004',
      '8f000000-0000-4000-8000-000000000005'
    )) then
    raise exception 'missing, null, invalid, or admin requested_role did not safely create a student';
  end if;
  if (select role from public.profiles where id='8f000000-0000-4000-8000-000000000006') <> 'teacher'
     or not exists (select 1 from public.teacher_profiles where id='8f000000-0000-4000-8000-000000000006' and not approved)
     or not exists (select 1 from public.teacher_review_state where teacher_id='8f000000-0000-4000-8000-000000000006' and status='pending')
     or (select count(*) from public.teacher_review_events where teacher_id='8f000000-0000-4000-8000-000000000006' and kind='requested' and source='signup') <> 1 then
    raise exception 'explicit teacher signup lost its profile or pending review initialization';
  end if;
  if (select role from public.profiles where id='8f000000-0000-4000-8000-000000000007') <> 'student'
     or not exists (select 1 from public.student_profiles where id='8f000000-0000-4000-8000-000000000007')
     or exists (select 1 from public.teacher_profiles where id='8f000000-0000-4000-8000-000000000007') then
    raise exception 'explicit student signup changed behavior';
  end if;
end $$;

rollback;
select 'auth role fallback SQL assertions passed' as result;
