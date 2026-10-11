\set ON_ERROR_STOP on
begin;

do $$
declare
  v_qualifications jsonb;
  v_experience jsonb;
  v_oversized jsonb;
  v_rejected boolean := false;
begin
  if to_regclass('public.teacher_profile_details') is null then
    raise exception 'teacher_profile_details table missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.teacher_profile_details'::regclass) then
    raise exception 'private teacher profile details must have RLS enabled';
  end if;
  if has_table_privilege('anon','public.teacher_profile_details','SELECT') then
    raise exception 'anonymous role can query canonical profile details';
  end if;
  if has_function_privilege('anon','public.save_teacher_profile_details(jsonb,bigint)','EXECUTE')
     or not has_function_privilege('authenticated','public.save_teacher_profile_details(jsonb,bigint)','EXECUTE') then
    raise exception 'rich profile save RPC grants are incorrect';
  end if;
  if has_function_privilege('anon','public.save_teacher_profile_account(text,text,uuid[],text,text,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.save_teacher_profile_account(text,text,uuid[],text,text,text,text)','EXECUTE') then
    raise exception 'account save RPC grants are incorrect';
  end if;
  if not has_function_privilege('anon','public.public_teacher_profile_details(uuid)','EXECUTE') then
    raise exception 'public profile projection is not callable anonymously';
  end if;
  if (select proargnames from pg_proc where oid='public.save_teacher_profile_account(text,text,uuid[],text,text,text,text)'::regprocedure)
     is distinct from array['p_full_name','p_headline','p_offering_ids','p_phone_number','p_whatsapp_number','p_contact_email','p_visibility']::text[] then
    raise exception 'account save RPC signature changed';
  end if;
  if (select proargnames from pg_proc where oid='public.save_teacher_profile(text,text,text,uuid[],text,text,text,text)'::regprocedure)
     is distinct from array['p_full_name','p_headline','p_bio','p_offering_ids','p_phone_number','p_whatsapp_number','p_contact_email','p_visibility']::text[] then
    raise exception 'legacy profile-save RPC signature changed';
  end if;
  if (select proargnames from pg_proc where oid='public.public_teachers()'::regprocedure)
     is distinct from array['id','full_name','headline','bio','avatar_path']::text[] then
    raise exception 'legacy public teacher result shape changed';
  end if;
  if dars_private.jsonb_compact_utf8_bytes('{"text":"a b","ar":"م"}'::jsonb)
       <> octet_length(convert_to('{"text":"a b","ar":"م"}','UTF8')) then
    raise exception 'serialized payload byte validation does not match compact UTF-8 JSON';
  end if;
  select jsonb_agg(jsonb_build_object(
    'id','qualification-'||n,
    'title',jsonb_build_object('ar',repeat('t',120),'en',repeat('t',120)),
    'organization',jsonb_build_object('ar',repeat('o',120),'en',repeat('o',120)),
    'description',jsonb_build_object('ar',repeat('d',1500),'en',repeat('d',1500)),
    'start_year',null,'end_year',null,'current',false
  )) into v_qualifications from generate_series(1,10) n;
  select jsonb_agg(jsonb_build_object(
    'id','experience-'||n,
    'title',jsonb_build_object('ar',repeat('t',120),'en',repeat('t',120)),
    'organization',jsonb_build_object('ar',repeat('o',120),'en',repeat('o',120)),
    'description',jsonb_build_object('ar',repeat('d',1500),'en',repeat('d',1500)),
    'start_year',null,'end_year',null,'current',false
  )) into v_experience from generate_series(1,10) n;
  v_oversized := jsonb_build_object(
    'about',jsonb_build_object('ar','','en',''),'approach',jsonb_build_object('ar','','en',''),
    'goals',jsonb_build_object('ar','','en',''),'qualifications',v_qualifications,'experience',v_experience,
    'languages','[]'::jsonb,'city',jsonb_build_object('ar','','en',''),'teaching_mode',null,
    'layout','classic','palette','teal','section_order','["about","qualifications","experience","approach","goals"]'::jsonb,
    'hidden_sections','[]'::jsonb
  );
  if dars_private.jsonb_compact_utf8_bytes(v_oversized) <= 65536 then
    raise exception 'oversized fixture did not exceed serialized payload cap';
  end if;
  begin
    perform dars_private.validate_teacher_profile_details(v_oversized);
  exception when sqlstate '22023' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'oversized serialized profile details were accepted'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','authenticated','authenticated','rich-teacher@regression.test','{"full_name":"Rich teacher","requested_role":"teacher"}'),
 ('20000000-0000-4000-8000-000000000002','authenticated','authenticated','rich-other@regression.test','{"full_name":"Other teacher","requested_role":"teacher"}'),
 ('20000000-0000-4000-8000-000000000003','authenticated','authenticated','rich-student@regression.test','{"full_name":"Student","requested_role":"student"}'),
 ('20000000-0000-4000-8000-000000000004','authenticated','authenticated','rich-admin@regression.test','{"full_name":"Admin","requested_role":"student"}');

