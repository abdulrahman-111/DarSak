\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('86000000-0000-4000-8000-000000000001','authenticated','authenticated','class-owner@test.invalid','{"requested_role":"teacher","full_name":"Class teacher"}'),
 ('86000000-0000-4000-8000-000000000002','authenticated','authenticated','class-member@test.invalid','{"requested_role":"student","full_name":"Class member"}'),
 ('86000000-0000-4000-8000-000000000003','authenticated','authenticated','class-pending@test.invalid','{"requested_role":"student","full_name":"Pending learner"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='86000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status)
select '86100000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001',id,'Enrolled history','Class description',10,'draft' from public.offerings limit 1;
insert into public.enrollments(group_id,student_id,status) values
 ('86100000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','accepted'),
 ('86100000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000003','pending');
insert into public.group_learning_details(group_id,outcomes,fee_egp,fee_basis)
values('86100000-0000-4000-8000-000000000001','Historical learning outcomes',120,'month');
insert into public.teacher_contacts(teacher_id,phone_number,whatsapp_number,contact_email)
values('86000000-0000-4000-8000-000000000001','+201234567890','+201234567890','private-teacher@test.invalid');
set local session_replication_role=replica;
update public.groups set status='archived' where id='86100000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='86000000-0000-4000-8000-000000000002';
do $$ declare detail jsonb;
begin
 detail:=public.student_class_detail('86100000-0000-4000-8000-000000000001');
 if detail->>'name' is distinct from 'Enrolled history'
 or detail#>>'{learning,outcomes}' is distinct from 'Historical learning outcomes'
 or detail->>'teacher_name' is distinct from 'Class teacher' then raise exception 'accepted archived class information missing'; end if;
 if detail::text like '%private-teacher%' or detail::text like '%201234567890%' then raise exception 'contacts leaked into general class projection'; end if;
 if public.student_class_detail('86100000-0000-4000-8000-000000000099') is not null then raise exception 'unknown class visible'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86000000-0000-4000-8000-000000000003';
do $$ begin
 if public.student_class_detail('86100000-0000-4000-8000-000000000001') is not null then raise exception 'pending student saw private class'; end if;
end $$;
reset role;
set local session_replication_role=replica;
update public.profiles set status='suspended' where id='86000000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='86000000-0000-4000-8000-000000000002';
do $$ begin
 if public.student_class_detail('86100000-0000-4000-8000-000000000001') is not null then raise exception 'suspended student saw class'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86000000-0000-4000-8000-000000000001';
do $$ begin
 if public.student_class_detail('86100000-0000-4000-8000-000000000001') is not null then raise exception 'teacher entered student-only workspace'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.student_class_detail(uuid)','EXECUTE') then raise exception 'anonymous workspace function exposed'; end if;
end $$;
select 'enrolled class authorization and archived history passed';
rollback;
