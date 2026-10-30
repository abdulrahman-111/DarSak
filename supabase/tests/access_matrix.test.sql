-- Issue #155: role-based read and write contract for the core application tables.
-- Synthetic accounts and rows are isolated in a rollback transaction. No delivery worker runs.
create extension if not exists pgtap;
begin;
select no_plan();

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('15500000-0000-4000-8000-000000000001','authenticated','authenticated','matrix-student-a@example.test','','{}','{"requested_role":"student","full_name":"Matrix student A"}',now(),now()),
 ('15500000-0000-4000-8000-000000000002','authenticated','authenticated','matrix-student-b@example.test','','{}','{"requested_role":"student","full_name":"Matrix student B"}',now(),now()),
 ('15500000-0000-4000-8000-000000000003','authenticated','authenticated','matrix-teacher-a@example.test','','{}','{"requested_role":"teacher","full_name":"Matrix teacher A"}',now(),now()),
 ('15500000-0000-4000-8000-000000000004','authenticated','authenticated','matrix-teacher-b@example.test','','{}','{"requested_role":"teacher","full_name":"Matrix teacher B"}',now(),now()),
 ('15500000-0000-4000-8000-000000000005','authenticated','authenticated','matrix-suspended@example.test','','{}','{"requested_role":"student","full_name":"Matrix suspended student"}',now(),now()),
 ('15500000-0000-4000-8000-000000000006','authenticated','authenticated','matrix-pending@example.test','','{}','{"requested_role":"teacher","full_name":"Matrix pending teacher"}',now(),now()),
 ('15500000-0000-4000-8000-000000000007','authenticated','authenticated','matrix-admin@example.test','','{}','{"requested_role":"student","full_name":"Matrix admin"}',now(),now());

-- Mark synthetic role/status state as trusted fixture data, matching existing pgTAP setup.
set local session_replication_role=replica;
update public.profiles set role='admin' where id='15500000-0000-4000-8000-000000000007';
update public.teacher_profiles set approved=true where id in ('15500000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000004');
set local session_replication_role=origin;

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('15510000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000003','رياضيات','Matrix math A','15510000-0000-4000-8000-000000000001'),
 ('15510000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000004','علوم','Matrix science B','15510000-0000-4000-8000-000000000002');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('15520000-0000-4000-8000-000000000001','student_category','الصف الأول','Matrix grade A','15520000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000003'),
 ('15520000-0000-4000-8000-000000000002','student_category','الصف الثاني','Matrix grade B','15520000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000004');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('15530000-0000-4000-8000-000000000001','15520000-0000-4000-8000-000000000001','15510000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000003'),
 ('15530000-0000-4000-8000-000000000002','15520000-0000-4000-8000-000000000002','15510000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000004');

-- Table-owner fixture writes avoid testing writer policy paths during setup.
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status) values
 ('15540000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000003','15530000-0000-4000-8000-000000000001','Matrix group A','',10,'Room A','published'),
 ('15540000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000004','15530000-0000-4000-8000-000000000002','Matrix group B','',10,'Room B','published');
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('155d0000-0000-4000-8000-000000000001','15540000-0000-4000-8000-000000000001',1,'09:00','10:00'),
 ('155d0000-0000-4000-8000-000000000002','15540000-0000-4000-8000-000000000002',2,'09:00','10:00');
