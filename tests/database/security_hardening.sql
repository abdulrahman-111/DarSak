\set ON_ERROR_STOP on

do $$
begin
  if has_table_privilege('authenticated','public.group_schedule_slots','INSERT')
     or has_table_privilege('authenticated','public.group_schedule_slots','UPDATE')
     or has_table_privilege('authenticated','public.group_schedule_slots','DELETE') then
    raise exception 'direct recurring-slot writes remain available';
  end if;
  if not has_table_privilege('authenticated','public.education_nodes','INSERT,UPDATE,DELETE')
     or not has_table_privilege('authenticated','public.subjects','INSERT,UPDATE,DELETE')
     or not has_table_privilege('authenticated','public.offerings','INSERT,UPDATE,DELETE') then
    raise exception 'admin catalogue grants missing';
  end if;
  if not has_table_privilege('authenticated','public.platform_settings','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'admin settings grants missing';
  end if;
  if not has_table_privilege('authenticated','public.lesson_materials','DELETE') then
    raise exception 'material delete grant missing';
  end if;
  if not has_function_privilege('authenticated','public.set_lesson_status(uuid,text)','EXECUTE') then
    raise exception 'lesson status RPC grant missing';
  end if;
  if not has_function_privilege('anon','public.public_groups()','EXECUTE')
     or not has_function_privilege('authenticated','public.public_groups()','EXECUTE') then
    raise exception 'safe public groups RPC grant missing';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.lessons'::regclass
      and conname='lessons_slot_group_fk'
      and contype='f'
  ) then raise exception 'lesson slot/group foreign key missing'; end if;
  -- The upload policy repaired here was later removed on purpose by
  -- 20261018080722_links_only_launch.sql (no new lesson-file uploads), so
  -- assert the current launch state instead of the historical repair.
  if exists(
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='lesson_objects_insert'
  ) then raise exception 'lesson file uploads must stay closed under the links-only launch policy'; end if;
  if not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='lesson_materials'
      and policyname='material_write_insert'
      and roles @> array['authenticated'::name]
      and with_check like '%kind <>%file%'
  ) then raise exception 'material kind-aware policy missing'; end if;
  if (select prosrc from pg_proc where oid='public.is_group_member(uuid)'::regprocedure) !~ 'e\.status\s*=\s*''accepted'''
     or (select prosrc from pg_proc where oid='public.is_group_member(uuid)'::regprocedure) !~ 'p\.status\s*=\s*''active''' then
    raise exception 'membership helper does not require accepted active student';
  end if;
  if position('slot belongs to another group' in (select prosrc from pg_proc where oid='public.save_schedule_slot(uuid,integer,time without time zone,time without time zone,uuid)'::regprocedure))=0 then
    raise exception 'slot RPC ownership guard missing';
  end if;
  if position('lesson belongs to another group' in (select prosrc from pg_proc where oid='public.create_lesson(uuid,text,timestamp with time zone,timestamp with time zone,text,uuid)'::regprocedure))=0 then
    raise exception 'lesson RPC ownership guard missing';
  end if;
end $$;

do $$
begin
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='enrollments_student_status_idx') then
    raise exception 'enrollment lookup index missing';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='lessons_group_starts_at_idx') then
    raise exception 'lesson lookup index missing';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.lesson_materials'::regclass and conname='lesson_materials_url_no_credentials') then
    raise exception 'safe link constraint missing';
  end if;
  if (select coalesce(proargnames,'{}'::text[]) && array['reporter_id','student_id','email','admin_note']
      from pg_proc where oid='public.public_groups()'::regprocedure) then
    raise exception 'unsafe public group projection';
  end if;
end $$;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.groups'::regclass
      and conname='groups_teacher_id_fkey'
      and confdeltype='c'
  ) then raise exception 'teacher account deletion does not cascade groups'; end if;
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.enrollments'::regclass
      and conname='enrollments_student_id_fkey'
      and confdeltype='c'
  ) then raise exception 'student account deletion does not cascade enrollments'; end if;
end $$;

select 'security hardening SQL assertions passed' as result;
