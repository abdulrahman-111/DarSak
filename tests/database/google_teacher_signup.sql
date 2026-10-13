\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('dars_private.pending_google_signups') is null
     or to_regprocedure('public.complete_google_signup(text)') is null then
    raise exception 'Google signup completion objects are missing';
  end if;
  if not has_function_privilege('authenticated','public.complete_google_signup(text)','EXECUTE')
     or has_function_privilege('anon','public.complete_google_signup(text)','EXECUTE')
     or has_function_privilege('service_role','public.complete_google_signup(text)','EXECUTE') then
    raise exception 'Google completion grants are too broad or missing';
  end if;
  if has_table_privilege('anon','dars_private.pending_google_signups','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','dars_private.pending_google_signups','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.pending_google_signups','SELECT,INSERT,UPDATE,DELETE')
     or exists (
       select 1 from pg_class relation
       cross join lateral aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) privilege
       where relation.oid='dars_private.pending_google_signups'::regclass
         and privilege.grantee=0
         and privilege.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     ) then
    raise exception 'Google signup marker table is exposed';
  end if;
  if not (select relrowsecurity from pg_class where oid='dars_private.pending_google_signups'::regclass) then
    raise exception 'Google signup marker table must use RLS';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) values
 ('8e000000-0000-4000-8000-000000000001','authenticated','authenticated','google-new-teacher@test.invalid','{"full_name":"Google teacher","requested_role":"student"}','{"provider":"google"}'),
 ('8e000000-0000-4000-8000-000000000002','authenticated','authenticated','google-new-student@test.invalid','{"full_name":"Google student","requested_role":"teacher"}','{"provider":"google"}'),
 ('8e000000-0000-4000-8000-000000000003','authenticated','authenticated','google-existing-admin@test.invalid','{"full_name":"Existing admin","requested_role":"teacher"}','{"provider":"google"}'),
 ('8e000000-0000-4000-8000-000000000004','authenticated','authenticated','google-existing-teacher@test.invalid','{"full_name":"Existing teacher","requested_role":"student"}','{"provider":"google"}'),
 ('8e000000-0000-4000-8000-000000000005','authenticated','authenticated','google-existing-student@test.invalid','{"full_name":"Existing student","requested_role":"teacher"}','{"provider":"google"}'),
 ('8e000000-0000-4000-8000-000000000006','authenticated','authenticated','email-teacher@test.invalid','{"full_name":"Email teacher","requested_role":"teacher"}','{"provider":"email"}');

do $$
begin
  if exists(select 1 from public.profiles where id in ('8e000000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000002'))
     or (select count(*) from dars_private.pending_google_signups where user_id in ('8e000000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'new Google users were not deferred behind private completion markers';
  end if;
  if (select role from public.profiles where id='8e000000-0000-4000-8000-000000000006')<>'teacher'
     or not exists(select 1 from public.teacher_profiles where id='8e000000-0000-4000-8000-000000000006') then
    raise exception 'email teacher signup behavior changed';
  end if;
end $$;

-- Existing accounts may acquire a Google identity later. Completion consumes
-- the one-time marker while preserving the existing role and profile state.
set local session_replication_role=replica;
insert into public.profiles(id,full_name,role,status) values
 ('8e000000-0000-4000-8000-000000000003','Existing admin','admin','suspended'),
 ('8e000000-0000-4000-8000-000000000004','Existing teacher','teacher','active'),
 ('8e000000-0000-4000-8000-000000000005','Existing student','student','active');
insert into public.teacher_profiles(id,approved) values('8e000000-0000-4000-8000-000000000004',true);
insert into public.student_profiles(id) values('8e000000-0000-4000-8000-000000000005');
set local session_replication_role=origin;

set local role anon;
set local request.jwt.claim.sub='';
do $$
begin
  begin
    perform public.complete_google_signup('student');
    raise exception 'anonymous caller completed Google signup';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    perform public.complete_google_signup('admin');
    raise exception 'Google signup accepted an admin role';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
do $$
begin
  if not exists(select 1 from dars_private.pending_google_signups where user_id='8e000000-0000-4000-8000-000000000001') then
    raise exception 'invalid role attempt consumed its retry marker';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000001';
select public.complete_google_signup('teacher');
select public.complete_google_signup('student'); -- repeated calls keep the existing role
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000002';
select public.complete_google_signup('student');
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000003';
select public.complete_google_signup('teacher');
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000004';
select public.complete_google_signup('student');
set local request.jwt.claim.sub='8e000000-0000-4000-8000-000000000005';
select public.complete_google_signup('teacher');
reset role;

do $$
begin
  if (select role from public.profiles where id='8e000000-0000-4000-8000-000000000001')<>'teacher'
     or not exists(select 1 from public.teacher_profiles where id='8e000000-0000-4000-8000-000000000001' and not approved)
     or not exists(select 1 from public.teacher_review_state where teacher_id='8e000000-0000-4000-8000-000000000001' and status='pending')
     or (select count(*) from public.teacher_review_events where teacher_id='8e000000-0000-4000-8000-000000000001' and kind='requested' and source='signup')<>1
     or exists(select 1 from public.student_profiles where id='8e000000-0000-4000-8000-000000000001') then
    raise exception 'Google teacher completion did not create one pending teacher account and review event';
  end if;
  if (select role from public.profiles where id='8e000000-0000-4000-8000-000000000002')<>'student'
     or not exists(select 1 from public.student_profiles where id='8e000000-0000-4000-8000-000000000002')
     or exists(select 1 from public.teacher_profiles where id='8e000000-0000-4000-8000-000000000002') then
    raise exception 'Google student completion created the wrong profile';
  end if;
  if (select role from public.profiles where id='8e000000-0000-4000-8000-000000000003')<>'admin'
     or (select status from public.profiles where id='8e000000-0000-4000-8000-000000000003')<>'suspended'
     or (select role from public.profiles where id='8e000000-0000-4000-8000-000000000004')<>'teacher'
     or not exists(select 1 from public.teacher_profiles where id='8e000000-0000-4000-8000-000000000004' and approved)
     or (select role from public.profiles where id='8e000000-0000-4000-8000-000000000005')<>'student'
     or not exists(select 1 from public.student_profiles where id='8e000000-0000-4000-8000-000000000005') then
    raise exception 'completion changed an existing role/profile';
  end if;
  if exists(select 1 from dars_private.pending_google_signups where user_id in (
       '8e000000-0000-4000-8000-000000000001','8e000000-0000-4000-8000-000000000002',
       '8e000000-0000-4000-8000-000000000003','8e000000-0000-4000-8000-000000000004',
       '8e000000-0000-4000-8000-000000000005')) then
    raise exception 'successful completion did not consume all one-time markers';
  end if;
end $$;

rollback;
select 'Google teacher signup SQL assertions passed' as result;