insert into public.enrollments(id,group_id,student_id,status) values
 ('15550000-0000-4000-8000-000000000001','15540000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001','accepted'),
 ('15550000-0000-4000-8000-000000000002','15540000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000002','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('15560000-0000-4000-8000-000000000001','15540000-0000-4000-8000-000000000001','Matrix lesson A',now()+interval '10 days',now()+interval '10 days 1 hour','scheduled'),
 ('15560000-0000-4000-8000-000000000002','15540000-0000-4000-8000-000000000002','Matrix lesson B',now()+interval '11 days',now()+interval '11 days 1 hour','scheduled');
insert into public.lesson_materials(id,lesson_id,kind,title,url,uploaded_by) values
 ('15570000-0000-4000-8000-000000000001','15560000-0000-4000-8000-000000000001','link','Matrix resource A','https://example.test/a','15500000-0000-4000-8000-000000000003'),
 ('15570000-0000-4000-8000-000000000002','15560000-0000-4000-8000-000000000002','link','Matrix resource B','https://example.test/b','15500000-0000-4000-8000-000000000004');
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values
 ('15560000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001','present','15500000-0000-4000-8000-000000000003'),
 ('15560000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000002','late','15500000-0000-4000-8000-000000000004');
insert into public.user_notifications(id,recipient_id,kind,event_key,payload) values
 ('15580000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001','lesson_rescheduled','matrix:a','{}'),
 ('15580000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000002','lesson_rescheduled','matrix:b','{}');
insert into public.group_assignments(id,group_id,title,instructions,due_at) values
 ('15590000-0000-4000-8000-000000000001','15540000-0000-4000-8000-000000000001','Matrix assignment A','Complete the exercise',now()+interval '20 days'),
 ('15590000-0000-4000-8000-000000000002','15540000-0000-4000-8000-000000000002','Matrix assignment B','Complete the exercise',now()+interval '20 days');
insert into public.assignment_submissions(id,assignment_id,student_id,url) values
 ('155a0000-0000-4000-8000-000000000001','15590000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001','https://example.test/submission-a'),
 ('155a0000-0000-4000-8000-000000000002','15590000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000002','https://example.test/submission-b');
insert into public.booking_slots(id,group_id,teacher_id,starts_at,ends_at) values
 ('155b0000-0000-4000-8000-000000000001','15540000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000003',now()+interval '30 days',now()+interval '30 days 1 hour'),
 ('155b0000-0000-4000-8000-000000000002','15540000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000004',now()+interval '31 days',now()+interval '31 days 1 hour');
insert into public.booking_requests(id,slot_id,student_id,status) values
 ('155c0000-0000-4000-8000-000000000001','155b0000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001','pending'),
 ('155c0000-0000-4000-8000-000000000002','155b0000-0000-4000-8000-000000000002','15500000-0000-4000-8000-000000000002','pending');
-- The pending teacher owns a complete set of rows. The row rules deliberately preserve some
-- owner/history reads while approval-gated assignment and booking policies stay closed.
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status) values
 ('15540000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000006','15530000-0000-4000-8000-000000000002','Matrix pending group','',10,'Room C','published');
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('155d0000-0000-4000-8000-000000000003','15540000-0000-4000-8000-000000000003',3,'09:00','10:00');
insert into public.enrollments(id,group_id,student_id,status) values
 ('15550000-0000-4000-8000-000000000003','15540000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000001','accepted'),
 ('15550000-0000-4000-8000-000000000004','15540000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000005','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('15560000-0000-4000-8000-000000000003','15540000-0000-4000-8000-000000000003','Matrix pending lesson',now()+interval '12 days',now()+interval '12 days 1 hour','scheduled');
insert into public.lesson_materials(id,lesson_id,kind,title,url,uploaded_by) values
 ('15570000-0000-4000-8000-000000000003','15560000-0000-4000-8000-000000000003','link','Matrix pending resource','https://example.test/c','15500000-0000-4000-8000-000000000006');
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values
 ('15560000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000005','absent','15500000-0000-4000-8000-000000000003'),
 ('15560000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000001','late','15500000-0000-4000-8000-000000000006');
insert into public.user_notifications(id,recipient_id,kind,event_key,payload) values
 ('15580000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000005','lesson_rescheduled','matrix:suspended','{}'),
 ('15580000-0000-4000-8000-000000000004','15500000-0000-4000-8000-000000000006','lesson_rescheduled','matrix:pending','{}');
insert into public.group_assignments(id,group_id,title,instructions,due_at) values
 ('15590000-0000-4000-8000-000000000003','15540000-0000-4000-8000-000000000003','Matrix pending assignment','Complete the exercise',now()+interval '20 days');
insert into public.assignment_submissions(id,assignment_id,student_id,url) values
 ('155a0000-0000-4000-8000-000000000003','15590000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000001','https://example.test/submission-c');
insert into public.booking_slots(id,group_id,teacher_id,starts_at,ends_at) values
 ('155b0000-0000-4000-8000-000000000003','15540000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000006',now()+interval '32 days',now()+interval '32 days 1 hour');
insert into public.booking_requests(id,slot_id,student_id,status) values
 ('155c0000-0000-4000-8000-000000000003','155b0000-0000-4000-8000-000000000003','15500000-0000-4000-8000-000000000001','pending');
update public.profiles set status='suspended' where id='15500000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

-- Anonymous group discovery goes through fixed SECURITY DEFINER read RPCs; direct group table
-- reads are intentionally unavailable because their RLS predicates inspect private profile data.
select ok(has_table_privilege('anon','public.groups','SELECT') and has_table_privilege('anon','public.group_schedule_slots','SELECT'),
  'anon can select public groups and schedules');
select ok(not has_table_privilege('anon','public.profiles','SELECT') and not has_table_privilege('anon','public.enrollments','SELECT')
  and not has_table_privilege('anon','public.lessons','SELECT') and not has_table_privilege('anon','public.lesson_materials','SELECT')
  and not has_table_privilege('anon','public.lesson_attendance','SELECT') and not has_table_privilege('anon','public.user_notifications','SELECT')
  and not has_table_privilege('anon','public.group_assignments','SELECT') and not has_table_privilege('anon','public.assignment_submissions','SELECT')
  and not has_table_privilege('anon','public.booking_slots','SELECT') and not has_table_privilege('anon','public.booking_requests','SELECT'),
  'anon has no direct SELECT privilege on private core tables');
set local role anon;
select throws_ok($$select count(*) from public.groups$$,'42501',null,'anon cannot query the base groups table directly');
select is((select count(*)::integer from public.discover_groups(null,null,null,null,false,'',0,12) where id::text like '1554%'),2,'anon discovers published test groups through the public RPC');
select is((select count(*)::integer from public.public_group_detail('15540000-0000-4000-8000-000000000001')),1,'anon reads published group details through the public RPC');
select is((select count(*)::integer from public.group_schedule_slots where group_id::text like '1554%'),2,'anon reads published test group schedules');
reset role;

-- Authenticated reads are checked as row counts for each of the eight personas. A count of one
-- represents that persona's own or associated row; zero represents an unrelated or private row.
create function pg_temp.matrix_row_ids(p_relation regclass) returns text[]
language plpgsql as $$ declare v_ids text[]; begin
  if p_relation='public.profiles'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.profiles where id::text like ''15500000%''' into v_ids;
  elsif p_relation='public.groups'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.groups where id::text like ''15540000%''' into v_ids;
  elsif p_relation='public.enrollments'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.enrollments where id::text like ''15550000%''' into v_ids;
  elsif p_relation='public.lessons'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.lessons where id::text like ''15560000%''' into v_ids;
  elsif p_relation='public.lesson_materials'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.lesson_materials where id::text like ''15570000%''' into v_ids;
  elsif p_relation='public.lesson_attendance'::regclass then
    execute 'select coalesce(array_agg(concat(lesson_id::text,chr(58),student_id::text) order by lesson_id,student_id),array[]::text[]) from public.lesson_attendance where lesson_id::text like ''15560000%''' into v_ids;
  elsif p_relation='public.user_notifications'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.user_notifications where id::text like ''15580000%''' into v_ids;
  elsif p_relation='public.group_assignments'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.group_assignments where id::text like ''15590000%''' into v_ids;
  elsif p_relation='public.assignment_submissions'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.assignment_submissions where id::text like ''155a0000%''' into v_ids;
  elsif p_relation='public.booking_slots'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.booking_slots where id::text like ''155b0000%''' into v_ids;
  elsif p_relation='public.booking_requests'::regclass then
    execute 'select coalesce(array_agg(id::text order by id),array[]::text[]) from public.booking_requests where id::text like ''155c0000%''' into v_ids;
  else
    raise exception 'unsupported matrix relation: %',p_relation;
  end if;
  return v_ids;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000001',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000001']::text[],'student A reads own profile');
