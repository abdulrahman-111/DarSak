\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('public.account_setup_drafts') is null
    or not (select relrowsecurity from pg_class where oid='public.account_setup_drafts'::regclass)
    or has_table_privilege('anon','public.account_setup_drafts','SELECT')
    or has_table_privilege('authenticated','public.account_setup_drafts','INSERT,UPDATE,DELETE') then
    raise exception 'setup drafts must be private, RLS protected, and RPC write-only';
  end if;
  if has_function_privilege('anon','public.get_or_create_account_setup_draft(text,text)','EXECUTE')
    or has_function_privilege('service_role','public.get_or_create_account_setup_draft(text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.get_or_create_account_setup_draft(text,text)','EXECUTE')
    or has_function_privilege('anon','public.restart_account_setup_draft(bigint,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.restart_account_setup_draft(bigint,text,text)','EXECUTE')
    or has_function_privilege('anon','public.save_account_setup_stage(smallint,jsonb,bigint,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.save_account_setup_stage(smallint,jsonb,bigint,text,text)','EXECUTE')
    or has_function_privilege('anon','public.complete_student_account_setup(bigint,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.complete_student_account_setup(bigint,text,text)','EXECUTE') then
    raise exception 'setup RPC grants are incorrect';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a7100000-0000-4000-8000-000000000001','authenticated','authenticated','setup-teacher@test.invalid','{"full_name":"Original setup teacher","requested_role":"teacher"}'),
 ('a7100000-0000-4000-8000-000000000002','authenticated','authenticated','setup-student@test.invalid','{"full_name":"Original setup student","requested_role":"student"}'),
 ('a7100000-0000-4000-8000-000000000003','authenticated','authenticated','setup-foreign@test.invalid','{"full_name":"Foreign setup student","requested_role":"student"}'),
 ('a7100000-0000-4000-8000-000000000004','authenticated','authenticated','setup-teacher-success@test.invalid','{"full_name":"Original success teacher","requested_role":"teacher"}');

set local role authenticated;
set local request.jwt.claim.sub='a7100000-0000-4000-8000-000000000001';
do $$
declare v_draft jsonb; v_saved jsonb; v_version bigint; v_raised boolean:=false;
begin
  v_draft:=public.get_or_create_account_setup_draft('en','/en/groups/00000000-0000-4000-8000-000000000010');
  if v_draft->>'role'<>'teacher' or v_draft->>'version'<>'0' or v_draft->>'return_to'<>'/en/groups/00000000-0000-4000-8000-000000000010' then
    raise exception 'teacher draft did not initialize with canonical role and safe return path';
  end if;
  begin
    perform public.save_account_setup_stage(1::smallint,'{"full_name":"Wrong","unknown":"private"}'::jsonb,0,'en',null);
    raise exception 'unknown stage key accepted';
  exception when sqlstate '22023' then v_raised:=true;
  end;
  if not v_raised then raise exception 'unknown stage key was not rejected'; end if;
  v_saved:=public.save_account_setup_stage(1::smallint,'{"full_name":"Changed setup teacher","headline":"An experienced teacher"}'::jsonb,0,'en',null);
  if v_saved->>'version'<>'1' or (select full_name from public.profiles where id=auth.uid())<>'Original setup teacher' then
    raise exception 'teacher stage save did not remain private or increment its CAS version';
  end if;
  begin
    perform public.save_account_setup_stage(1::smallint,'{"full_name":"Stale name"}'::jsonb,0,'en',null);
    raise exception 'stale setup draft update succeeded';
  exception when sqlstate 'PT409' then null;
  end;

  v_saved:=public.save_account_setup_stage(2::smallint,'{"about":{"ar":"","en":""},"approach":{"ar":"","en":""},"qualifications":[],"experience":[],"teaching_years":null}'::jsonb,1,'en',null);
  v_saved:=public.save_account_setup_stage(3::smallint,'{"offering_ids":[]}'::jsonb,2,'en',null);
  begin
    perform public.save_account_setup_stage(4::smallint,'{"admin_phone":"+1234567890","cv_path":"a7100000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf"}'::jsonb,3,'en',null);
    raise exception 'nonexistent CV object was accepted into setup draft';
  exception when sqlstate '22023' then null;
  end;
  v_saved:=public.save_account_setup_stage(4::smallint,'{"admin_phone":"+1234567890","attested":false}'::jsonb,3,'en',null);
  v_version:=(v_saved->>'version')::bigint;
  begin
    perform public.complete_teacher_account_setup(v_version,'en',null);
    raise exception 'incomplete teacher setup was submitted';
  exception when sqlstate '22023' then null;
  end;
  if (select full_name from public.profiles where id=auth.uid())<>'Original setup teacher'
    or (select status from public.teacher_applications where teacher_id=auth.uid())<>'draft'
    or not exists(select 1 from public.account_setup_drafts where user_id=auth.uid() and version=v_version) then
    raise exception 'failed teacher finalization did not roll back canonical updates and preserve draft';
  end if;

