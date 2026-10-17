begin;

create table public.account_setup_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('teacher','student')),
  current_stage smallint not null default 1 check (current_stage between 1 and 4),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  baseline jsonb not null default '{}'::jsonb check (jsonb_typeof(baseline)='object'),
  return_to text not null,
  version bigint not null default 0 check (version>=0),
  updated_at timestamptz not null default clock_timestamp(),
  check (octet_length(payload::text)<=131072 and octet_length(baseline::text)<=131072)
);

alter table public.account_setup_drafts enable row level security;
revoke all on public.account_setup_drafts from public,anon,authenticated,service_role;
grant select on public.account_setup_drafts to authenticated;
create policy account_setup_drafts_owner_read on public.account_setup_drafts
  for select to authenticated using (
    user_id=(select auth.uid()) and public.is_active_user()
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role::text=account_setup_drafts.role and p.status='active')
  );

create or replace function dars_private.account_setup_safe_return_to(p_role text,p_path text)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select case
    when p_role='teacher' then p_path ~ '^/(en|ar)/teacher$'
    when p_role='student' then p_path ~ '^/(en|ar)/student$'
    else false
  end
  or p_path ~ '^/(en|ar)/(groups|classes)/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
$$;
revoke all on function dars_private.account_setup_safe_return_to(text,text) from public,anon,authenticated,service_role;

create or replace function dars_private.account_setup_keys_only(p_value jsonb,p_allowed text[])
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
begin
  if jsonb_typeof(p_value)<>'object' or p_allowed is null then return false; end if;
  return not exists(select 1 from jsonb_object_keys(p_value) k where not (k=any(p_allowed)));
end;
$$;
revoke all on function dars_private.account_setup_keys_only(jsonb,text[]) from public,anon,authenticated,service_role;

