-- Run after migrations on a disposable local Supabase database with `supabase test db`.
-- The transaction rolls back all fixtures, including auth users and generated lessons.
begin;

do $$
declare
  v_teacher uuid := gen_random_uuid();
  v_other_teacher uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_inactive uuid := gen_random_uuid();
  v_revoked_group uuid := gen_random_uuid();
  v_node_system uuid := gen_random_uuid();
  v_node_level uuid := gen_random_uuid();
  v_node_grade uuid := gen_random_uuid();
  v_subject uuid := gen_random_uuid();
  v_offering uuid := gen_random_uuid();
  v_owned_group uuid := gen_random_uuid();
  v_foreign_group uuid := gen_random_uuid();
  v_boundary_lesson uuid := gen_random_uuid();
  v_after_end_lesson uuid := gen_random_uuid();
  v_archived_lesson uuid := gen_random_uuid();
  v_pending_lesson uuid := gen_random_uuid();
  v_foreign_lesson uuid := gen_random_uuid();
  v_result jsonb;
  v_rows jsonb;
begin
  insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_teacher, 'authenticated', 'authenticated', v_teacher::text || '@calendar.test', '', '{}'::jsonb, '{"requested_role":"teacher"}'::jsonb, now(), now()),
    (v_other_teacher, 'authenticated', 'authenticated', v_other_teacher::text || '@calendar.test', '', '{}'::jsonb, '{"requested_role":"teacher"}'::jsonb, now(), now()),
    (v_student, 'authenticated', 'authenticated', v_student::text || '@calendar.test', '', '{}'::jsonb, '{"requested_role":"student"}'::jsonb, now(), now()),
    (v_admin, 'authenticated', 'authenticated', v_admin::text || '@calendar.test', '', '{}'::jsonb, '{"requested_role":"student"}'::jsonb, now(), now()),
    (v_inactive, 'authenticated', 'authenticated', v_inactive::text || '@calendar.test', '', '{}'::jsonb, '{"requested_role":"student"}'::jsonb, now(), now());
  execute 'set local role service_role';
  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set status = 'suspended' where id = v_inactive;
  execute 'reset role';

  insert into public.education_nodes(id, kind, name_ar, name_en, slug)
  values (v_node_system, 'system', 'اختبار', 'Test', 'calendar-test-system');
  insert into public.education_nodes(id, parent_id, kind, name_ar, name_en, slug)
  values (v_node_level, v_node_system, 'level', 'اختبار', 'Test', 'calendar-test-level');
  insert into public.education_nodes(id, parent_id, kind, name_ar, name_en, slug)
  values (v_node_grade, v_node_level, 'grade', 'اختبار', 'Test', 'calendar-test-grade');
  insert into public.subjects(id, name_ar, name_en, slug) values (v_subject, 'اختبار', 'Test', 'calendar-test-subject');
  insert into public.offerings(id, node_id, subject_id) values (v_offering, v_node_grade, v_subject);

  insert into public.groups(id, teacher_id, offering_id, name, capacity, status, location)
  values (v_owned_group, v_teacher, v_offering, 'Owned calendar group', 10, 'archived', 'Cairo'),
         (v_foreign_group, v_other_teacher, v_offering, 'Foreign calendar group', 10, 'draft', 'Giza'),
         (v_revoked_group, v_other_teacher, v_offering, 'Revoked membership group', 10, 'archived', 'Giza');
  insert into public.enrollments(group_id, student_id, status)
  values (v_owned_group, v_student, 'accepted'),
         (v_foreign_group, v_student, 'pending'),
         (v_revoked_group, v_student, 'removed');

  insert into public.lessons(id, group_id, title, starts_at, ends_at, status)
  values
    (v_boundary_lesson, v_owned_group, 'Cairo boundary', timestamp '2026-04-24 00:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-24 01:00:00' at time zone 'Africa/Cairo', 'scheduled'),
    (v_archived_lesson, v_owned_group, 'Cancelled history', timestamp '2026-04-25 12:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-25 13:00:00' at time zone 'Africa/Cairo', 'cancelled'),
    (v_after_end_lesson, v_owned_group, 'Exclusive upper bound', timestamp '2026-04-26 00:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-26 01:00:00' at time zone 'Africa/Cairo', 'scheduled'),
    (v_pending_lesson, v_foreign_group, 'Pending membership', timestamp '2026-04-24 12:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-24 13:00:00' at time zone 'Africa/Cairo', 'scheduled'),
    (v_foreign_lesson, v_foreign_group, 'Other teacher lesson', timestamp '2026-04-24 14:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-24 15:00:00' at time zone 'Africa/Cairo', 'scheduled'),
    (gen_random_uuid(), v_revoked_group, 'Revoked membership', timestamp '2026-04-24 16:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-24 17:00:00' at time zone 'Africa/Cairo', 'scheduled');

  perform set_config('request.jwt.claim.sub', v_student::text, true);
  v_result := public.calendar_lesson_export('2026-04-24', '2026-04-25');
  v_rows := v_result -> 'rows';
  if (v_result ->> 'total')::integer <> 2
     or not (v_rows @> jsonb_build_array(jsonb_build_object('id', v_boundary_lesson)))
     or not (v_rows @> jsonb_build_array(jsonb_build_object('id', v_archived_lesson, 'status', 'cancelled'))) then
    raise exception 'accepted student did not receive accepted-group historical lessons: %', v_result;
  end if;
  if (v_rows -> 0) ?| array['notes', 'materials', 'student_contacts', 'enrollments'] then
    raise exception 'export returned private fields: %', v_rows;
  end if;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_result := public.calendar_lesson_export('2026-04-24', '2026-04-25');
  v_rows := v_result -> 'rows';
  if (v_result ->> 'total')::integer <> 2
     or not (v_rows @> jsonb_build_array(jsonb_build_object('id', v_boundary_lesson)))
     or not (v_rows @> jsonb_build_array(jsonb_build_object('id', v_archived_lesson, 'status', 'cancelled'))) then
    raise exception 'teacher did not receive owned archived/cancelled history: %', v_result;
  end if;

  perform set_config('request.jwt.claim.sub', v_other_teacher::text, true);
  v_result := public.calendar_lesson_export('2026-04-24', '2026-04-25');
  if (v_result ->> 'total')::integer <> 3
     or not (v_result -> 'rows' @> jsonb_build_array(jsonb_build_object('id', v_pending_lesson))) then
    raise exception 'teacher did not receive own lessons: %', v_result;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  begin
    perform public.calendar_lesson_export('2026-04-24', '2026-04-25');
    raise exception 'admin was allowed to export calendar';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', v_inactive::text, true);
  begin
    perform public.calendar_lesson_export('2026-04-24', '2026-04-25');
    raise exception 'inactive student was allowed to export calendar';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.calendar_lesson_export('2026-04-24', '2026-04-25');
    raise exception 'anonymous viewer was allowed to export calendar';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_result := public.calendar_lesson_export('2026-04-24', '2026-07-25');
  if (v_result ->> 'total')::integer > 500 then
    raise exception '93-day range unexpectedly exceeded cap';
  end if;
  begin
    perform public.calendar_lesson_export('2026-04-24', '2026-04-24'::date + 93);
    raise exception '94-day range was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('request.jwt.claim.sub', v_teacher::text, true);
  insert into public.lessons(group_id, title, starts_at, ends_at)
  select v_owned_group, 'Cap fixture', timestamp '2026-04-27 00:00:00' at time zone 'Africa/Cairo', timestamp '2026-04-27 00:30:00' at time zone 'Africa/Cairo'
  from generate_series(1, 501);
  begin
    perform public.calendar_lesson_export('2026-04-27', '2026-04-27');
    raise exception '501-event range was accepted';
  exception when program_limit_exceeded then null;
  end;

  if has_function_privilege('anon', 'public.calendar_lesson_export(date,date)', 'execute')
     or has_function_privilege('service_role', 'public.calendar_lesson_export(date,date)', 'execute') then
    raise exception 'anon or service_role has function execute permission';
  end if;
end;
$$;

rollback;
