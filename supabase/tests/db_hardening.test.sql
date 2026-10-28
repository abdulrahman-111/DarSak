-- Issues #94 and #103: slot overlap exclusion constraint, foreign-key indexes and split write policies.
-- Everything runs inside one rollback transaction.
create extension if not exists pgtap;
begin;
select plan(48);

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('99300000-0000-4000-8000-000000000001','authenticated','authenticated','hard-teacher@example.test','','{}','{"requested_role":"teacher","full_name":"Hardening teacher"}',now(),now()),
 ('99300000-0000-4000-8000-000000000002','authenticated','authenticated','hard-peer@example.test','','{}','{"requested_role":"teacher","full_name":"Hardening peer"}',now(),now()),
 ('99300000-0000-4000-8000-000000000003','authenticated','authenticated','hard-admin@example.test','','{}','{"requested_role":"student","full_name":"Hardening admin"}',now(),now()),
 ('99300000-0000-4000-8000-000000000004','authenticated','authenticated','hard-enrolled@example.test','','{}','{"requested_role":"student","full_name":"Hardening enrolled"}',now(),now()),
 ('99300000-0000-4000-8000-000000000005','authenticated','authenticated','hard-outsider@example.test','','{}','{"requested_role":"student","full_name":"Hardening outsider"}',now(),now());
set local session_replication_role=replica;
update public.profiles set role='admin' where id='99300000-0000-4000-8000-000000000003';
update public.teacher_profiles set approved=true where id in ('99300000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000002');
set local session_replication_role=origin;

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('99310000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001','رياضيات','Hardening math','99310000-0000-4000-8000-000000000001');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('99320000-0000-4000-8000-000000000001','student_category','الصف الأول','Hardening grade','99320000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('99330000-0000-4000-8000-000000000001','99320000-0000-4000-8000-000000000001','99310000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001');
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status) values
 ('99340000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000001','99330000-0000-4000-8000-000000000001','Hardening A','',5,'','draft'),
 ('99340000-0000-4000-8000-000000000002','99300000-0000-4000-8000-000000000001','99330000-0000-4000-8000-000000000001','Hardening B','',5,'','draft');
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('99350000-0000-4000-8000-000000000001','99340000-0000-4000-8000-000000000001',1,'10:00','11:00');
update public.groups set status='published' where id='99340000-0000-4000-8000-000000000001';
insert into public.enrollments(group_id,student_id,status) values
 ('99340000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000004','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('99360000-0000-4000-8000-000000000001','99340000-0000-4000-8000-000000000001','Hardening lesson',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled');
insert into public.lesson_materials(id,lesson_id,kind,title,content,uploaded_by) values
 ('99370000-0000-4000-8000-000000000001','99360000-0000-4000-8000-000000000001','note','Seed note','body','99300000-0000-4000-8000-000000000001');
insert into public.teacher_contacts(teacher_id,phone_number) values ('99300000-0000-4000-8000-000000000002','+201000000002');

-- #94: exclusion constraint (owner connection; the constraint applies to every writer).
select throws_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',1,'10:00','11:00')$$,'23P01',null,'an identical slot in the same group is rejected');
select throws_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',1,'10:30','11:30')$$,'23P01',null,'a partially overlapping slot in the same group is rejected');
select throws_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',1,'10:15','10:45')$$,'23P01',null,'a contained slot in the same group is rejected');
select lives_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',1,'11:00','12:00')$$,'an adjacent slot after is allowed');
select lives_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',1,'09:00','10:00')$$,'an adjacent slot before is allowed');
select lives_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',2,'10:00','11:00')$$,'the same time on another weekday is allowed');
select lives_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000002',1,'10:00','11:00')$$,'the same time in another group is allowed');
select throws_ok($$update public.group_schedule_slots set start_time='09:30' where id='99350000-0000-4000-8000-000000000001'$$,'23P01',null,'moving a slot onto its neighbour is rejected');
select is((select count(*)::int from pg_constraint where conname='group_schedule_slots_no_overlap' and contype='x' and conrelid='public.group_schedule_slots'::regclass),1,'the exclusion constraint exists');

-- #103: foreign-key indexes.
select has_index('public','student_saved_groups','student_saved_groups_group_id_idx','saved groups group_id index');
select has_index('public','waitlist_entries','waitlist_entries_enrollment_id_idx','waitlist enrollment_id index');
select has_index('public','assignment_submissions','assignment_submissions_feedback_by_idx','submission feedback_by index');
select has_index('public','lesson_attendance','lesson_attendance_recorded_by_idx','attendance recorded_by index');
select has_index('public','booking_slots','booking_slots_proposed_by_idx','booking slot proposed_by index');
select has_index('public','teacher_applications','teacher_applications_reviewed_by_idx','application reviewed_by index');
select has_index('dars_private','group_feedback','group_feedback_student_id_idx','feedback student_id index');
select has_index('dars_private','internal_teacher_review_decisions','internal_teacher_review_decisions_teacher_id_idx','review decision teacher_id index');
select has_index('dars_private','teacher_access_fee_policy','teacher_access_fee_policy_updated_by_idx','fee policy updated_by index');
select has_index('dars_private','teacher_access_grants','teacher_access_grants_request_fk_idx','grant request FK index');
select has_index('dars_private','teacher_access_requests','teacher_access_requests_decided_by_idx','access request decided_by index');
select has_index('dars_private','teacher_access_state','teacher_access_state_current_grant_id_idx','access state current_grant_id index');
select has_index('dars_private','teacher_quota_policy','teacher_quota_policy_updated_by_idx','quota policy updated_by index');

