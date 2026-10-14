\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.teacher_enrollment_page(text,integer,integer)') is null
     or not has_function_privilege('authenticated','public.teacher_enrollment_page(text,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.teacher_enrollment_page(text,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.teacher_enrollment_page(text,integer,integer)','EXECUTE') then
    raise exception 'teacher enrollment page signature or grants are unsafe';
  end if;
  if to_regprocedure('public.teacher_enrollment_search(text,text,uuid,integer,integer)') is null
     or not has_function_privilege('authenticated','public.teacher_enrollment_search(text,text,uuid,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.teacher_enrollment_search(text,text,uuid,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.teacher_enrollment_search(text,text,uuid,integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.teacher_group_choices(text,uuid)','EXECUTE')
     or has_function_privilege('anon','public.teacher_group_choices(text,uuid)','EXECUTE')
     or has_function_privilege('service_role','public.teacher_group_choices(text,uuid)','EXECUTE') then
    raise exception 'filtered teacher enrollment signatures or grants are unsafe';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='lessons_slot_group_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='lesson_materials_uploaded_by_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='student_profiles_offering_id_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='teacher_profiles_cover_object_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='teacher_review_events_actor_user_id_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='teacher_review_state_reviewed_by_idx') then
    raise exception 'a requested foreign-key index is missing';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7e000000-0000-4000-8000-000000000001','authenticated','authenticated','enrollment-owner@test.invalid','{"full_name":"Enrollment owner","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000002','authenticated','authenticated','enrollment-foreign@test.invalid','{"full_name":"Foreign teacher","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000003','authenticated','authenticated','enrollment-student-a@test.invalid','{"full_name":"Student A canonical","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000004','authenticated','authenticated','enrollment-student-b@test.invalid','{"full_name":"Student B canonical","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000005','authenticated','authenticated','enrollment-suspended@test.invalid','{"full_name":"Suspended teacher","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000006','authenticated','authenticated','enrollment-unapproved@test.invalid','{"full_name":"Unapproved teacher","requested_role":"teacher"}');

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000001',o.id,'Owner pending group',10,'draft'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000002','7e000000-0000-4000-8000-000000000001',o.id,'Owner accepted group',10,'archived'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000003','7e000000-0000-4000-8000-000000000002',o.id,'Foreign group',10,'draft'
from public.offerings o order by o.id limit 1;
insert into public.enrollments(id,group_id,student_id,status) values
 ('7e200000-0000-4000-8000-000000000001','7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000003','pending'),
 ('7e200000-0000-4000-8000-000000000002','7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000004','pending'),
 ('7e200000-0000-4000-8000-000000000003','7e100000-0000-4000-8000-000000000002','7e000000-0000-4000-8000-000000000003','accepted'),
 ('7e200000-0000-4000-8000-000000000004','7e100000-0000-4000-8000-000000000003','7e000000-0000-4000-8000-000000000004','accepted');
set local session_replication_role=replica;
update public.enrollments set updated_at='2026-01-01 00:00:00+00' where id='7e200000-0000-4000-8000-000000000001';
update public.enrollments set updated_at='2026-01-02 00:00:00+00' where id='7e200000-0000-4000-8000-000000000002';
update public.profiles set status='suspended' where id='7e000000-0000-4000-8000-000000000005';
update public.teacher_profiles set approved=true where id in ('7e000000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000002');
update public.teacher_profiles set approved=false where id='7e000000-0000-4000-8000-000000000006';
set local session_replication_role=origin;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$
declare v_page jsonb;
begin
  v_page:=public.teacher_enrollment_page('pending',0,1);
  if (v_page->>'total')::integer<>2 or jsonb_array_length(v_page->'rows')<>1
     or v_page->'rows'->0->>'enrollment_id'<>'7e200000-0000-4000-8000-000000000002'
     or v_page->'rows'->0->>'full_name'<>'Student B canonical'
     or v_page->'rows'->0->>'group_name'<>'Owner pending group'
     or (v_page->'rows'->0 ? 'updated_at') then
    raise exception 'pending page did not return the stable, canonical, narrow owner projection';
  end if;
  v_page:=public.teacher_enrollment_page('pending',1,20);
  if (v_page->>'total')::integer<>2 or jsonb_array_length(v_page->'rows')<>1
     or v_page->'rows'->0->>'enrollment_id'<>'7e200000-0000-4000-8000-000000000001' then
    raise exception 'pending page offset/order is incorrect';
  end if;
  v_page:=public.teacher_enrollment_page('accepted',0,20);
  if (v_page->>'total')::integer<>1 or v_page->'rows'->0->>'group_id'<>'7e100000-0000-4000-8000-000000000002' then
    raise exception 'accepted page omitted archived roster history or included another teacher';
  end if;
  v_page:=public.teacher_enrollment_search('pending','Student A canonical',null,0,20);
  if (v_page->>'total')::integer<>1 or jsonb_array_length(v_page->'rows')<>1
     or v_page->'rows'->0->>'enrollment_id'<>'7e200000-0000-4000-8000-000000000001'
     or v_page->'rows'->0->>'group_name'<>'Owner pending group' then
    raise exception 'literal student-name search or matching count is incorrect';
  end if;
  v_page:=public.teacher_enrollment_search('pending','Owner pending group',null,0,20);
  if (v_page->>'total')::integer<>2 then raise exception 'group-name search or matching count is incorrect'; end if;
  v_page:=public.teacher_enrollment_search('accepted','',null,0,20);
  if (v_page->>'total')::integer<>1 or v_page->'rows'->0->>'group_id'<>'7e100000-0000-4000-8000-000000000002' then
    raise exception 'filtered accepted page omitted archived roster history';
  end if;
  v_page:=public.teacher_group_choices('Owner pending group','7e100000-0000-4000-8000-000000000002');
  if jsonb_array_length(v_page)<>2 or not exists(select 1 from jsonb_array_elements(v_page) x where x->>'id'='7e100000-0000-4000-8000-000000000002') then
    raise exception 'group choices did not retain the selected owned group outside the search results';
  end if;
  begin perform public.teacher_enrollment_page('rejected',0,20);
    raise exception 'unsupported enrollment status was accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.teacher_enrollment_page('pending',-1,20);
    raise exception 'negative offset was accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.teacher_enrollment_page('pending',0,101);
    raise exception 'oversized page was accepted';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000002';
do $$
declare v_page jsonb;
begin
  v_page:=public.teacher_enrollment_page('accepted');
  if (v_page->>'total')::integer<>1 or v_page->'rows'->0->>'group_id'<>'7e100000-0000-4000-8000-000000000003' then
    raise exception 'foreign teacher projection escaped or hid its own group scope';
  end if;
  begin perform public.teacher_enrollment_search('accepted','', '7e100000-0000-4000-8000-000000000001');
    raise exception 'foreign group filter was accepted';
  exception when insufficient_privilege then null; end;
  v_page:=public.teacher_group_choices('', '7e100000-0000-4000-8000-000000000001');
  if exists(select 1 from jsonb_array_elements(v_page) x where x->>'id'='7e100000-0000-4000-8000-000000000001') then
    raise exception 'foreign selected group leaked in group choices';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000003';
do $$ begin
  begin perform public.teacher_enrollment_page('accepted');
    raise exception 'student called teacher enrollment page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000005';
do $$ begin
  begin perform public.teacher_enrollment_page('pending');
    raise exception 'suspended teacher called enrollment page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000006';
do $$ begin
  begin perform public.teacher_enrollment_search('pending');
    raise exception 'unapproved teacher called filtered enrollment search';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
  begin perform public.teacher_enrollment_page('pending');
    raise exception 'anonymous called teacher enrollment page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
select 'teacher enrollment page SQL assertions passed' as result;