select is(pg_temp.matrix_row_ids('public.groups'),array['15540000-0000-4000-8000-000000000001', '15540000-0000-4000-8000-000000000003']::text[],'student A reads own group through accepted membership');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000001', '15550000-0000-4000-8000-000000000003']::text[],'student A reads own enrollment');
select is(pg_temp.matrix_row_ids('public.lessons'),array['15560000-0000-4000-8000-000000000001', '15560000-0000-4000-8000-000000000003']::text[],'student A reads own group lesson');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array['15570000-0000-4000-8000-000000000001', '15570000-0000-4000-8000-000000000003']::text[],'student A reads own group material');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array['15560000-0000-4000-8000-000000000001:15500000-0000-4000-8000-000000000001', '15560000-0000-4000-8000-000000000003:15500000-0000-4000-8000-000000000001']::text[],'student A reads own attendance');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array['15580000-0000-4000-8000-000000000001']::text[],'student A reads own notifications');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array['15590000-0000-4000-8000-000000000001', '15590000-0000-4000-8000-000000000003']::text[],'student A reads own group assignment');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array['155a0000-0000-4000-8000-000000000001', '155a0000-0000-4000-8000-000000000003']::text[],'student A reads own submission');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array['155b0000-0000-4000-8000-000000000001', '155b0000-0000-4000-8000-000000000003']::text[],'student A reads requested booking slot');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array['155c0000-0000-4000-8000-000000000001', '155c0000-0000-4000-8000-000000000003']::text[],'student A reads own booking request');

