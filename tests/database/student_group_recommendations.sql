\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.save_student_matching_preferences(integer[],timestamptz)') is null
     or to_regprocedure('public.student_group_recommendations(integer,integer)') is null then
    raise exception 'student matching RPCs are not installed';
  end if;
  if has_function_privilege('public','public.save_student_matching_preferences(integer[],timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.save_student_matching_preferences(integer[],timestamptz)','EXECUTE')
     or has_function_privilege('service_role','public.save_student_matching_preferences(integer[],timestamptz)','EXECUTE')
     or not has_function_privilege('authenticated','public.save_student_matching_preferences(integer[],timestamptz)','EXECUTE')
     or has_function_privilege('public','public.student_group_recommendations(integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.student_group_recommendations(integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.student_group_recommendations(integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.student_group_recommendations(integer,integer)','EXECUTE') then
    raise exception 'student matching RPC grants are incorrect';
  end if;
  if not has_function_privilege('service_role','public.student_matching_weekdays_valid(integer[])','EXECUTE')
     or has_function_privilege('anon','public.student_matching_weekdays_valid(integer[])','EXECUTE')
     or has_function_privilege('public','public.student_matching_weekdays_valid(integer[])','EXECUTE') then
    raise exception 'weekday constraint validator grants are incorrect';
  end if;
  if not has_table_privilege('authenticated','public.student_profiles','SELECT')
     or has_column_privilege('authenticated','public.student_profiles','preferred_weekdays','UPDATE') then
    raise exception 'matching preferences should be readable by their owner and writable only through the RPC';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('b2000000-0000-4000-8000-000000000001','authenticated','authenticated','matching-teacher@test.invalid','{"full_name":"Matching Teacher","requested_role":"teacher"}'),
 ('b2000000-0000-4000-8000-000000000002','authenticated','authenticated','matching-student@test.invalid','{"full_name":"Matching Student","requested_role":"student"}'),
 ('b2000000-0000-4000-8000-000000000003','authenticated','authenticated','matching-other-student@test.invalid','{"full_name":"Other Student","requested_role":"student"}'),
 ('b2000000-0000-4000-8000-000000000004','authenticated','authenticated','matching-empty-student@test.invalid','{"full_name":"Empty Student","requested_role":"student"}'),
 ('b2000000-0000-4000-8000-000000000005','authenticated','authenticated','matching-admin@test.invalid','{"full_name":"Matching Admin","requested_role":"student"}'),
 ('b2000000-0000-4000-8000-000000000006','authenticated','authenticated','matching-suspended@test.invalid','{"full_name":"Suspended Student","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='b2000000-0000-4000-8000-000000000001';
update public.profiles set role='admin' where id='b2000000-0000-4000-8000-000000000005';
update public.profiles set status='suspended' where id='b2000000-0000-4000-8000-000000000006';
set local session_replication_role=origin;

insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug) values
 ('b2100000-0000-4000-8000-000000000001',null,'system','النظام','System','matching-system'),
 ('b2100000-0000-4000-8000-000000000002','b2100000-0000-4000-8000-000000000001','level','ثانوي','Secondary','matching-secondary'),
 ('b2100000-0000-4000-8000-000000000003','b2100000-0000-4000-8000-000000000002','grade','الصف الثامن','Grade 8','matching-grade-8'),
 ('b2100000-0000-4000-8000-000000000004','b2100000-0000-4000-8000-000000000001','level','ابتدائي','Primary','matching-primary'),
 ('b2100000-0000-4000-8000-000000000005','b2100000-0000-4000-8000-000000000004','grade','الصف التاسع','Grade 9','matching-grade-9');
insert into public.subjects(id,name_ar,name_en,slug) values
 ('b2200000-0000-4000-8000-000000000001','الرياضيات','Mathematics','matching-math'),
 ('b2200000-0000-4000-8000-000000000002','العلوم','Science','matching-science'),
 ('b2200000-0000-4000-8000-000000000003','سي بلس بلس','C++','matching-cpp'),
 ('b2200000-0000-4000-8000-000000000004','','Astronomy','matching-empty-ar'),
 ('b2200000-0000-4000-8000-000000000005','فن','Art','matching-art'),
 ('b2200000-0000-4000-8000-000000000006','سي شارب','C#','matching-csharp');
