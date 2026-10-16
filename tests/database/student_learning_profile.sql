\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.save_student_learning_profile(text,text,text,text[],text,text,timestamptz)') is null
     or not has_function_privilege('authenticated','public.save_student_learning_profile(text,text,text,text[],text,text,timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.save_student_learning_profile(text,text,text,text[],text,text,timestamptz)','EXECUTE')
     or has_function_privilege('service_role','public.save_student_learning_profile(text,text,text,text[],text,text,timestamptz)','EXECUTE')
     or has_table_privilege('authenticated','public.student_profiles','INSERT')
     or has_column_privilege('authenticated','public.student_profiles','age_range','UPDATE')
     or has_column_privilege('authenticated','public.student_profiles','interests','UPDATE')
     or not has_column_privilege('authenticated','public.student_profiles','offering_id','UPDATE')
     or has_table_privilege('anon','public.student_profiles','SELECT') then
    raise exception 'student profile RPC or table privileges are unsafe';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.student_profiles'::regclass) then
    raise exception 'student profile table must use RLS';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('8f000000-0000-4000-8000-000000000001','authenticated','authenticated','profile-owner@test.invalid','{"full_name":"Original Student","requested_role":"student"}'),
 ('8f000000-0000-4000-8000-000000000002','authenticated','authenticated','profile-other@test.invalid','{"full_name":"Other Student","requested_role":"student"}'),
 ('8f000000-0000-4000-8000-000000000003','authenticated','authenticated','profile-teacher@test.invalid','{"full_name":"Teacher User","requested_role":"teacher"}'),
 ('8f000000-0000-4000-8000-000000000004','authenticated','authenticated','profile-admin@test.invalid','{"full_name":"Admin User","requested_role":"student"}'),
 ('8f000000-0000-4000-8000-000000000005','authenticated','authenticated','profile-suspended@test.invalid','{"full_name":"Suspended Student","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='8f000000-0000-4000-8000-000000000004';
update public.profiles set status='suspended' where id='8f000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

do $$
begin
  if not exists(select 1 from public.student_profiles where id='8f000000-0000-4000-8000-000000000001' and onboarding_required and age_range is null and education_year='' and interests='{}' and learning_goal='' and school_name='') then
    raise exception 'new student signup must require profile completion with empty learning defaults';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
do $$
declare v_before timestamptz; v_after timestamptz; v_result jsonb;
begin
  select updated_at into v_before from public.student_profiles where id=auth.uid();
  begin
    perform public.save_student_learning_profile('Bad Student','12','Year 8',array['Math'],'Too short','','2026-10-16T10:00:00Z'::timestamptz);
    raise exception 'invalid required fields were accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_student_learning_profile(repeat('n',101),'13_15','Year 8',array['Math'],'I want to learn science.','',v_before);
    raise exception 'oversized name was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_student_learning_profile('Noor Learner','13_15',repeat('y',101),array['Math'],'I want to learn science.','',v_before);
    raise exception 'oversized education year was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_student_learning_profile('Noor Learner','13_15','Year 8',array[repeat('i',81)],'I want to learn science.','',v_before);
    raise exception 'oversized interest was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_student_learning_profile('Noor Learner','13_15','Year 8',array['Math'],repeat('g',1001),'',v_before);
    raise exception 'oversized learning goal was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_student_learning_profile('Noor Learner','13_15','Year 8',array['Math'],'I want to learn science.',repeat('s',161),v_before);
    raise exception 'oversized school name was accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select full_name from public.profiles where id=auth.uid())<>'Original Student' then raise exception 'invalid save changed canonical name'; end if;

  v_result := public.save_student_learning_profile(' Noor Learner ','13_15',' Year 8 ',array[' Math ','قراءة'],'I want to understand science.','Example School',v_before);
  select updated_at into v_after from public.student_profiles where id=auth.uid();
  if v_after<=v_before or (select full_name from public.profiles where id=auth.uid())<>'Noor Learner'
     or (select age_range from public.student_profiles where id=auth.uid())<>'13_15'
     or (select education_year from public.student_profiles where id=auth.uid())<>'Year 8'
     or (select interests from public.student_profiles where id=auth.uid())<>array['Math','قراءة']
     or (select school_name from public.student_profiles where id=auth.uid())<>'Example School'
     or (select learning_goal from public.student_profiles where id=auth.uid())<>'I want to understand science.'
     or (select onboarding_required from public.student_profiles where id=auth.uid())
     or (select onboarding_completed_at from public.student_profiles where id=auth.uid()) is null
     or v_result->>'full_name'<>'Noor Learner' or v_result->>'age_range'<>'13_15' then
    raise exception 'valid save did not atomically update canonical name and learning profile';
  end if;
  begin
    perform public.save_student_learning_profile('Changed Name','16_17','Year 9',array['Science'],'I want to learn science.', '',v_before);
    raise exception 'stale profile save succeeded';
  exception when sqlstate 'PT409' then null;
  end;
  if (select full_name from public.profiles where id=auth.uid())<>'Noor Learner' then raise exception 'stale save changed canonical name'; end if;
  begin
    perform public.save_student_learning_profile('Noor Learner','16_17','Year 9',array['a','A'],'I want to learn science.', '',v_after);
    raise exception 'duplicate interests were accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_student_learning_profile('Noor Learner','16_17','Year 9',array['Math','Science','Art','History','Music','Reading','Writing','Coding','Chess','Sport','Biology'],'I want to learn science.', '',v_after);
    raise exception 'more than ten interests were accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
do $$
begin
  begin
    update public.student_profiles set age_range='16_17' where id='8f000000-0000-4000-8000-000000000001';
    raise exception 'authenticated user directly updated student profile fields';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.student_profiles(id) values(auth.uid());
    raise exception 'authenticated user directly inserted student profile';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000002';
do $$
begin
  if exists(select 1 from public.student_profiles where id='8f000000-0000-4000-8000-000000000001') then
    raise exception 'student read another student learning profile';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000003';
do $$
begin
  if exists(select 1 from public.student_profiles where id='8f000000-0000-4000-8000-000000000001') then
    raise exception 'teacher read student learning profile fields';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000004';
do $$
begin
  if not exists(select 1 from public.student_profiles where id='8f000000-0000-4000-8000-000000000001' and school_name='Example School') then
    raise exception 'active administrator could not access student profile';
  end if;
  begin
    update public.student_profiles set learning_goal='Administrator edit is forbidden' where id='8f000000-0000-4000-8000-000000000001';
    raise exception 'administrator directly changed private profile';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000005';
do $$
begin
  if exists(select 1 from public.student_profiles where id=auth.uid()) then raise exception 'suspended student retained profile access'; end if;
  begin
    perform public.save_student_learning_profile('Suspended User','18_24','Year 1',array['Math'],'I want to learn math.', '',clock_timestamp());
    raise exception 'suspended student saved profile';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
set local request.jwt.claim.sub='';
do $$
begin
  begin
    perform * from public.student_profiles;
    raise exception 'anonymous caller read student profiles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
select 'student learning profile SQL assertions passed' as result;