-- #103: one permissive SELECT policy per role, and no FOR ALL policies left on the split tables.
select is((select count(*)::int from pg_policies where schemaname='public' and cmd='ALL' and tablename in ('groups','group_schedule_slots','lesson_materials','teacher_contacts','education_nodes','subjects','offerings')),0,'no FOR ALL policies remain on the split tables');
select is((select count(*)::int from (select tablename from pg_policies where schemaname='public' and cmd='SELECT' and tablename in ('groups','group_schedule_slots','lesson_materials','teacher_contacts','education_nodes','subjects','offerings') and roles && array['authenticated','public']::name[] group by tablename having count(*)<>1) x),0,'authenticated has exactly one SELECT policy per table');
select is((select count(*)::int from (select tablename from pg_policies where schemaname='public' and cmd='SELECT' and tablename in ('groups','group_schedule_slots','lesson_materials','teacher_contacts','education_nodes','subjects','offerings') and roles && array['anon','public']::name[] group by tablename having count(*)<>1) x),0,'anon has exactly one SELECT policy per table');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='group_schedule_slots' and cmd in ('INSERT','UPDATE','DELETE')),3,'slots have one write policy per command');

-- Student (enrolled): reads the published group's slots and the materials; cannot write.
set local role authenticated;
select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000004',true);
select ok((select count(*) from public.group_schedule_slots where group_id='99340000-0000-4000-8000-000000000001')>=1,'enrolled student reads published group slots');
select is((select count(*)::int from public.lesson_materials where lesson_id='99360000-0000-4000-8000-000000000001'),1,'enrolled student reads lesson materials');
select throws_ok($$insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values('99340000-0000-4000-8000-000000000001',4,'10:00','11:00')$$,'42501',null,'student cannot insert a slot');
select throws_ok($$insert into public.subjects(name_ar,name_en,slug) values('x','Student subject','student-subject')$$,'42501',null,'non-admin cannot write the shared catalogue');

-- Student (not enrolled): sees published slots but not materials.
select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000005',true);
select ok((select count(*) from public.group_schedule_slots where group_id='99340000-0000-4000-8000-000000000001')>=1,'any signed-in user reads published group slots');
select is((select count(*)::int from public.lesson_materials),0,'a non-member cannot read lesson materials');

-- Anonymous visitors read published group slots through the single anon policy.
reset role;
set local role anon;
select ok((select count(*) from public.group_schedule_slots where group_id='99340000-0000-4000-8000-000000000001')>=1,'anonymous visitors read published group slots');
reset role;

-- Teacher: manages own materials and contacts, not another teacher's.
set local role authenticated;
select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.group_schedule_slots where group_id='99340000-0000-4000-8000-000000000002'),1,'owner reads own draft group slots');
select lives_ok($$insert into public.lesson_materials(lesson_id,kind,title,url,uploaded_by) values('99360000-0000-4000-8000-000000000001','link','Teacher link','https://example.test/resource','99300000-0000-4000-8000-000000000001')$$,'teacher adds a link resource to own lesson');
select throws_ok($$insert into public.lesson_materials(lesson_id,kind,title,content,uploaded_by) values('99360000-0000-4000-8000-000000000001','note','Teacher note','body','99300000-0000-4000-8000-000000000001')$$,'42501',null,'teacher cannot add a non-link resource (links-only launch)');
select lives_ok($$update public.lesson_materials set title='Renamed' where id='99370000-0000-4000-8000-000000000001'$$,'teacher updates own material');
select lives_ok($$delete from public.lesson_materials where id='99370000-0000-4000-8000-000000000001'$$,'teacher deletes own material');
select lives_ok($$insert into public.teacher_contacts(teacher_id,phone_number) values('99300000-0000-4000-8000-000000000001','+201000000001')$$,'teacher inserts own contacts');
select lives_ok($$update public.teacher_contacts set phone_number='+201000000011' where teacher_id='99300000-0000-4000-8000-000000000001'$$,'teacher updates own contacts');
select throws_ok($$insert into public.teacher_contacts(teacher_id,phone_number) values('99300000-0000-4000-8000-000000000003','+201000000003')$$,'42501',null,'teacher cannot insert contacts for another user');
select is((select count(*)::int from public.teacher_contacts where teacher_id='99300000-0000-4000-8000-000000000002'),0,'teacher cannot read another teacher''s unshared contacts');
select lives_ok($$delete from public.teacher_contacts where teacher_id='99300000-0000-4000-8000-000000000001'$$,'teacher deletes own contacts');
select throws_ok($$insert into public.subjects(name_ar,name_en,slug) values('x','Teacher shared subject','teacher-shared-subject')$$,'42501',null,'teacher cannot write the shared catalogue');
reset role;

-- Admin: writes the shared catalogue.
set local role authenticated;
select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000003',true);
select lives_ok($$insert into public.subjects(id,name_ar,name_en,slug) values('99390000-0000-4000-8000-000000000001','فيزياء','Hardening physics','hardening-physics')$$,'admin inserts a shared subject');
select lives_ok($$update public.subjects set name_en='Hardening physics 2' where id='99390000-0000-4000-8000-000000000001'$$,'admin updates a shared subject');
select lives_ok($$delete from public.subjects where id='99390000-0000-4000-8000-000000000001'$$,'admin deletes a shared subject');
select lives_ok($$insert into public.education_nodes(kind,name_ar,name_en,slug) values('system','نظام','Hardening system','hardening-system')$$,'admin inserts a shared education node');
reset role;

select * from finish();
rollback;
