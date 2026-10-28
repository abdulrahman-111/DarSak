-- student_dashboard_summary: counts, previews, Cairo-day occupancy and isolation.
-- Week used throughout: Cairo Mon 2026-10-12 00:00 (+03) to Mon 2026-10-19 00:00 (+03),
-- i.e. [2026-10-11 21:00Z, 2026-10-18 21:00Z). p_now is 2026-10-14 10:00Z.
create extension if not exists pgtap;
begin;
select plan(21);


insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('99300000-0000-4000-8000-000000000001','authenticated','authenticated','sds-teacher@example.test','','{}','{"requested_role":"teacher","full_name":"SDS teacher"}',now(),now()),
 ('99300000-0000-4000-8000-000000000002','authenticated','authenticated','sds-student-a@example.test','','{}','{"requested_role":"student","full_name":"SDS student A"}',now(),now()),
 ('99300000-0000-4000-8000-000000000003','authenticated','authenticated','sds-student-b@example.test','','{}','{"requested_role":"student","full_name":"SDS student B"}',now(),now());
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='99300000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('99340000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001','رياضيات','SDS math','sds-math');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('99350000-0000-4000-8000-000000000001','student_category','الصف الأول','SDS grade','sds-grade','99300000-0000-4000-8000-000000000001');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('99360000-0000-4000-8000-000000000001','99350000-0000-4000-8000-000000000001','99340000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001');

-- Fixture rows are written as the table owner with triggers bypassed (capacity,
-- overlap and publication guards are not under test here).
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status) values

 ('99310000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 1','',10,'Room 1','published'),
 ('99310000-0000-4000-8000-000000000002','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 2','',10,'Room 2','published'),
 ('99310000-0000-4000-8000-000000000003','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 3','',10,'Room 3','published'),
 ('99310000-0000-4000-8000-000000000004','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 4','',10,'Room 4','published'),
 ('99310000-0000-4000-8000-000000000005','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 5','',10,'Room 5','published'),
 ('99310000-0000-4000-8000-000000000006','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 6','',10,'Room 6','published'),
 ('99310000-0000-4000-8000-000000000007','99300000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','SDS group 7','',10,'Room 7','published');