select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000002',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000002']::text[],'student B reads own profile');
select is(pg_temp.matrix_row_ids('public.groups'),array['15540000-0000-4000-8000-000000000002']::text[],'student B reads own group through accepted membership');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000002']::text[],'student B reads own enrollment');
select is(pg_temp.matrix_row_ids('public.lessons'),array['15560000-0000-4000-8000-000000000002']::text[],'student B reads own group lesson');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array['15570000-0000-4000-8000-000000000002']::text[],'student B reads own group material');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array['15560000-0000-4000-8000-000000000002:15500000-0000-4000-8000-000000000002']::text[],'student B reads own attendance');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array['15580000-0000-4000-8000-000000000002']::text[],'student B reads own notifications');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array['15590000-0000-4000-8000-000000000002']::text[],'student B reads own group assignment');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array['155a0000-0000-4000-8000-000000000002']::text[],'student B reads own submission');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array['155b0000-0000-4000-8000-000000000002']::text[],'student B reads requested booking slot');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array['155c0000-0000-4000-8000-000000000002']::text[],'student B reads own booking request');

select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000003',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000003']::text[],'teacher A reads own profile');
select is(pg_temp.matrix_row_ids('public.groups'),array['15540000-0000-4000-8000-000000000001']::text[],'teacher A reads own group');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000001', '15550000-0000-4000-8000-000000000004']::text[],'teacher A reads own group enrollment');
select is(pg_temp.matrix_row_ids('public.lessons'),array['15560000-0000-4000-8000-000000000001']::text[],'teacher A reads own group lesson');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array['15570000-0000-4000-8000-000000000001']::text[],'teacher A reads own group material');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array['15560000-0000-4000-8000-000000000001:15500000-0000-4000-8000-000000000001', '15560000-0000-4000-8000-000000000001:15500000-0000-4000-8000-000000000005']::text[],'teacher A reads own group attendance');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array[]::text[],'teacher A cannot read student notifications');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array['15590000-0000-4000-8000-000000000001']::text[],'teacher A reads own group assignment');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array['155a0000-0000-4000-8000-000000000001']::text[],'teacher A reads own group submissions');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array['155b0000-0000-4000-8000-000000000001']::text[],'teacher A reads own booking slot');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array['155c0000-0000-4000-8000-000000000001']::text[],'teacher A reads own group booking request');

select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000004',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000004']::text[],'teacher B reads own profile');
select is(pg_temp.matrix_row_ids('public.groups'),array['15540000-0000-4000-8000-000000000002']::text[],'teacher B reads own group');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000002']::text[],'teacher B reads own group enrollment');
select is(pg_temp.matrix_row_ids('public.lessons'),array['15560000-0000-4000-8000-000000000002']::text[],'teacher B reads own group lesson');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array['15570000-0000-4000-8000-000000000002']::text[],'teacher B reads own group material');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array['15560000-0000-4000-8000-000000000002:15500000-0000-4000-8000-000000000002']::text[],'teacher B reads own group attendance');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array[]::text[],'teacher B cannot read student notifications');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array['15590000-0000-4000-8000-000000000002']::text[],'teacher B reads own group assignment');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array['155a0000-0000-4000-8000-000000000002']::text[],'teacher B reads own group submissions');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array['155b0000-0000-4000-8000-000000000002']::text[],'teacher B reads own booking slot');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array['155c0000-0000-4000-8000-000000000002']::text[],'teacher B reads own group booking request');