end $$;
reset role;
-- Simulate an edit through the canonical profile area while the setup draft remains open.
update public.profiles set full_name='Canonical teacher edit' where id='a7100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='a7100000-0000-4000-8000-000000000001';
do $$
declare v_draft jsonb; v_version bigint; v_saved jsonb;
begin
  select * into v_draft from public.get_or_create_account_setup_draft('en',null);
  v_version:=(v_draft->>'version')::bigint;
  begin
    perform public.complete_teacher_account_setup(v_version,'en',null);
    raise exception 'stale canonical teacher baseline was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.restart_account_setup_draft(v_version-1,'en',null);
    raise exception 'stale setup restart version was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  v_saved:=public.restart_account_setup_draft(v_version,'en',null);
  if v_saved->>'version' is distinct from (v_version+1)::text or v_saved->>'stage' is distinct from '1'
    or v_saved->'baseline'->>'profile_full_name' is distinct from 'Canonical teacher edit'
    or v_saved->'payload'->'about'->>'full_name' is distinct from 'Canonical teacher edit'
    or not exists(select 1 from public.account_setup_drafts where user_id=auth.uid() and version=v_version+1) then
    raise exception 'explicit setup restart did not refresh canonical state monotonically';
  end if;
end $$;
reset role;

-- A separate complete teacher flow exercises atomic submission with no CV path or URL.
set local role authenticated;
set local request.jwt.claim.sub='a7100000-0000-4000-8000-000000000004';
do $$
declare v_draft jsonb; v_saved jsonb; v_result jsonb; v_version bigint; v_offering text;
begin
  select id::text into v_offering from public.offerings order by id limit 1;
  if v_offering is null then raise exception 'teacher finalization fixture requires an offering'; end if;
  v_draft:=public.get_or_create_account_setup_draft('en','/en/teacher');
  v_saved:=public.save_account_setup_stage(1::smallint,'{"full_name":"Complete setup teacher","headline":"Experienced language tutor"}'::jsonb,0,'en',null);
  v_saved:=public.save_account_setup_stage(2::smallint,
    '{"about":{"ar":"هذه نبذة تعريفية طويلة ومفصلة عن خبرة المعلم وطريقته في مساعدة الطلاب على التعلم بثقة ووضوح.","en":"This is a detailed teacher biography with enough information about their work and the way they help learners build confidence."},"approach":{"ar":"","en":""},"qualifications":[{"id":"qualification-1","title":{"ar":"شهادة تعليم","en":"Teaching certificate"},"organization":{"ar":"جامعة القاهرة","en":"Cairo University"},"description":{"ar":"","en":""},"start_year":null,"end_year":2020,"current":false}],"experience":[],"teaching_years":0}'::jsonb,1,'en',null);
  v_saved:=public.save_account_setup_stage(3::smallint,jsonb_build_object('offering_ids',jsonb_build_array(v_offering)),2,'en',null);
  v_saved:=public.save_account_setup_stage(4::smallint,'{"admin_phone":"+1234567890","supporting_links":[],"attested":true}'::jsonb,3,'en',null);
  v_version:=(v_saved->>'version')::bigint;
  begin
    perform public.complete_teacher_account_setup(v_version,'en',null);
    raise exception 'direct wizard completion bypassed teacher rules';
  exception when sqlstate '22023' then null; end;
  if exists(select 1 from public.teacher_rules_acceptances where teacher_id=auth.uid()) then raise exception 'failed wizard invented acceptance'; end if;
  v_result:=public.complete_teacher_account_setup_with_rules(v_version,'en',null,'2026-10-18');
  if v_result#>>'{application,application,snapshot,teacher_rules_version}' is distinct from '2026-10-18'
    or v_result#>>'{application,application,snapshot,teacher_rules_accepted_at}' is null then raise exception 'wizard acceptance evidence missing'; end if;

  if v_result->>'destination' is distinct from '/en/teacher'
    or v_result#>>'{application,application,status}' is distinct from 'submitted'
    or v_result#>>'{application,application,snapshot,full_name}' is distinct from 'Complete setup teacher'
    or v_result#>>'{application,application,snapshot,cv_path}' is not null
    or v_result#>>'{application,application,snapshot,cv_url}' is not null
    or exists(select 1 from public.account_setup_drafts where user_id=auth.uid()) then
    raise exception 'teacher finalization did not atomically submit snapshot and remove draft';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='a7100000-0000-4000-8000-000000000002';
