do $$
declare
  v_missing text[];
  v_def text;
begin
  if exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and cmd in ('INSERT','UPDATE','ALL')
      and (
        coalesce(qual,'') ilike '%lesson-materials%' or coalesce(with_check,'') ilike '%lesson-materials%'
        or coalesce(qual,'') ilike '%teacher-avatars%' or coalesce(with_check,'') ilike '%teacher-avatars%'
        or coalesce(qual,'') ilike '%teacher-applications%' or coalesce(with_check,'') ilike '%teacher-applications%'
      )
  ) then raise exception 'authenticated binary storage write policy remains'; end if;

  select pg_get_functiondef('dars_private.teacher_application_snapshot_missing(jsonb)'::regprocedure) into v_def;
  if v_def ilike '%array_append(v_missing,''photo'')%' or v_def ilike '%array_append(v_missing,''cv'')%' then
    raise exception 'teacher photo or CV still blocks application review';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.lesson_materials'::regclass and tgname='lesson_materials_link_only' and not tgisinternal) then
    raise exception 'new non-link resource guard is missing';
  end if;
  if not exists(select 1 from pg_proc where oid='public.reject_new_non_link_lesson_material()'::regprocedure
      and prosrc ilike '%new.kind<>''link''%'
      and prosrc ilike '%new.kind is distinct from old.kind%') then
    raise exception 'new file or note metadata is not guarded at the database boundary';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lesson_materials' and cmd='SELECT') then
    raise exception 'lesson material read policy was removed';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='SELECT' and (qual ilike '%lesson-materials%' or qual ilike '%teacher-avatars%')) then
    raise exception 'legacy binary read policies were removed';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='teacher_application_cv_read' and cmd='SELECT') then
    raise exception 'legacy CV read policy was removed';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='DELETE' and (qual ilike '%lesson-materials%' or qual ilike '%teacher-avatars%')) then
    raise exception 'legacy binary cleanup policies were removed';
  end if;

  v_missing := dars_private.teacher_application_snapshot_missing(jsonb_build_object(
    'full_name','Teacher','headline','Experienced teacher','profile_details',jsonb_build_object(
      'about',jsonb_build_object('en',repeat('a',80)),'approach',jsonb_build_object('en',repeat('b',40)),
      'languages',jsonb_build_array('English'),
      'experience',jsonb_build_array(jsonb_build_object('title',jsonb_build_object('en','Teacher'),
        'organization',jsonb_build_object('en','School'),'description',jsonb_build_object('en','Taught learners'),
        'start_year',2020,'current',true)),
      'qualifications',jsonb_build_array(jsonb_build_object('title',jsonb_build_object('en','Degree'),
        'organization',jsonb_build_object('en','University'),'current',true))),
    'specializations',jsonb_build_array(jsonb_build_object('id','math')),'teaching_years',0,
    'admin_phone','+1234567890','attested',true));
  if cardinality(v_missing)<>0 then raise exception 'photo-less teacher application did not pass: %',v_missing; end if;

  v_missing := dars_private.teacher_application_snapshot_missing(jsonb_build_object(
    'full_name','','headline','','profile_details','{}'::jsonb,'specializations','[]'::jsonb,
    'teaching_years',-1,'admin_phone','','attested',false));
  if not (v_missing @> array['full_name','headline','bio','specializations','languages','experience',
      'qualifications','approach','teaching_years','admin_phone','attestation']::text[])
      or v_missing && array['photo','cv']::text[] then
    raise exception 'application validator dropped other review requirements or still requires photo/CV: %',v_missing;
  end if;
end
$$;

select 'links-only launch assertions passed' as result;
