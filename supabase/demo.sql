-- OPT-IN LOCAL DEMO ONLY. Known public passwords: never use on a hosted project.
-- Run: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres --no-psqlrc --set ON_ERROR_STOP=1 --file supabase/demo.sql
-- Standard seed.sql intentionally contains no login accounts.
begin;
set local search_path = public, extensions;

-- Run against a freshly migrated local stack. A second run fails atomically
-- rather than overwriting accounts or data that a developer has changed.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token
) values
('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
 'teacher@demo.invalid', crypt('DarSak-local-demo-2026!', gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Teacher / المعلم التجريبي","requested_role":"teacher"}', now(), now(), '', '', '', '', '', ''),
('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
 'student@demo.invalid', crypt('DarSak-local-demo-2026!', gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Student / الطالب التجريبي","requested_role":"student"}', now(), now(), '', '', '', '', '', ''),
('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
 'admin@demo.invalid', crypt('DarSak-local-demo-2026!', gen_salt('bf')), now(),
 '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Admin","requested_role":"student"}', now(), now(), '', '', '', '', '', '');

insert into auth.identities(id, user_id, provider_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
from auth.users where id in ('de000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000003');

-- Use the same trusted role as the administrator bootstrap tool.
set local role service_role;
update public.profiles set role = 'admin' where id = 'de000000-0000-4000-8000-000000000003';
reset role;
select set_config('request.jwt.claim.sub', 'de000000-0000-4000-8000-000000000003', true);
-- Treat this synthetic teacher as a legacy application fixture, then use the
-- canonical administrator review RPC so review state and approval stay synced.
update public.teacher_applications set legacy_approved = true, status = 'approved', reviewed_at = now(), reviewed_by = 'de000000-0000-4000-8000-000000000003'
where teacher_id = 'de000000-0000-4000-8000-000000000001';
select public.admin_decide_teacher_review(teacher_id, request_id, 'approved', null)
from public.teacher_review_state where teacher_id = 'de000000-0000-4000-8000-000000000001';
update public.teacher_profiles set headline = 'Demo mathematics teacher'
where id = 'de000000-0000-4000-8000-000000000001';
update public.student_profiles set onboarding_required = false, onboarding_completed_at = now(), age_range = '18_24', education_year = 'Demo Grade 12'
where id = 'de000000-0000-4000-8000-000000000002';

insert into public.teacher_specializations(teacher_id, offering_id)
select 'de000000-0000-4000-8000-000000000001', id from public.offerings
where node_id = '00000000-0000-0000-0000-000000000021' and subject_id = '00000000-0000-0000-0000-000000000101' and owner_teacher_id is null;
insert into public.groups(id, teacher_id, offering_id, name, description, capacity, status, location)
select 'de100000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', id,
 'Demo Mathematics / رياضيات تجريبية', 'Synthetic group for a local walkthrough.', 20, 'draft', 'Demo classroom'
from public.offerings where node_id = '00000000-0000-0000-0000-000000000021' and subject_id = '00000000-0000-0000-0000-000000000101' and owner_teacher_id is null;
insert into public.group_schedule_slots(group_id, weekday, start_time, end_time)
values('de100000-0000-4000-8000-000000000001', extract(dow from current_date + 1)::integer, '16:00', '17:00');
select public.publish_group('de100000-0000-4000-8000-000000000001', null, null);
-- The learning detail columns are plain text; separate list items with newlines (never text[] literals).
insert into public.group_learning_details(group_id, outcomes, prerequisites, delivery_mode, fee_egp, fee_basis, fee_includes)
values('de100000-0000-4000-8000-000000000001',
 E'Solve linear equations\nExplain algebraic reasoning\nApproach exam questions with confidence',
 'Grade 10 mathematics', 'online', 150, 'month',
 E'Weekly group lessons\nPractice materials');
insert into public.enrollments(group_id, student_id, status)
values('de100000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002', 'accepted');
insert into public.lessons(id, group_id, title, starts_at, ends_at, notes)
values('de200000-0000-4000-8000-000000000001', 'de100000-0000-4000-8000-000000000001', 'Demo algebra / جبر تجريبي',
 ((current_date + 1) + time '16:00') at time zone 'Africa/Cairo',
 ((current_date + 1) + time '17:00') at time zone 'Africa/Cairo', 'Explore this lesson using both languages.');
insert into public.lesson_materials(lesson_id, kind, title, url, uploaded_by)
values('de200000-0000-4000-8000-000000000001', 'link', 'Demo algebra resource / مصدر جبر تجريبي', 'https://en.wikipedia.org/wiki/Elementary_algebra', 'de000000-0000-4000-8000-000000000001');

-- Fail the entire transaction if the starter catalogue did not produce the demo.
do $$ begin
 if not exists(select 1 from public.groups where id = 'de100000-0000-4000-8000-000000000001') then
  raise exception 'Starter catalogue missing: apply migrations and seed.sql before demo.sql';
 end if;
end $$;
commit;