insert into public.enrollments(id,group_id,student_id,status,updated_at) values
 ('99330000-0000-4000-8000-000000000001','99310000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000002','accepted',timestamptz '2026-10-01 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000002','99310000-0000-4000-8000-000000000002','99300000-0000-4000-8000-000000000002','accepted',timestamptz '2026-10-02 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000003','99310000-0000-4000-8000-000000000003','99300000-0000-4000-8000-000000000002','accepted',timestamptz '2026-10-03 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000004','99310000-0000-4000-8000-000000000004','99300000-0000-4000-8000-000000000002','accepted',timestamptz '2026-10-04 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000005','99310000-0000-4000-8000-000000000005','99300000-0000-4000-8000-000000000002','accepted',timestamptz '2026-10-05 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000006','99310000-0000-4000-8000-000000000006','99300000-0000-4000-8000-000000000002','pending',timestamptz '2026-10-10 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000007','99310000-0000-4000-8000-000000000007','99300000-0000-4000-8000-000000000003','accepted',timestamptz '2026-10-01 10:00:00+00'),
 ('99330000-0000-4000-8000-000000000008','99310000-0000-4000-8000-000000000007','99300000-0000-4000-8000-000000000002','rejected',timestamptz '2026-10-11 10:00:00+00');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('99320000-0000-4000-8000-000000000000','99310000-0000-4000-8000-000000000001','live',timestamptz '2026-10-14 09:30:00+00',timestamptz '2026-10-14 10:30:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000001','99310000-0000-4000-8000-000000000001','tie one',timestamptz '2026-10-15 08:00:00+00',timestamptz '2026-10-15 09:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000002','99310000-0000-4000-8000-000000000001','tie two',timestamptz '2026-10-15 08:00:00+00',timestamptz '2026-10-15 09:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000003','99310000-0000-4000-8000-000000000001','later 3',timestamptz '2026-10-15 09:00:00+00',timestamptz '2026-10-15 10:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000004','99310000-0000-4000-8000-000000000001','later 4',timestamptz '2026-10-15 10:00:00+00',timestamptz '2026-10-15 11:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000005','99310000-0000-4000-8000-000000000001','later 5',timestamptz '2026-10-15 11:00:00+00',timestamptz '2026-10-15 12:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000006','99310000-0000-4000-8000-000000000001','later 6',timestamptz '2026-10-15 12:00:00+00',timestamptz '2026-10-15 13:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000007','99310000-0000-4000-8000-000000000001','later 7',timestamptz '2026-10-15 13:00:00+00',timestamptz '2026-10-15 14:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000010','99310000-0000-4000-8000-000000000001','ended earlier',timestamptz '2026-10-14 08:00:00+00',timestamptz '2026-10-14 09:00:00+00','completed'),
 ('99320000-0000-4000-8000-000000000011','99310000-0000-4000-8000-000000000001','cancelled only day',timestamptz '2026-10-16 09:00:00+00',timestamptz '2026-10-16 10:00:00+00','cancelled'),
 ('99320000-0000-4000-8000-000000000012','99310000-0000-4000-8000-000000000001','late Monday Cairo',timestamptz '2026-10-12 20:59:00+00',timestamptz '2026-10-12 21:30:00+00','completed'),
 ('99320000-0000-4000-8000-000000000013','99310000-0000-4000-8000-000000000001','early Tuesday Cairo',timestamptz '2026-10-12 21:00:00+00',timestamptz '2026-10-12 22:00:00+00','completed'),
 ('99320000-0000-4000-8000-000000000014','99310000-0000-4000-8000-000000000001','before week',timestamptz '2026-10-11 20:59:00+00',timestamptz '2026-10-11 22:00:00+00','completed'),
 ('99320000-0000-4000-8000-000000000015','99310000-0000-4000-8000-000000000001','at week end',timestamptz '2026-10-18 21:00:00+00',timestamptz '2026-10-18 22:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000016','99310000-0000-4000-8000-000000000002','second group',timestamptz '2026-10-17 09:00:00+00',timestamptz '2026-10-17 10:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000017','99310000-0000-4000-8000-000000000006','pending group',timestamptz '2026-10-18 09:00:00+00',timestamptz '2026-10-18 10:00:00+00','scheduled'),
 ('99320000-0000-4000-8000-000000000018','99310000-0000-4000-8000-000000000007','other student group',timestamptz '2026-10-16 09:00:00+00',timestamptz '2026-10-16 10:00:00+00','scheduled');
set local session_replication_role=origin;

select ok(has_function_privilege('authenticated','public.student_dashboard_summary(timestamptz,timestamptz,timestamptz)','EXECUTE'),'authenticated can execute the student dashboard summary');
select ok(not has_function_privilege('anon','public.student_dashboard_summary(timestamptz,timestamptz,timestamptz)','EXECUTE') and not has_function_privilege('service_role','public.student_dashboard_summary(timestamptz,timestamptz,timestamptz)','EXECUTE'),'anon and service_role cannot execute it');
select ok(not (select prosecdef from pg_proc where oid='public.student_dashboard_summary(timestamptz,timestamptz,timestamptz)'::regprocedure),'summary is SECURITY INVOKER so RLS applies');

set local role authenticated;
select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000002',true);
create temp table sds_a(v jsonb) on commit drop;
grant all on sds_a to authenticated;
insert into sds_a select public.student_dashboard_summary('2026-10-11 21:00:00+00','2026-10-18 21:00:00+00','2026-10-14 10:00:00+00');
reset role;