select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000005',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000005']::text[],'suspended student reads own profile');
select is(pg_temp.matrix_row_ids('public.groups'),array[]::text[],'suspended student cannot directly read base groups');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000004']::text[],'suspended student retains own enrollment history');
select is(pg_temp.matrix_row_ids('public.lessons'),array[]::text[],'suspended student cannot read lessons');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array[]::text[],'suspended student cannot read materials');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array[]::text[],'suspended student cannot read attendance');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array[]::text[],'suspended student cannot read notifications');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array[]::text[],'suspended student cannot read assignments');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array[]::text[],'suspended student cannot read submissions');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array[]::text[],'suspended student cannot read booking slots');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array[]::text[],'suspended student cannot read booking requests');

select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000006',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000006']::text[],'pending teacher reads own profile');
select is(pg_temp.matrix_row_ids('public.groups'),array['15540000-0000-4000-8000-000000000003']::text[],'pending teacher can read own group while approval-gated writes remain closed');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000003']::text[],'pending teacher reads own group enrollment');
select is(pg_temp.matrix_row_ids('public.lessons'),array['15560000-0000-4000-8000-000000000003']::text[],'pending teacher can read own lesson');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array['15570000-0000-4000-8000-000000000003']::text[],'pending teacher can read own material');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array['15560000-0000-4000-8000-000000000003:15500000-0000-4000-8000-000000000001']::text[],'pending teacher can read own group attendance history');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array['15580000-0000-4000-8000-000000000004']::text[],'pending teacher reads own notification while active');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array[]::text[],'pending teacher cannot read assignments');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array[]::text[],'pending teacher cannot read submissions');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array[]::text[],'pending teacher cannot read booking slots');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array[]::text[],'pending teacher cannot read booking requests');

select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000007',true);
select is(pg_temp.matrix_row_ids('public.profiles'),array['15500000-0000-4000-8000-000000000001', '15500000-0000-4000-8000-000000000002', '15500000-0000-4000-8000-000000000003', '15500000-0000-4000-8000-000000000004', '15500000-0000-4000-8000-000000000005', '15500000-0000-4000-8000-000000000006', '15500000-0000-4000-8000-000000000007']::text[],'admin reads all profiles');
select is(pg_temp.matrix_row_ids('public.groups'),array['15540000-0000-4000-8000-000000000001', '15540000-0000-4000-8000-000000000002', '15540000-0000-4000-8000-000000000003']::text[],'admin reads all groups');
select is(pg_temp.matrix_row_ids('public.enrollments'),array['15550000-0000-4000-8000-000000000001', '15550000-0000-4000-8000-000000000002', '15550000-0000-4000-8000-000000000003', '15550000-0000-4000-8000-000000000004']::text[],'admin reads all enrollments');
select is(pg_temp.matrix_row_ids('public.lessons'),array['15560000-0000-4000-8000-000000000001', '15560000-0000-4000-8000-000000000002', '15560000-0000-4000-8000-000000000003']::text[],'admin reads all lessons');
select is(pg_temp.matrix_row_ids('public.lesson_materials'),array['15570000-0000-4000-8000-000000000001', '15570000-0000-4000-8000-000000000002', '15570000-0000-4000-8000-000000000003']::text[],'admin reads all materials');
select is(pg_temp.matrix_row_ids('public.lesson_attendance'),array['15560000-0000-4000-8000-000000000001:15500000-0000-4000-8000-000000000001', '15560000-0000-4000-8000-000000000001:15500000-0000-4000-8000-000000000005', '15560000-0000-4000-8000-000000000002:15500000-0000-4000-8000-000000000002', '15560000-0000-4000-8000-000000000003:15500000-0000-4000-8000-000000000001']::text[],'admin reads all attendance');
select is(pg_temp.matrix_row_ids('public.user_notifications'),array[]::text[],'admin cannot read personal notifications');
select is(pg_temp.matrix_row_ids('public.group_assignments'),array[]::text[],'admin cannot read teacher assignments through row access');
select is(pg_temp.matrix_row_ids('public.assignment_submissions'),array[]::text[],'admin cannot read student submissions through row access');
select is(pg_temp.matrix_row_ids('public.booking_slots'),array[]::text[],'admin cannot read private booking slots through row access');
select is(pg_temp.matrix_row_ids('public.booking_requests'),array[]::text[],'admin cannot read private booking requests through row access');
reset role;

