\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('public.teacher_applications') is null then raise exception 'teacher_applications table missing'; end if;
  if not (select relrowsecurity from pg_class where oid='public.teacher_applications'::regclass) then raise exception 'application RLS disabled'; end if;
  if (select public from storage.buckets where id='teacher-applications') is distinct from false
     or (select file_size_limit from storage.buckets where id='teacher-applications')<>5242880
     or (select allowed_mime_types from storage.buckets where id='teacher-applications')<>array['application/pdf']::text[] then
    raise exception 'application CV bucket is not private PDF-only with 5 MiB limit';
  end if;
  if has_table_privilege('anon','public.teacher_applications','SELECT')
     or has_table_privilege('authenticated','public.teacher_applications','INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','public.teacher_applications','INSERT,UPDATE,DELETE') then
    raise exception 'application table grants permit anonymous reads or direct mutations';
  end if;
  if not has_table_privilege('authenticated','public.teacher_applications','SELECT')
     or has_function_privilege('anon','public.read_teacher_application(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.read_teacher_application(uuid)','EXECUTE') then
    raise exception 'application private read grants are incorrect';
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='DELETE'
      and coalesce(qual,'') ilike '%teacher-applications%') then
    raise exception 'authenticated CV delete policy must be absent to avoid a submit/delete race';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7c000000-0000-4000-8000-000000000001','authenticated','authenticated','application-owner@test.invalid','{"full_name":"Application owner","requested_role":"teacher"}'),
 ('7c000000-0000-4000-8000-000000000002','authenticated','authenticated','application-foreign@test.invalid','{"full_name":"Application foreign","requested_role":"teacher"}'),
 ('7c000000-0000-4000-8000-000000000003','authenticated','authenticated','application-admin@test.invalid','{"full_name":"Application admin","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='7c000000-0000-4000-8000-000000000003';
set local session_replication_role=origin;

do $$
begin
  if (select status from public.teacher_applications where teacher_id='7c000000-0000-4000-8000-000000000001')<>'draft'
     or (select legacy_approved from public.teacher_applications where teacher_id='7c000000-0000-4000-8000-000000000001') then
    raise exception 'new teacher application did not initialize as draft';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000001';
do $$
declare v_response jsonb; v_updated timestamptz;
begin
  v_response:=public.read_teacher_application();
  if v_response->'application'->>'status'<>'draft' or not (v_response->'missing' ? 'bio') then raise exception 'owner application read omitted draft or missing fields'; end if;
  begin
    update public.teacher_applications set status='approved' where teacher_id=auth.uid();
    raise exception 'owner directly changed application';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_teacher_application((v_response->'application'->>'updated_at')::timestamptz);
    raise exception 'incomplete application submitted';
  exception when sqlstate '22023' then null; end;
  select updated_at into v_updated from public.teacher_applications where teacher_id=auth.uid();
  begin
    perform public.save_teacher_application(0,'+1 (202) 555-0101',null,'{}',false,v_updated-'1 second'::interval);
    raise exception 'stale application edit accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.save_teacher_application(0,'+1 (202) 555-0101','7c000000-0000-4000-8000-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf','{}',false,v_updated);
    raise exception 'foreign CV path attached';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.save_teacher_application(0,'+1 (202) 555-0101',null,'https://drive.google.com.evil.invalid/file/d/a','{}',false,v_updated);
    raise exception 'non-Google CV URL accepted';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;

-- An existing pending review cannot approve a new draft through either the
-- canonical admin RPC or the compatibility boolean path.
set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000003';
do $$
declare v_request uuid;
begin
  select request_id into v_request from public.teacher_review_state where teacher_id='7c000000-0000-4000-8000-000000000001';
  begin
    perform public.admin_decide_teacher_review('7c000000-0000-4000-8000-000000000001',v_request,'approved',null);
    raise exception 'admin approved an unsubmitted application';
  exception when raise_exception then
    if sqlerrm='admin approved an unsubmitted application' then raise; end if;
  end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    update public.teacher_profiles set approved=true where id=auth.uid();
    raise exception 'raw owner approval approved an unsubmitted application';
  exception when raise_exception then
    if sqlerrm='raw owner approval approved an unsubmitted application' then raise; end if;
  end;
end $$;
reset role;
set local role service_role;
do $$
begin
  begin
    update public.teacher_profiles set approved=true where id='7c000000-0000-4000-8000-000000000001';
    raise exception 'service-role approval approved an unsubmitted application';
  exception when raise_exception then
    if sqlerrm='service-role approval approved an unsubmitted application' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if (select approved from public.teacher_profiles where id='7c000000-0000-4000-8000-000000000001') then raise exception 'rejected approval changed teacher'; end if;
end $$;

-- Owner can add a private PDF object only beneath their UUID and attach it only
-- after it exists. A foreign owner cannot upload/read it.
set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000001';
do $$
begin
  if not public.can_upload_teacher_application_cv('7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf','{"mimetype":"application/pdf"}') then raise exception 'owner PDF upload rejected'; end if;
  if public.can_upload_teacher_application_cv('7c000000-0000-4000-8000-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf','{"mimetype":"application/pdf"}') then raise exception 'foreign CV upload authorized'; end if;
  if public.can_upload_teacher_application_cv('7c000000-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf','{"mimetype":"text/plain"}') then raise exception 'non-PDF upload authorized'; end if;
end $$;
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('teacher-applications','7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf','7c000000-0000-4000-8000-000000000001','{"mimetype":"application/pdf","size":100}');
reset role;

-- Build a complete rich profile and attach the private CV through the exact RPC.
update public.profiles set full_name='Application owner' where id='7c000000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('teacher-avatars','7c000000-0000-4000-8000-000000000001/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png','7c000000-0000-4000-8000-000000000001','{"mimetype":"image/png","size":100}');
update public.teacher_profiles set headline='Experienced language tutor',avatar_path='7c000000-0000-4000-8000-000000000001/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png' where id='7c000000-0000-4000-8000-000000000001';
insert into public.teacher_specializations(teacher_id,offering_id)
select '7c000000-0000-4000-8000-000000000001',id from public.offerings order by id limit 1;
set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000001';
select public.save_teacher_profile_details(
 '{"about":{"ar":"هذه نبذة تعريفية طويلة ومفصلة عن خبرة المعلم وطريقته في مساعدة الطلاب على التعلم بثقة ووضوح.","en":"This is a detailed teacher biography with enough information about their work and the way they help learners build confidence."},"approach":{"ar":"أبدأ بفهم أهداف الطالب ثم أبني دروسا عملية واضحة وأراجع التقدم باستمرار.","en":"I begin by understanding each learner’s goals, then build clear practical lessons and review progress regularly."},"goals":{"ar":"","en":""},"qualifications":[{"id":"qualification-1","title":{"ar":"شهادة تعليم","en":"Teaching certificate"},"organization":{"ar":"جامعة القاهرة","en":"Cairo University"},"description":{"ar":"","en":""},"start_year":null,"end_year":2020,"current":false}],"experience":[{"id":"experience-1","title":{"ar":"مدرس لغة","en":"Language tutor"},"organization":{"ar":"عمل مستقل","en":"Independent work"},"description":{"ar":"دروس فردية ومشروعات تعليمية","en":"One-to-one lessons and independent learning projects"},"start_year":2019,"end_year":null,"current":true}],"languages":["Arabic","English"],"city":{"ar":"","en":""},"teaching_mode":"online","layout":"classic","palette":"teal","section_order":["about","qualifications","experience","approach","goals"],"hidden_sections":[]}'::jsonb,0
);
do $$
declare v_updated timestamptz; v_response jsonb; v_request uuid; v_event_count bigint;
begin
  select updated_at into v_updated from public.teacher_applications where teacher_id=auth.uid();
  v_response:=public.save_teacher_application(0,'+1 (202) 555-0101','7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',array['https://example.invalid/cv-context'],true,v_updated);
  v_updated:=(v_response->'application'->>'updated_at')::timestamptz;
  v_response:=public.submit_teacher_application(v_updated);
  if v_response->'application'->>'status'<>'submitted' or v_response->'application'->'snapshot'->>'full_name'<>'Application owner'
     or jsonb_array_length(v_response->'application'->'snapshot'->'specializations')<>1
     or v_response->'application'->'snapshot'->'profile_details'->'experience'->0->>'id'<>'experience-1' then
    raise exception 'submitted application snapshot is incomplete or not frozen';
  end if;
  select count(*) into v_event_count from public.teacher_review_events where teacher_id=auth.uid() and kind='requested';
  v_response:=public.submit_teacher_application((v_response->'application'->>'updated_at')::timestamptz);
  if (select count(*) from public.teacher_review_events where teacher_id=auth.uid() and kind='requested')<>v_event_count then
    raise exception 'submission retry created a duplicate review request event';
  end if;
  select request_id into v_request from public.teacher_review_state where teacher_id=auth.uid();
  if not public.can_read_teacher_application_cv('7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf') then raise exception 'owner cannot read own CV'; end if;
  if (select count(*) from storage.objects where bucket_id='teacher-applications' and name='7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf')<>1 then raise exception 'owner cannot download own submitted CV'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000003';
do $$
begin
  if not public.can_read_teacher_application_cv('7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf') then raise exception 'active admin cannot read submitted CV'; end if;
  if (select count(*) from storage.objects where bucket_id='teacher-applications' and name='7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf')<>1 then raise exception 'active admin cannot download submitted CV'; end if;
end $$;
reset role;
do $$
begin
  begin
    update public.teacher_applications set snapshot='{}'::jsonb where teacher_id='7c000000-0000-4000-8000-000000000001';
    raise exception 'submitted snapshot was editable';
  exception when raise_exception then
    if sqlerrm='submitted snapshot was editable' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000002';
do $$
begin
  if public.can_read_teacher_application_cv('7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf') then raise exception 'foreign teacher can read CV'; end if;
  if (select count(*) from storage.objects where bucket_id='teacher-applications' and name='7c000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf')<>0 then raise exception 'foreign teacher can download CV'; end if;
  if (select count(*) from public.teacher_applications where teacher_id='7c000000-0000-4000-8000-000000000001')<>0 then raise exception 'foreign teacher can read application'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000003';
do $$
declare v_request uuid;
begin
  select request_id into v_request from public.teacher_review_state where teacher_id='7c000000-0000-4000-8000-000000000001';
  perform public.request_teacher_application_changes('7c000000-0000-4000-8000-000000000001',v_request,'Please add more detail about the lesson plan.');
  if (select status from public.teacher_applications where teacher_id='7c000000-0000-4000-8000-000000000001')<>'changes_requested'
     or (select feedback from public.teacher_applications where teacher_id='7c000000-0000-4000-8000-000000000001')<>'Please add more detail about the lesson plan.'
     or (select status from public.teacher_review_state where teacher_id='7c000000-0000-4000-8000-000000000001')<>'declined' then
    raise exception 'change request did not use legacy decline audit and separate application state';
  end if;
  begin
    perform public.request_teacher_application_changes('7c000000-0000-4000-8000-000000000001',v_request,'Stale change request');
    raise exception 'stale change request accepted';
  exception when sqlstate '40001' then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000001';
do $$
declare v_updated timestamptz; v_response jsonb;
begin
  select updated_at into v_updated from public.teacher_applications where teacher_id=auth.uid();
  v_response:=public.save_teacher_application(0,'+1 (202) 555-0101',null,'https://drive.google.com/file/d/example/view','{}',true,v_updated);
  v_updated:=(v_response->'application'->>'updated_at')::timestamptz;
  v_response:=public.submit_teacher_application(v_updated);
  if v_response->'application'->>'status'<>'submitted'
     or v_response->'application'->'snapshot'->>'cv_url'<>'https://drive.google.com/file/d/example/view'
     or v_response->'application'->'snapshot'->>'cv_path' is not null then
    raise exception 'changes-requested application did not resubmit with optional Drive CV link';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000003';
do $$
declare v_request uuid;
begin
  select request_id into v_request from public.teacher_review_state where teacher_id='7c000000-0000-4000-8000-000000000001';
  perform public.admin_decide_teacher_review('7c000000-0000-4000-8000-000000000001',v_request,'approved',null);
  if not (select approved from public.teacher_profiles where id='7c000000-0000-4000-8000-000000000001')
     or (select status from public.teacher_applications where teacher_id='7c000000-0000-4000-8000-000000000001')<>'approved' then
    raise exception 'approval did not sync to teacher and application';
  end if;
end $$;
reset role;

rollback;