select is((select (v->>'accepted_count')::int from sds_a),5,'accepted count includes only accepted enrollments');
select is((select (v->>'pending_count')::int from sds_a),1,'pending count excludes rejected enrollments');
select is((select jsonb_array_length(v->'upcoming') from sds_a),5,'upcoming is limited to five lessons');
select is((select array_agg(e->>'id' order by o) from sds_a, jsonb_array_elements(v->'upcoming') with ordinality t(e,o)),
  array['99320000-0000-4000-8000-000000000000','99320000-0000-4000-8000-000000000001','99320000-0000-4000-8000-000000000002','99320000-0000-4000-8000-000000000003','99320000-0000-4000-8000-000000000004'],'upcoming is ordered by start then id and includes an in-progress lesson');
select is((select v->'upcoming'->0->>'status' from sds_a),'scheduled','upcoming lessons are scheduled');
select is((select v->'upcoming'->0->'group' from sds_a),jsonb_build_object('id','99310000-0000-4000-8000-000000000001'::uuid,'name','SDS group 1'),'upcoming carries the group id and name');
select ok(not exists(select 1 from sds_a, jsonb_array_elements(v->'upcoming') e where e->>'id' in ('99320000-0000-4000-8000-000000000010','99320000-0000-4000-8000-000000000011','99320000-0000-4000-8000-000000000017','99320000-0000-4000-8000-000000000018')),'ended, cancelled, pending-group and other-student lessons are not upcoming');
select is((select jsonb_array_length(v->'classes') from sds_a),4,'recent classes are limited to four');
select is((select array_agg(e->>'group_id' order by o) from sds_a, jsonb_array_elements(v->'classes') with ordinality t(e,o)),
  array['99310000-0000-4000-8000-000000000005','99310000-0000-4000-8000-000000000004','99310000-0000-4000-8000-000000000003','99310000-0000-4000-8000-000000000002'],'classes are ordered by enrollment updated_at descending');
select is((select v->'classes'->0->'group' from sds_a),jsonb_build_object('id','99310000-0000-4000-8000-000000000005'::uuid,'name','SDS group 5','status','published','location','Room 5'),'class group carries id, name, status and location');
select is((select v->'occupied_days' from sds_a),'["2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-17"]'::jsonb,
  'occupied days use Cairo dates across midnight and exclude out-of-week, cancelled-only, pending-group and other-student days');
select ok(not (select v->'occupied_days' from sds_a) ? '2026-10-11','a lesson at 23:59 Cairo the day before the week is excluded');
select ok(not (select v->'occupied_days' from sds_a) ? '2026-10-19','a lesson starting exactly at the week end is excluded');
select ok(not (select v->'occupied_days' from sds_a) ? '2026-10-16','a day with only a cancelled lesson is not occupied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000003',true);
create temp table sds_b(v jsonb) on commit drop;
grant all on sds_b to authenticated;
insert into sds_b select public.student_dashboard_summary('2026-10-11 21:00:00+00','2026-10-18 21:00:00+00','2026-10-14 10:00:00+00');
reset role;
select is((select jsonb_build_object('a',v->'accepted_count','p',v->'pending_count','u',(select array_agg(e->>'id') from jsonb_array_elements(v->'upcoming') e),'d',v->'occupied_days','c',jsonb_array_length(v->'classes')) from sds_b),
  jsonb_build_object('a',1,'p',0,'u',jsonb_build_array('99320000-0000-4000-8000-000000000018'),'d',jsonb_build_array('2026-10-16'),'c',1),'another student sees only their own enrollments, lessons and days');
set local role authenticated;
select throws_ok($$select public.student_dashboard_summary('2026-10-18 21:00:00+00','2026-10-11 21:00:00+00','2026-10-14 10:00:00+00')$$,'22023',null,'inverted week bounds are rejected');
select throws_ok($$select public.student_dashboard_summary('2026-10-01 00:00:00+00','2026-11-01 00:00:00+00','2026-10-14 10:00:00+00')$$,'22023',null,'oversized week bounds are rejected');
reset role;

set local role anon;
select throws_ok($$select public.student_dashboard_summary('2026-10-11 21:00:00+00','2026-10-18 21:00:00+00','2026-10-14 10:00:00+00')$$,'42501',null,'anonymous callers are denied');
reset role;

select * from finish();
rollback;