do $$
declare v_draft jsonb; v_saved jsonb; v_version bigint; v_raised boolean:=false; v_result jsonb;
begin
  v_draft:=public.get_or_create_account_setup_draft('en','/en/classes/00000000-0000-4000-8000-000000000011');
  if v_draft->>'role'<>'student' or v_draft->>'version'<>'0' then raise exception 'student setup draft did not initialize'; end if;
  v_saved:=public.save_account_setup_stage(1::smallint,'{"full_name":"Changed student","age_range":"13_15","school_name":"School"}'::jsonb,0,'en',null);
  if (select full_name from public.profiles where id=auth.uid())<>'Original setup student'
    or not (select onboarding_required from public.student_profiles where id=auth.uid()) then
    raise exception 'student first stage mutated canonical profile or completed onboarding';
  end if;
  v_saved:=public.save_account_setup_stage(2::smallint,'{"education_year":"Year 8","interests":["Math"],"learning_goal":"short"}'::jsonb,1,'en',null);
  v_version:=(v_saved->>'version')::bigint;
  begin
    perform public.complete_student_account_setup(v_version,'en',null);
    raise exception 'invalid student completion was accepted';
  exception when sqlstate '22023' then null;
  end;
  if (select full_name from public.profiles where id=auth.uid())<>'Original setup student'
    or not (select onboarding_required from public.student_profiles where id=auth.uid())
    or not exists(select 1 from public.account_setup_drafts where user_id=auth.uid() and version=v_version) then
    raise exception 'failed student finalization did not roll back and preserve the draft';
  end if;
  v_saved:=public.save_account_setup_stage(2::smallint,'{"learning_goal":"I want to improve my mathematics skills."}'::jsonb,v_version,'en',null);
  v_result:=public.complete_student_account_setup((v_saved->>'version')::bigint,'en',null);
  if v_result->>'destination'<>'/en/classes/00000000-0000-4000-8000-000000000011'
    or v_result->'profile'->>'full_name'<>'Changed student'
    or (select onboarding_required from public.student_profiles where id=auth.uid())
    or (select onboarding_completed_at from public.student_profiles where id=auth.uid()) is null
    or exists(select 1 from public.account_setup_drafts where user_id=auth.uid()) then
    raise exception 'student finalization did not atomically complete profile and remove private draft';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='a7100000-0000-4000-8000-000000000003';
do $$
begin
  if exists(select 1 from public.account_setup_drafts where user_id='a7100000-0000-4000-8000-000000000001') then
    raise exception 'foreign student read a teacher private setup draft';
  end if;
end $$;
reset role;

rollback;
select 'account setup draft CAS, privacy, and atomicity assertions passed' as result;