create or replace function public.get_or_create_account_setup_draft(p_locale text,p_return_to text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_teacher public.teacher_profiles%rowtype;
  v_student public.student_profiles%rowtype;
  v_details public.teacher_profile_details%rowtype;
  v_app public.teacher_applications%rowtype;
  v_role text;
  v_payload jsonb;
  v_baseline jsonb;
  v_return_to text;
  v_draft public.account_setup_drafts%rowtype;
begin
  if v_uid is null or not public.is_active_user() or p_locale is null or p_locale not in ('en','ar') then
    raise exception 'active account and locale required' using errcode='42501';
  end if;
  select * into v_profile from public.profiles where id=v_uid;
  if not found or v_profile.status<>'active' or v_profile.role not in ('teacher','student') then
    raise exception 'active teacher or student required' using errcode='42501';
  end if;
  v_role:=v_profile.role::text;
  if v_role='teacher' then perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_uid::text,0)); end if;
  select * into v_profile from public.profiles where id=v_uid for update;
  if not found or v_profile.status<>'active' or v_profile.role::text<>v_role then
    raise exception 'account role changed during setup initialization' using errcode='42501';
  end if;
  v_return_to:=case when dars_private.account_setup_safe_return_to(v_role,p_return_to)
    then p_return_to else '/'||p_locale||'/'||v_role end;

  select * into v_draft from public.account_setup_drafts where user_id=v_uid;
  if found then
    if v_draft.role<>v_role then raise exception 'setup role changed' using errcode='42501'; end if;
    return jsonb_build_object('role',v_draft.role,'stage',v_draft.current_stage,'payload',v_draft.payload,
      'baseline',v_draft.baseline,'version',v_draft.version,'return_to',v_draft.return_to,'updated_at',v_draft.updated_at);
  end if;

  if v_role='teacher' then
    select * into v_teacher from public.teacher_profiles where id=v_uid for update;
    select * into v_details from public.teacher_profile_details where teacher_id=v_uid for update;
    select * into v_app from public.teacher_applications where teacher_id=v_uid for update;
    if not found or v_details.teacher_id is null or v_app.teacher_id is null
       or v_app.status not in ('draft','changes_requested','declined') or v_app.legacy_approved then
      raise exception 'teacher setup is not available' using errcode='42501';
    end if;
    select jsonb_build_object(
      'about',jsonb_build_object('full_name',v_profile.full_name,'headline',v_teacher.headline),
      'details',v_details.details,
      'background',jsonb_build_object('teaching_years',v_app.teaching_years),
      'offerings',jsonb_build_object('offering_ids',coalesce((select jsonb_agg(ts.offering_id::text order by ts.offering_id)
        from public.teacher_specializations ts where ts.teacher_id=v_uid),'[]'::jsonb)),
      'verification',jsonb_build_object('admin_phone',v_app.admin_phone,'cv_path',v_app.cv_path,
        'supporting_links',to_jsonb(v_app.supporting_links),'attested',v_app.attested)
    ) into v_payload;
    select jsonb_build_object(
      'profile_full_name',v_profile.full_name,'headline',v_teacher.headline,
      'offering_ids',coalesce((select jsonb_agg(ts.offering_id::text order by ts.offering_id)
        from public.teacher_specializations ts where ts.teacher_id=v_uid),'[]'::jsonb),
      'contacts',jsonb_build_object('phone_number',c.phone_number,'whatsapp_number',c.whatsapp_number,
        'contact_email',c.contact_email,'visibility',coalesce(c.visibility,'enrolled')),
      'details_version',v_details.version,'application_updated_at',v_app.updated_at
    ) into v_baseline from (select 1) x left join public.teacher_contacts c on c.teacher_id=v_uid;
  else
    select * into v_student from public.student_profiles where id=v_uid;
    if not found or not v_student.onboarding_required or v_student.onboarding_completed_at is not null then
      raise exception 'student setup is not available' using errcode='42501';
    end if;
    v_payload:=jsonb_build_object(
      'about',jsonb_build_object('full_name',v_profile.full_name,'age_range',v_student.age_range,'school_name',v_student.school_name),
      'learning',jsonb_build_object('education_year',v_student.education_year,'interests',to_jsonb(v_student.interests),'learning_goal',v_student.learning_goal)
    );
    v_baseline:=jsonb_build_object('profile_full_name',v_profile.full_name,'student_updated_at',v_student.updated_at);
  end if;

  insert into public.account_setup_drafts(user_id,role,current_stage,payload,baseline,return_to)
  values(v_uid,v_role,1,v_payload,v_baseline,v_return_to)
  on conflict(user_id) do nothing;
  select * into v_draft from public.account_setup_drafts where user_id=v_uid;
  if not found or v_draft.role<>v_role then raise exception 'setup draft initialization failed' using errcode='42501'; end if;
  return jsonb_build_object('role',v_draft.role,'stage',v_draft.current_stage,'payload',v_draft.payload,
    'baseline',v_draft.baseline,'version',v_draft.version,'return_to',v_draft.return_to,'updated_at',v_draft.updated_at);
