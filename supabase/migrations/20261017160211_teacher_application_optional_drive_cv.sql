begin;
alter table public.teacher_applications add column cv_url text;
alter table public.teacher_applications add constraint teacher_application_cv_url check (cv_url is null or (char_length(cv_url)<=500 and cv_url ~ '^https://drive\.google\.com/[^[:space:]]+$' and cv_url !~* '^https://[^/]*@'));

create or replace function dars_private.teacher_application_snapshot(p_teacher_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,dars_private as $$
  select jsonb_build_object(
    'full_name',p.full_name,'headline',t.headline,'avatar_path',t.avatar_path,
    'specializations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label_ar',s.name_ar||' · '||n.name_ar,'label_en',s.name_en||' · '||n.name_en) order by s.name_en,n.name_en)
      from public.teacher_specializations ts join public.offerings o on o.id=ts.offering_id join public.subjects s on s.id=o.subject_id join public.education_nodes n on n.id=o.node_id where ts.teacher_id=t.id),'[]'::jsonb),
    'profile_details',d.details,'teaching_years',a.teaching_years,'admin_phone',a.admin_phone,
    'supporting_links',to_jsonb(a.supporting_links),'cv_path',a.cv_path,'cv_url',a.cv_url,'attested',a.attested
  )
  from public.profiles p join public.teacher_profiles t on t.id=p.id
  join public.teacher_profile_details d on d.teacher_id=t.id
  join public.teacher_applications a on a.teacher_id=t.id
  where t.id=p_teacher_id
$$;
revoke all on function dars_private.teacher_application_snapshot(uuid) from public,anon,authenticated,service_role;

create or replace function dars_private.teacher_application_snapshot_missing(p_snapshot jsonb)
returns text[] language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_missing text[]:=array[]::text[];
  v_details jsonb:=p_snapshot->'profile_details';
  v_phone text:=coalesce(p_snapshot->>'admin_phone','');