-- Important direct writes remain closed; supported changes go through checked RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) values('15500000-0000-4000-8000-000000000003','15530000-0000-4000-8000-000000000001','Direct matrix group',5,'draft')$$,'42501',null,'student cannot directly insert groups');
select throws_ok($$update public.groups set capacity=11 where id='15540000-0000-4000-8000-000000000001'$$,'42501',null,'student cannot directly update groups');
select throws_ok($$delete from public.groups where id='15540000-0000-4000-8000-000000000001'$$,'42501',null,'student cannot directly delete groups');
select throws_ok($$insert into public.assignment_submissions(assignment_id,student_id,url) values('15590000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001','https://example.test/direct')$$,'42501',null,'student cannot directly insert submissions');
select throws_ok($$update public.assignment_submissions set student_note='direct' where id='155a0000-0000-4000-8000-000000000001'$$,'42501',null,'student cannot directly update submissions');
select throws_ok($$delete from public.assignment_submissions where id='155a0000-0000-4000-8000-000000000001'$$,'42501',null,'student cannot directly delete submissions');
select throws_ok($$insert into public.booking_requests(slot_id,student_id) values('155b0000-0000-4000-8000-000000000001','15500000-0000-4000-8000-000000000001')$$,'42501',null,'student cannot directly insert booking requests');
select throws_ok($$update public.booking_requests set status='withdrawn' where id='155c0000-0000-4000-8000-000000000001'$$,'42501',null,'student cannot directly update booking requests');
select throws_ok($$delete from public.booking_requests where id='155c0000-0000-4000-8000-000000000001'$$,'42501',null,'student cannot directly delete booking requests');
select ok((public.notifications_page(0,20)->'rows') @> jsonb_build_array(jsonb_build_object('id','15580000-0000-4000-8000-000000000001')),
  'notification read RPC returns the caller''s own notification ID');
select is(public.submit_assignment_link('15590000-0000-4000-8000-000000000001','https://example.test/rpc-submission','submitted through RPC',1),
  '155a0000-0000-4000-8000-000000000001'::uuid,'student can update a submission through the authorized RPC');
reset role;
select is((select url from public.assignment_submissions where id='155a0000-0000-4000-8000-000000000001'),
  'https://example.test/rpc-submission','submission RPC persisted the new URL');
select is((select student_note from public.assignment_submissions where id='155a0000-0000-4000-8000-000000000001'),
  'submitted through RPC','submission RPC persisted the note');
select is((select revision from public.assignment_submissions where id='155a0000-0000-4000-8000-000000000001'),
  2,'submission RPC incremented the revision');

-- A suspended student has accepted rows, but active-account gates block protected RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.notifications_page(0,20)$$,'42501',null,'suspended student cannot use the notifications RPC');
select throws_ok($$select public.submit_assignment_link('15590000-0000-4000-8000-000000000001','https://example.test/blocked','blocked',null)$$,'42501',null,'suspended student cannot submit through the assignment RPC');
select throws_ok($$select public.request_booking('155b0000-0000-4000-8000-000000000001')$$,'42501',null,'suspended student cannot request a booking');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.save_group_assignment('15540000-0000-4000-8000-000000000001','Wrong owner','Should fail',null,null)$$,'42501',null,'teacher B cannot use the assignment RPC on teacher A group');
select ok((public.teacher_lesson_attendance_page('15560000-0000-4000-8000-000000000002',0,20)->'rows') @> jsonb_build_array(jsonb_build_object('student_id','15500000-0000-4000-8000-000000000002')),
  'attendance read RPC returns the own group student ID');
reset role;

-- A pending teacher can read existing owner history but cannot write assignments or publish bookings.
set local role authenticated;
select set_config('request.jwt.claim.sub','15500000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.save_group_assignment('15540000-0000-4000-8000-000000000003','Pending write','Should fail',null,null)$$,'42501',null,'pending teacher cannot write assignments despite owning a group');
select throws_ok($$select public.publish_booking_slot('15540000-0000-4000-8000-000000000003',now()+interval '40 days',now()+interval '40 days 1 hour')$$,'42501',null,'pending teacher cannot publish booking slots');
reset role;

select * from finish();
rollback;