insert into public.offerings(id,node_id,subject_id) values
 ('b2300000-0000-4000-8000-000000000001','b2100000-0000-4000-8000-000000000003','b2200000-0000-4000-8000-000000000001'),
 ('b2300000-0000-4000-8000-000000000002','b2100000-0000-4000-8000-000000000003','b2200000-0000-4000-8000-000000000002'),
 ('b2300000-0000-4000-8000-000000000003','b2100000-0000-4000-8000-000000000005','b2200000-0000-4000-8000-000000000003'),
 ('b2300000-0000-4000-8000-000000000004','b2100000-0000-4000-8000-000000000005','b2200000-0000-4000-8000-000000000004'),
 ('b2300000-0000-4000-8000-000000000005','b2100000-0000-4000-8000-000000000005','b2200000-0000-4000-8000-000000000005'),
 ('b2300000-0000-4000-8000-000000000006','b2100000-0000-4000-8000-000000000005','b2200000-0000-4000-8000-000000000006');

insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
select ('b2400000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'b2000000-0000-4000-8000-000000000001',
 case when i=15 then 'b2300000-0000-4000-8000-000000000002'::uuid
      when i=16 then 'b2300000-0000-4000-8000-000000000003'::uuid
      when i=21 then 'b2300000-0000-4000-8000-000000000004'::uuid
      when i=22 then 'b2300000-0000-4000-8000-000000000005'::uuid
      when i=23 then 'b2300000-0000-4000-8000-000000000006'::uuid
      else 'b2300000-0000-4000-8000-000000000001'::uuid end,
 'Matching group '||i,'',case when i=19 then 1 else 20 end,'draft',''
from generate_series(1,23) as ids(i);
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
select ('b2400000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       case when i=20 then 2 else (i-1)%7 end,make_time(8+((i-1)/7),0,0),make_time(9+((i-1)/7),0,0)
from generate_series(1,23) as ids(i);
update public.groups set status='published'
where teacher_id='b2000000-0000-4000-8000-000000000001';

insert into public.enrollments(group_id,student_id,status) values
 ('b2400000-0000-4000-8000-000000000017','b2000000-0000-4000-8000-000000000002','pending'),
 ('b2400000-0000-4000-8000-000000000018','b2000000-0000-4000-8000-000000000002','accepted'),
 ('b2400000-0000-4000-8000-000000000019','b2000000-0000-4000-8000-000000000003','accepted');

set local role service_role;
update public.student_profiles
set preferred_weekdays = '{}'::integer[]
where id = 'b2000000-0000-4000-8000-000000000002';
reset role;

update public.student_profiles set education_year=' Secondary ',interests=array['(الرياضيات.)','C','(Mathematics.)'],
 learning_goal='I want to improve (Mathematics.), particularly drawing.' where id='b2000000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000002';
do $$
declare v_before timestamptz; v_result jsonb; v_page jsonb; v_page2 jsonb; v_empty jsonb;
begin
 select updated_at into v_before from public.student_profiles where id=auth.uid();
 begin
  perform public.save_student_matching_preferences(array[1,1],v_before);
  raise exception 'duplicate weekdays were accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.save_student_matching_preferences(array[7],v_before);
  raise exception 'out-of-range weekday was accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.save_student_matching_preferences(array[null]::integer[],v_before);
  raise exception 'null weekday was accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.save_student_matching_preferences(array[0,1,2,3,4,5,6,0],v_before);
  raise exception 'more than seven weekdays were accepted';
 exception when invalid_parameter_value then null; end;

 v_result:=public.save_student_matching_preferences(array[2],v_before);
 if v_result->'preferred_weekdays'<>'[2]'::jsonb or (v_result->>'updated_at')::timestamptz<=v_before then
  raise exception 'valid weekday preference was not saved';
 end if;
 begin
  perform public.save_student_matching_preferences(array[3],v_before);
  raise exception 'stale preference save succeeded';
 exception when sqlstate 'PT409' then null; end;
 if (select preferred_weekdays from public.student_profiles where id=auth.uid())<>array[2] then
  raise exception 'stale preference save changed data';
 end if;

 v_page:=public.student_group_recommendations(0,12);
 v_page2:=public.student_group_recommendations(12,12);
 if (v_page->>'total')::integer<>16 or jsonb_array_length(v_page->'rows')<>12
    or jsonb_array_length(v_page2->'rows')<>4 then
  raise exception 'recommendations should rank all 16 positive candidates before stable pagination';
 end if;
 if (v_page->'rows'->0->>'id')<>'b2400000-0000-4000-8000-000000000003'
    or (v_page->'rows'->1->>'id')<>'b2400000-0000-4000-8000-000000000010'
    or not exists(select 1 from jsonb_array_elements(v_page->'rows') r where r->>'id'='b2400000-0000-4000-8000-000000000020') then
  raise exception 'higher scoring preferred weekday candidates should lead before pagination, with UUID tie ordering';
 end if;
 if (v_page->'rows'->0->'reason_codes') is distinct from '["interest_subject_text","education_label_text","goal_subject_text","preferred_weekday"]'::jsonb then
  raise exception 'bilingual interest, ancestor label, goal, and weekday reasons were not emitted';
 end if;
 if exists(select 1 from jsonb_array_elements(v_page->'rows') r where r->>'id' in (
     'b2400000-0000-4000-8000-000000000016','b2400000-0000-4000-8000-000000000017',
     'b2400000-0000-4000-8000-000000000018','b2400000-0000-4000-8000-000000000019',
     'b2400000-0000-4000-8000-000000000021','b2400000-0000-4000-8000-000000000022',
     'b2400000-0000-4000-8000-000000000023'))
    or exists(select 1 from jsonb_array_elements(v_page2->'rows') r where r->>'id' in (
     'b2400000-0000-4000-8000-000000000016','b2400000-0000-4000-8000-000000000017',
     'b2400000-0000-4000-8000-000000000018','b2400000-0000-4000-8000-000000000019',
     'b2400000-0000-4000-8000-000000000021','b2400000-0000-4000-8000-000000000022',
     'b2400000-0000-4000-8000-000000000023')) then
  raise exception 'C++/C# mismatch, own enrollment, or full group was recommended';
 end if;
 if v_page->>'has_profile_signals'<>'true' or v_page->'preferred_weekdays'<>'[2]'::jsonb
    or (v_page->>'profile_updated_at')::timestamptz is distinct from (v_result->>'updated_at')::timestamptz then
  raise exception 'recommendation profile metadata is inconsistent';
 end if;
 if (v_page->'rows'->0 ? 'learning_goal') or (v_page->'rows'->0 ? 'interests')
    or (v_page->'rows'->0 ? 'school_name') or (v_page->'rows'->0 ? 'student_id') then
  raise exception 'recommendation returned private student profile data';
 end if;

 begin
  update public.student_profiles set preferred_weekdays=array[3] where id=auth.uid();
  raise exception 'student wrote preferences directly';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000004';
do $$ declare v_page jsonb; begin
 v_page:=public.student_group_recommendations(0,12);
 if (v_page->>'total')::integer<>0 or v_page->>'has_profile_signals'<>'false'
    or v_page->'preferred_weekdays'<>'[]'::jsonb then
  raise exception 'empty student profile should produce no recommendations or signals';
 end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000005';
do $$ begin
 begin
  perform public.student_group_recommendations(0,12);
  raise exception 'admin used student-only recommendation RPC';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000001';
do $$ begin
 begin
  perform public.student_group_recommendations(0,12);
  raise exception 'teacher used student-only recommendation RPC';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='b2000000-0000-4000-8000-000000000006';
do $$ begin
 begin
  perform public.student_group_recommendations(0,12);
  raise exception 'suspended student used recommendation RPC';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