begin
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'full_name','')))=0 then v_missing:=array_append(v_missing,'full_name'); end if;
  if p_snapshot is null or nullif(btrim(p_snapshot->>'avatar_path'),'') is null then v_missing:=array_append(v_missing,'photo'); end if;
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'headline','')))<5 then v_missing:=array_append(v_missing,'headline'); end if;
  if v_details is null or (coalesce(length(btrim(v_details->'about'->>'ar')),0)<80 and coalesce(length(btrim(v_details->'about'->>'en')),0)<80) then v_missing:=array_append(v_missing,'bio'); end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot->'specializations')<>'array' or jsonb_array_length(coalesce(p_snapshot->'specializations','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'specializations'); end if;
  if v_details is null or jsonb_typeof(v_details->'languages')<>'array' or jsonb_array_length(coalesce(v_details->'languages','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'languages'); end if;
  if v_details is null or not exists(
    select 1 from jsonb_array_elements(coalesce(v_details->'experience','[]'::jsonb)) e
    where length(btrim(coalesce(e->'title'->>'ar','')||coalesce(e->'title'->>'en','')))>0
      and length(btrim(coalesce(e->'organization'->>'ar','')||coalesce(e->'organization'->>'en','')))>0
      and length(btrim(coalesce(e->'description'->>'ar','')||coalesce(e->'description'->>'en','')))>0
      and e->'start_year'<>'null'::jsonb and ((e->>'current')::boolean or e->'end_year'<>'null'::jsonb)
  ) then v_missing:=array_append(v_missing,'experience'); end if;
  if v_details is null or not exists(
    select 1 from jsonb_array_elements(coalesce(v_details->'qualifications','[]'::jsonb)) q
    where length(btrim(coalesce(q->'title'->>'ar','')||coalesce(q->'title'->>'en','')))>0
      and length(btrim(coalesce(q->'organization'->>'ar','')||coalesce(q->'organization'->>'en','')))>0
      and ((q->>'current')::boolean or q->'end_year'<>'null'::jsonb)
  ) then v_missing:=array_append(v_missing,'qualifications'); end if;
  if length(btrim(coalesce(v_details->'approach'->>'ar','')))<40 and length(btrim(coalesce(v_details->'approach'->>'en','')))<40 then v_missing:=array_append(v_missing,'approach'); end if;
  if jsonb_typeof(p_snapshot->'teaching_years')<>'number' or (p_snapshot->>'teaching_years')::integer not between 0 and 60 then v_missing:=array_append(v_missing,'teaching_years'); end if;
  if length(btrim(v_phone)) not between 7 and 30 or v_phone !~ '^[0-9+() -]+$' or length(regexp_replace(v_phone,'[^0-9]','','g'))<7 then v_missing:=array_append(v_missing,'admin_phone'); end if;
  if coalesce(p_snapshot->>'attested','false')<>'true' then v_missing:=array_append(v_missing,'attestation'); end if;
  return v_missing;
end $$;
revoke all on function dars_private.teacher_application_snapshot_missing(jsonb) from public,anon,authenticated,service_role;

create or replace function public.save_teacher_application(
  p_teaching_years integer,p_admin_phone text,p_cv_path text,p_cv_url text,p_supporting_links text[],p_attested boolean,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare
  v_teacher_id uuid:=auth.uid(); v_app public.teacher_applications; v_links text[]:=coalesce(p_supporting_links,'{}');
begin
  perform 1 from public.teacher_profiles where id=v_teacher_id for update;
  if not found or not exists(select 1 from public.profiles p where p.id=v_teacher_id and p.role='teacher' and p.status='active') then raise exception 'active teacher only'; end if;
  select * into v_app from public.teacher_applications where teacher_id=v_teacher_id for update;
  if not found then raise exception 'teacher application not found'; end if;
  if v_app.status not in ('draft','changes_requested','declined') then raise exception 'application cannot be edited in this state'; end if;
  if p_expected_updated_at is null or v_app.updated_at is distinct from p_expected_updated_at then raise exception using errcode='PT409',message='teacher application is stale'; end if;
  if p_teaching_years is not null and p_teaching_years not between 0 and 60 then raise exception 'teaching years must be between 0 and 60' using errcode='22023'; end if;
  if cardinality(v_links)>3 or exists(select 1 from unnest(v_links) x where x is null or length(x)>500 or x !~* '^https://[^[:space:]]+$') then raise exception 'supporting links must be up to three HTTPS URLs of at most 500 characters' using errcode='22023'; end if;
  if p_cv_url is not null and (char_length(p_cv_url)>500 or p_cv_url !~ '^https://drive\.google\.com/[^[:space:]]+$' or p_cv_url ~* '^https://[^/]*@') then raise exception 'CV link must be a Google Drive HTTPS URL of at most 500 characters' using errcode='22023'; end if;
  if p_cv_path is not null and (p_cv_path !~ ('^'||v_teacher_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$')
      or not exists(select 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=p_cv_path)) then raise exception 'CV must be an uploaded application PDF owned by this teacher' using errcode='22023'; end if;
  update public.teacher_applications set teaching_years=p_teaching_years,admin_phone=coalesce(p_admin_phone,''),cv_path=p_cv_path,cv_url=p_cv_url,
    supporting_links=v_links,attested=coalesce(p_attested,false),snapshot=null where teacher_id=v_teacher_id;
  return public.read_teacher_application(v_teacher_id);
end $$;
revoke all on function public.save_teacher_application(integer,text,text,text,text[],boolean,timestamptz) from public,anon;
grant execute on function public.save_teacher_application(integer,text,text,text,text[],boolean,timestamptz) to authenticated;

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
  if v_role='teacher' then
    perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_uid::text,0));
  else
    -- Student completion and profile edits lock the student row before the base profile.
    perform 1 from public.student_profiles where id=v_uid for update;
  end if;
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
      'verification',jsonb_build_object('admin_phone',v_app.admin_phone,'cv_path',v_app.cv_path,'cv_url',v_app.cv_url,
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
      else array['admin_phone','cv_path','cv_url','supporting_links','attested'] end;
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
        or p_payload ? 'cv_url' and jsonb_typeof(p_payload->'cv_url') not in ('null','string')
        or p_payload ? 'supporting_links' and (jsonb_typeof(p_payload->'supporting_links')<>'array' or jsonb_array_length(p_payload->'supporting_links')>3)
        or p_payload ? 'attested' and jsonb_typeof(p_payload->'attested')<>'boolean' then
        raise exception 'invalid verification fields' using errcode='22023';
      end if;
      if p_payload ? 'cv_url' and p_payload->'cv_url'<>'null'::jsonb and (char_length(p_payload->>'cv_url')>500 or p_payload->>'cv_url' !~ '^https://drive\.google\.com/[^[:space:]]+$' or p_payload->>'cv_url' ~* '^https://[^/]*@') then
        raise exception 'invalid Google Drive CV URL' using errcode='22023';
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
  v_cv_url text;
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
  v_cv_url:=nullif(btrim(v_payload#>>'{verification,cv_url}'),'');
  if v_cv_url is not null and (char_length(v_cv_url)>500 or v_cv_url !~ '^https://drive\.google\.com/[^[:space:]]+$' or v_cv_url ~* '^https://[^/]*@') then raise exception 'invalid Google Drive CV URL' using errcode='22023'; end if;
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
    coalesce(v_payload#>>'{verification,admin_phone}',''),v_cv,v_cv_url,v_links,
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

commit;