set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id in (
 '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'
);
update public.profiles set role='admin' where id='20000000-0000-4000-8000-000000000004';
update public.teacher_profiles set bio='Existing legacy biography' where id='20000000-0000-4000-8000-000000000002';
update public.profiles set preferred_language='en' where id='20000000-0000-4000-8000-000000000002';
set local session_replication_role = origin;
delete from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000002';
select dars_private.backfill_teacher_profile_details();

do $$
declare v_details jsonb;
begin
  select details into v_details from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000001';
  if v_details is null or v_details->'about' <> '{"ar":"","en":""}'::jsonb then
    raise exception 'new teacher did not receive empty editable canonical details';
  end if;
  if (select count(*) from public.teacher_profiles where id='20000000-0000-4000-8000-000000000001' and bio='') <> 1 then
    raise exception 'new teacher legacy bio did not remain empty';
  end if;
  if (select details->'about'->>'en' from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000002') <> 'Existing legacy biography'
     or (select details->'about'->>'ar' from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000002') <> ''
     or (select bio from public.teacher_profiles where id='20000000-0000-4000-8000-000000000002') <> 'Existing legacy biography' then
    raise exception 'legacy biography backfill did not preserve text in preferred language';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select public.save_teacher_profile_details(
 '{"about":{"ar":"Visible Arabic","en":"Hidden English"},"approach":{"ar":"","en":""},"goals":{"ar":"","en":""},"qualifications":[],"experience":[],"languages":[],"city":{"ar":"","en":""},"teaching_mode":null,"layout":"classic","palette":"teal","section_order":["about","qualifications","experience","approach","goals"],"hidden_sections":["about"]}'::jsonb,
 0
);
reset role;

do $$
declare v_public jsonb; v_bio text; v_version bigint;
begin
  select version into v_version from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000001';
  if v_version <> 1 then raise exception 'version did not increment from initial version'; end if;
  select public.public_teacher_profile_details('20000000-0000-4000-8000-000000000001') into v_public;
  if v_public is not null then raise exception 'empty visible projection should be absent'; end if;
  select bio into v_bio from public.teacher_profiles where id='20000000-0000-4000-8000-000000000001';
  if v_bio <> '' then raise exception 'hidden About leaked into legacy bio'; end if;
  if (select count(*) from public.public_teachers() where id='20000000-0000-4000-8000-000000000001' and bio='') <> 1 then
    raise exception 'legacy public_teachers exposed hidden About';
  end if;
end $$;

set local role anon;
set local request.jwt.claim.sub='';
do $$
begin
  if exists (select 1 from public.public_teachers() where id='20000000-0000-4000-8000-000000000001' and bio like '%Hidden English%') then
    raise exception 'public_teachers exposed hidden About';
  end if;
  if public.public_teacher_profile_details('20000000-0000-4000-8000-000000000001') is not null then
    raise exception 'empty visible profile should not be published';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
do $$
begin
  if exists (select 1 from public.teacher_profiles where id='20000000-0000-4000-8000-000000000001' and bio like '%Hidden English%') then
    raise exception 'raw REST teacher_profiles bio contains hidden About';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000004';
do $$
begin
  if not exists (select 1 from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000001') then
    raise exception 'active admin cannot read private canonical details';
  end if;
end $$;
reset role;

set local role anon;
set local request.jwt.claim.sub='';
do $$
begin
  begin
    perform * from public.teacher_profile_details;
    raise exception 'anonymous role directly read private details';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
do $$
begin
  if exists (select 1 from public.teacher_profile_details where teacher_id='20000000-0000-4000-8000-000000000001') then
    raise exception 'foreign teacher read private details';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    perform public.save_teacher_profile_details('{"about":{"ar":"x","en":""},"unexpected":true}'::jsonb,1);
    raise exception 'invalid raw details accepted';
  exception when others then
    if sqlerrm = 'invalid raw details accepted' then raise; end if;
  end;
  begin
    perform public.save_teacher_profile_details(
      '{"about":{"ar":"new","en":""},"approach":{"ar":"","en":""},"goals":{"ar":"","en":""},"qualifications":[],"experience":[],"languages":[],"city":{"ar":"","en":""},"teaching_mode":null,"layout":"classic","palette":"teal","section_order":["about","qualifications","experience","approach","goals"],"hidden_sections":[]}'::jsonb,0
    );
    raise exception 'stale details version overwrote saved row';
  exception when others then
    if sqlerrm = 'stale details version overwrote saved row' then raise; end if;
  end;
end $$;
reset role;

select 'teacher profile details privacy and version assertions passed' as result;
rollback;