end
$$;
revoke all on function public.get_or_create_account_setup_draft(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_or_create_account_setup_draft(text,text) to authenticated;

-- An explicit owner action for recovering from a canonical profile edit made
-- elsewhere while setup was in progress. The stale version is never reset to 0.
create or replace function public.restart_account_setup_draft(p_expected_version bigint,p_locale text,p_return_to text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_init jsonb;
  v_draft public.account_setup_drafts%rowtype;
  v_result jsonb;
begin
  if v_uid is null or p_locale is null or p_locale not in ('en','ar') or p_expected_version is null
    or p_expected_version>=9223372036854775807 then
    raise exception 'invalid setup restart request' using errcode='22023';
  end if;
  -- Initialization takes the same canonical locks as setup creation, then the draft row.
  v_init:=public.get_or_create_account_setup_draft(p_locale,p_return_to);
  select * into v_draft from public.account_setup_drafts where user_id=v_uid for update;
  if not found or v_draft.version<>p_expected_version then
    raise exception 'setup draft version conflict' using errcode='PT409';
  end if;
  delete from public.account_setup_drafts where user_id=v_uid;
  v_result:=public.get_or_create_account_setup_draft(p_locale,coalesce(p_return_to,v_draft.return_to));
  update public.account_setup_drafts set version=p_expected_version+1,updated_at=clock_timestamp()
    where user_id=v_uid returning * into v_draft;
  return jsonb_build_object('role',v_draft.role,'stage',v_draft.current_stage,'payload',v_draft.payload,
    'baseline',v_draft.baseline,'version',v_draft.version,'return_to',v_draft.return_to,'updated_at',v_draft.updated_at);
end
$$;
revoke all on function public.restart_account_setup_draft(bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.restart_account_setup_draft(bigint,text,text) to authenticated;

create or replace function public.save_account_setup_stage(p_stage smallint,p_payload jsonb,p_expected_version bigint,p_locale text,p_return_to text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_init jsonb;
  v_draft public.account_setup_drafts%rowtype;
  v_keys text[];
  v_item jsonb;
  v_details jsonb;
  v_count integer;
begin
  if v_uid is null or p_locale is null or p_locale not in ('en','ar') or p_stage is null or p_stage not between 1 and 4 then
    raise exception 'invalid setup stage' using errcode='22023';
  end if;
  v_init:=public.get_or_create_account_setup_draft(p_locale,p_return_to);
  v_role:=v_init->>'role';
  if (v_role='student' and p_stage>2) then raise exception 'invalid student setup stage' using errcode='22023'; end if;
  select * into v_draft from public.account_setup_drafts where user_id=v_uid for update;
  if not found or v_draft.role<>v_role then raise exception 'setup draft not found' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<>v_draft.version then
    raise exception 'setup draft version conflict' using errcode='PT409';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then
    raise exception 'invalid or oversized stage payload' using errcode='22023';
  end if;

  if v_role='teacher' then
    v_keys:=case p_stage when 1 then array['full_name','headline','languages']
      when 2 then array['about','approach','qualifications','experience','teaching_years']
      when 3 then array['offering_ids']
      else array['admin_phone','cv_path','supporting_links','attested'] end;
    if not dars_private.account_setup_keys_only(p_payload,v_keys) then raise exception 'unknown teacher setup stage field' using errcode='22023'; end if;
    if p_stage=1 then
      if p_payload ? 'full_name' and (jsonb_typeof(p_payload->'full_name')<>'string' or char_length(p_payload->>'full_name')>100)
        or p_payload ? 'headline' and (jsonb_typeof(p_payload->'headline')<>'string' or char_length(p_payload->>'headline')>160)
        or p_payload ? 'languages' and (jsonb_typeof(p_payload->'languages')<>'array' or jsonb_array_length(p_payload->'languages')>10) then
        raise exception 'invalid teacher about fields' using errcode='22023';
      end if;
      if p_payload ? 'languages' and exists(select 1 from jsonb_array_elements(p_payload->'languages') x
        where jsonb_typeof(x)<>'string' or char_length(btrim(x #>> '{}')) not between 1 and 60) then
        raise exception 'invalid teacher languages' using errcode='22023';
      end if;
      update public.account_setup_drafts set payload=jsonb_set(payload,'{about}',coalesce(payload->'about','{}'::jsonb)||(p_payload-'languages'),true),
        current_stage=p_stage,version=version+1,updated_at=clock_timestamp() where user_id=v_uid returning * into v_draft;
      if p_payload ? 'languages' then
        update public.account_setup_drafts set payload=jsonb_set(payload,'{details,languages}',p_payload->'languages',true)
        where user_id=v_uid returning * into v_draft;
      end if;
    elsif p_stage=2 then
      if p_payload ? 'teaching_years' and jsonb_typeof(p_payload->'teaching_years')<>'null' and
        (jsonb_typeof(p_payload->'teaching_years')<>'number' or (p_payload->>'teaching_years')::numeric<>trunc((p_payload->>'teaching_years')::numeric)
          or (p_payload->>'teaching_years')::integer not between 0 and 60) then
        raise exception 'invalid teaching years' using errcode='22023';
      end if;
      update public.account_setup_drafts set payload=jsonb_set(payload,'{details}',payload->'details'||(p_payload-'teaching_years'),true)
        where user_id=v_uid returning * into v_draft;
      if p_payload ? 'teaching_years' then
        update public.account_setup_drafts set payload=jsonb_set(payload,'{background}',coalesce(payload->'background','{}'::jsonb)||jsonb_build_object('teaching_years',p_payload->'teaching_years'),true)
        where user_id=v_uid returning * into v_draft;
      end if;
      perform dars_private.validate_teacher_profile_details(v_draft.payload->'details');
      update public.account_setup_drafts set current_stage=p_stage,version=version+1,updated_at=clock_timestamp() where user_id=v_uid returning * into v_draft;
    elsif p_stage=3 then
      if p_payload ? 'offering_ids' and (jsonb_typeof(p_payload->'offering_ids')<>'array' or jsonb_array_length(p_payload->'offering_ids')>50
        or exists(select 1 from jsonb_array_elements_text(p_payload->'offering_ids') x where x !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')) then
        raise exception 'invalid offering selection' using errcode='22023';
      end if;
      if p_payload ? 'offering_ids' and (select count(*) from jsonb_array_elements_text(p_payload->'offering_ids'))<>
          (select count(distinct value::uuid) from jsonb_array_elements_text(p_payload->'offering_ids')) then
        raise exception 'duplicate offering selection' using errcode='22023';
      end if;
      update public.account_setup_drafts set payload=jsonb_set(payload,'{offerings}',coalesce(payload->'offerings','{}'::jsonb)||p_payload,true),
        current_stage=p_stage,version=version+1,updated_at=clock_timestamp() where user_id=v_uid returning * into v_draft;
    else
      if p_payload ? 'admin_phone' and (jsonb_typeof(p_payload->'admin_phone')<>'string' or char_length(p_payload->>'admin_phone')>30)
        or p_payload ? 'cv_path' and jsonb_typeof(p_payload->'cv_path') not in ('null','string')
        or p_payload ? 'supporting_links' and (jsonb_typeof(p_payload->'supporting_links')<>'array' or jsonb_array_length(p_payload->'supporting_links')>3)
        or p_payload ? 'attested' and jsonb_typeof(p_payload->'attested')<>'boolean' then
        raise exception 'invalid verification fields' using errcode='22023';
      end if;
      if p_payload ? 'cv_path' and p_payload->'cv_path'<>'null'::jsonb and (p_payload->>'cv_path' !~ ('^'||v_uid::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$')) then
        raise exception 'invalid CV path' using errcode='22023';
      end if;
      if p_payload ? 'cv_path' and p_payload->'cv_path'<>'null'::jsonb and not exists(
        select 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=p_payload->>'cv_path'
          and o.owner_id=v_uid::text and lower(coalesce(o.metadata->>'mimetype',''))='application/pdf'
          and case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint end between 1 and 5242880
      ) then raise exception 'CV object is missing or invalid' using errcode='22023'; end if;
      if p_payload ? 'supporting_links' and exists(select 1 from jsonb_array_elements_text(p_payload->'supporting_links') x
        where char_length(x)>500 or x !~* '^https://[^[:space:]]+$') then
        raise exception 'invalid supporting link' using errcode='22023';
      end if;
      update public.account_setup_drafts set payload=jsonb_set(payload,'{verification}',coalesce(payload->'verification','{}'::jsonb)||p_payload,true),
        current_stage=p_stage,version=version+1,updated_at=clock_timestamp() where user_id=v_uid returning * into v_draft;
    end if;
  else
    v_keys:=case p_stage when 1 then array['full_name','age_range','school_name'] else array['education_year','interests','learning_goal'] end;
    if not dars_private.account_setup_keys_only(p_payload,v_keys) then raise exception 'unknown student setup stage field' using errcode='22023'; end if;
    if p_stage=1 then
      if p_payload ? 'full_name' and (jsonb_typeof(p_payload->'full_name')<>'string' or char_length(btrim(p_payload->>'full_name'))>100)
        or p_payload ? 'age_range' and jsonb_typeof(p_payload->'age_range') not in ('null','string')
        or p_payload ? 'school_name' and (jsonb_typeof(p_payload->'school_name')<>'string' or char_length(p_payload->>'school_name')>160) then
        raise exception 'invalid student about fields' using errcode='22023';
      end if;
      if p_payload ? 'age_range' and p_payload->'age_range'<>'null'::jsonb and p_payload->>'age_range' not in ('under_13','13_15','16_17','18_24','25_plus') then
        raise exception 'invalid student age range' using errcode='22023';
      end if;
      update public.account_setup_drafts set payload=jsonb_set(payload,'{about}',coalesce(payload->'about','{}'::jsonb)||p_payload,true),
        current_stage=p_stage,version=version+1,updated_at=clock_timestamp() where user_id=v_uid returning * into v_draft;
    else
      if p_payload ? 'education_year' and (jsonb_typeof(p_payload->'education_year')<>'string' or char_length(p_payload->>'education_year')>100)
        or p_payload ? 'learning_goal' and (jsonb_typeof(p_payload->'learning_goal')<>'string' or char_length(p_payload->>'learning_goal')>1000)
        or p_payload ? 'interests' and (jsonb_typeof(p_payload->'interests')<>'array' or jsonb_array_length(p_payload->'interests')>10) then
        raise exception 'invalid student learning fields' using errcode='22023';
      end if;
      if p_payload ? 'interests' and exists(select 1 from jsonb_array_elements(p_payload->'interests') x
        where jsonb_typeof(x)<>'string' or char_length(btrim(x #>> '{}')) not between 1 and 80) then
        raise exception 'invalid student interests' using errcode='22023';
      end if;
      if p_payload ? 'interests' and (select count(*) from jsonb_array_elements_text(p_payload->'interests'))<>
          (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_payload->'interests')) then
        raise exception 'duplicate student interests' using errcode='22023';
      end if;
      update public.account_setup_drafts set payload=jsonb_set(payload,'{learning}',coalesce(payload->'learning','{}'::jsonb)||p_payload,true),
        current_stage=p_stage,version=version+1,updated_at=clock_timestamp() where user_id=v_uid returning * into v_draft;
    end if;
  end if;
  if octet_length(v_draft.payload::text)>131072 then raise exception 'setup draft exceeds size limit' using errcode='22023'; end if;
  return jsonb_build_object('role',v_draft.role,'stage',v_draft.current_stage,'payload',v_draft.payload,
    'baseline',v_draft.baseline,'version',v_draft.version,'return_to',v_draft.return_to,'updated_at',v_draft.updated_at);
end
$$;
revoke all on function public.save_account_setup_stage(smallint,jsonb,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_account_setup_stage(smallint,jsonb,bigint,text,text) to authenticated;

create or replace function public.complete_teacher_account_setup(p_expected_version bigint,p_locale text,p_return_to text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth,storage
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_teacher public.teacher_profiles%rowtype;
  v_details public.teacher_profile_details%rowtype;
  v_app public.teacher_applications%rowtype;
  v_draft public.account_setup_drafts%rowtype;
  v_payload jsonb;
  v_baseline jsonb;
  v_details_json jsonb;
  v_offerings uuid[];
  v_links text[];
  v_cv text;
  v_missing text[];
  v_submitted jsonb;
  v_destination text;
  v_contacts jsonb;
  v_current_offerings jsonb;
begin
  if v_uid is null or p_locale is null or p_locale not in ('en','ar') or not public.is_active_user()
    or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='teacher' and p.status='active') then
    raise exception 'active teacher required' using errcode='42501';
  end if;
  -- Match the canonical application/profile lock order before comparing or writing.
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_uid::text,0));
  select * into v_teacher from public.teacher_profiles where id=v_uid for update;
  if not found then raise exception 'teacher profile required' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid for update;
  select * into v_draft from public.account_setup_drafts where user_id=v_uid for update;
  select * into v_app from public.teacher_applications where teacher_id=v_uid for update;
  if v_draft.user_id is null then
    if v_app.status='submitted' then
      v_destination:=case when dars_private.account_setup_safe_return_to('teacher',p_return_to) then p_return_to else '/'||p_locale||'/teacher' end;
      return jsonb_build_object('ok',true,'already_submitted',true,'destination',v_destination,'application',public.read_teacher_application());
    end if;
    raise exception 'teacher setup draft not found' using errcode='P0002';
  end if;
  if v_draft.role<>'teacher' then raise exception 'teacher setup draft required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<>v_draft.version then raise exception 'setup draft version conflict' using errcode='PT409'; end if;
  if v_draft.current_stage<>4 then raise exception 'save the verification stage before submitting' using errcode='22023'; end if;
  if v_app.status not in ('draft','changes_requested','declined') or v_app.legacy_approved then raise exception 'teacher application is locked' using errcode='42501'; end if;
  v_payload:=v_draft.payload; v_baseline:=v_draft.baseline;

  perform 1 from public.teacher_contacts where teacher_id=v_uid for update;
  perform 1 from public.teacher_specializations where teacher_id=v_uid for update;
  select jsonb_build_object('phone_number',c.phone_number,'whatsapp_number',c.whatsapp_number,'contact_email',c.contact_email,
    'visibility',coalesce(c.visibility,'enrolled')) into v_contacts from (select 1) x left join public.teacher_contacts c on c.teacher_id=v_uid;
  select coalesce(jsonb_agg(ts.offering_id::text order by ts.offering_id),'[]'::jsonb) into v_current_offerings
    from public.teacher_specializations ts where ts.teacher_id=v_uid;
  if v_profile.full_name is distinct from v_baseline->>'profile_full_name'
    or v_teacher.headline is distinct from v_baseline->>'headline'
    or v_current_offerings is distinct from v_baseline->'offering_ids'
    or v_contacts is distinct from v_baseline->'contacts'
    or v_app.updated_at is distinct from (v_baseline->>'application_updated_at')::timestamptz then
    raise exception 'canonical teacher profile changed' using errcode='PT409';
  end if;
  select * into v_details from public.teacher_profile_details where teacher_id=v_uid for update;
  if not found or v_details.version is distinct from (v_baseline->>'details_version')::bigint then
    raise exception 'teacher profile details changed' using errcode='PT409';
  end if;

  v_details_json:=v_payload->'details';
  perform dars_private.validate_teacher_profile_details(v_details_json);
  select coalesce(array_agg(value::uuid order by ordinality),'{}'::uuid[]) into v_offerings
    from jsonb_array_elements_text(v_payload#>'{offerings,offering_ids}') with ordinality as x(value,ordinality);
  select coalesce(array_agg(value order by ordinality),'{}'::text[]) into v_links
    from jsonb_array_elements_text(v_payload#>'{verification,supporting_links}') with ordinality as x(value,ordinality);
  v_cv:=v_payload#>>'{verification,cv_path}';
  if v_cv is not null and not exists(select 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=v_cv
    and o.owner_id=v_uid::text and lower(coalesce(o.metadata->>'mimetype',''))='application/pdf'
    and case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint end between 1 and 5242880) then
    raise exception 'CV object is missing or invalid' using errcode='22023';
  end if;

  perform public.save_teacher_profile_account(
    v_payload#>>'{about,full_name}',v_payload#>>'{about,headline}',v_offerings,
    v_contacts->>'phone_number',v_contacts->>'whatsapp_number',v_contacts->>'contact_email',v_contacts->>'visibility'
  );
  perform public.save_teacher_profile_details(v_details_json,v_details.version);
  perform public.save_teacher_application(
    case when jsonb_typeof(v_payload#>'{background,teaching_years}')='number' then (v_payload#>>'{background,teaching_years}')::integer else null end,
    coalesce(v_payload#>>'{verification,admin_phone}',''),v_cv,v_links,
    coalesce((v_payload#>>'{verification,attested}')::boolean,false),v_app.updated_at
  );
  v_missing:=dars_private.teacher_application_missing(v_uid);
  if cardinality(v_missing)>0 then raise exception 'incomplete teacher application: %',array_to_string(v_missing,',') using errcode='22023'; end if;
  select updated_at into v_app.updated_at from public.teacher_applications where teacher_id=v_uid;
  v_submitted:=public.submit_teacher_application(v_app.updated_at);
  delete from public.account_setup_drafts where user_id=v_uid;
  return jsonb_build_object('ok',true,'destination',v_draft.return_to,'application',v_submitted);
end
$$;
revoke all on function public.complete_teacher_account_setup(bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_teacher_account_setup(bigint,text,text) to authenticated;

create or replace function public.complete_student_account_setup(p_expected_version bigint,p_locale text,p_return_to text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_student public.student_profiles%rowtype;
  v_draft public.account_setup_drafts%rowtype;
  v_payload jsonb;
  v_saved jsonb;
  v_destination text;
  v_interests text[];
begin
  if v_uid is null or p_locale is null or p_locale not in ('en','ar') or not public.is_active_user()
    or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='student' and p.status='active') then
    raise exception 'active student required' using errcode='42501';
  end if;
  select * into v_student from public.student_profiles where id=v_uid for update;
  select * into v_profile from public.profiles where id=v_uid for update;
  select * into v_draft from public.account_setup_drafts where user_id=v_uid for update;
  if v_draft.user_id is null then
    if not v_student.onboarding_required and v_student.onboarding_completed_at is not null then
      v_destination:=case when dars_private.account_setup_safe_return_to('student',p_return_to) then p_return_to else '/'||p_locale||'/student' end;
      return jsonb_build_object('ok',true,'already_completed',true,'destination',v_destination);
    end if;
    raise exception 'student setup draft not found' using errcode='P0002';
  end if;
  if v_draft.role<>'student' then raise exception 'student setup draft required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<>v_draft.version then raise exception 'setup draft version conflict' using errcode='PT409'; end if;
  if v_draft.current_stage<>2 then raise exception 'save the learning stage before finishing' using errcode='22023'; end if;
  if not v_student.onboarding_required or v_student.onboarding_completed_at is not null then raise exception 'student profile is already complete' using errcode='PT409'; end if;
  if v_student.updated_at is distinct from (v_draft.baseline->>'student_updated_at')::timestamptz
    or v_profile.full_name is distinct from v_draft.baseline->>'profile_full_name' then
    raise exception 'canonical student profile changed' using errcode='PT409';
  end if;
  v_payload:=v_draft.payload;
  select coalesce(array_agg(value order by ordinality),'{}'::text[]) into v_interests
    from jsonb_array_elements_text(v_payload#>'{learning,interests}') with ordinality as x(value,ordinality);
  v_saved:=public.save_student_learning_profile(
    v_payload#>>'{about,full_name}',v_payload#>>'{about,age_range}',v_payload#>>'{learning,education_year}',v_interests,
    v_payload#>>'{learning,learning_goal}',coalesce(v_payload#>>'{about,school_name}',''),v_student.updated_at
  );
  delete from public.account_setup_drafts where user_id=v_uid;
  return jsonb_build_object('ok',true,'destination',v_draft.return_to,'profile',v_saved);
end
$$;
revoke all on function public.complete_student_account_setup(bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_student_account_setup(bigint,text,text) to authenticated;

commit;
