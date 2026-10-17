\set ON_ERROR_STOP on
begin;

do $$ begin
  if has_table_privilege('authenticated','dars_private.account_deletion_requests','SELECT')
     or has_table_privilege('service_role','dars_private.account_deletion_requests','SELECT')
     or has_table_privilege('authenticated','dars_private.account_deletion_intents','SELECT') then
    raise exception 'private deletion tables must not be directly readable';
  end if;
  if has_function_privilege('anon','public.account_deletion_prepare(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.account_deletion_prepare(uuid,uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.account_deletion_prepare(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.account_deletion_claim(integer,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.account_deletion_claim(integer,uuid)','EXECUTE') then
    raise exception 'account-deletion RPC grants are unsafe';
  end if;
  if exists (
    select 1 from information_schema.columns where table_schema='public'
      and table_name='lesson_attendance' and column_name='recorded_by' and is_nullable='NO'
  ) or not exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid='public.lesson_attendance'::regclass and c.confdeltype='n'
      and a.attname='recorded_by'
  ) then raise exception 'attendance recorder must be nullable with SET NULL'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
 ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','delete-admin@test.invalid','{"provider":"google"}','{}'),
 ('71000000-0000-4000-8000-000000000002','authenticated','authenticated','delete-admin-keep@test.invalid','{"provider":"google"}','{}'),
 ('71000000-0000-4000-8000-000000000003','authenticated','authenticated','delete-teacher@test.invalid','{"provider":"google"}','{}'),
 ('71000000-0000-4000-8000-000000000004','authenticated','authenticated','delete-student@test.invalid','{"provider":"google"}','{}'),
 ('71000000-0000-4000-8000-000000000005','authenticated','authenticated','delete-student-keep@test.invalid','{"provider":"google"}','{}'),
 ('71000000-0000-4000-8000-000000000006','authenticated','authenticated','delete-pending-google@test.invalid','{"provider":"google"}','{}'),
 ('71000000-0000-4000-8000-000000000007','authenticated','authenticated','delete-foreign-teacher@test.invalid','{"provider":"google"}','{}');

insert into public.profiles(id,full_name,role,status) values
 ('71000000-0000-4000-8000-000000000001','Deletion Admin','admin','active'),
 ('71000000-0000-4000-8000-000000000002','Remaining Admin','admin','active'),
 ('71000000-0000-4000-8000-000000000003','Foreign Teacher','teacher','active'),
 ('71000000-0000-4000-8000-000000000004','Deleting Student','student','active'),
 ('71000000-0000-4000-8000-000000000005','Remaining Student','student','active'),
 ('71000000-0000-4000-8000-000000000007','Retained Teacher','teacher','active');
delete from dars_private.pending_google_signups where user_id in (
 '71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',
 '71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000004',
 '71000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000007'
);
-- Keep exactly the two test admins active so this test remains deterministic
-- when run against a developer database that already has local admin fixtures.
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
update public.profiles set status='suspended'
where role='admin' and status='active'
  and id not in ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002');
insert into public.teacher_profiles(id,headline) values
 ('71000000-0000-4000-8000-000000000001','Admin teacher'),
 ('71000000-0000-4000-8000-000000000003','Deleting teacher'),
 ('71000000-0000-4000-8000-000000000007','Foreign teacher');
insert into public.student_profiles(id) values
 ('71000000-0000-4000-8000-000000000004'),
 ('71000000-0000-4000-8000-000000000005');

insert into public.education_nodes(id,kind,name_ar,name_en,slug) values
 ('71010000-0000-4000-8000-000000000001','system','نظام','System','deletion-test-system'),
 ('71010000-0000-4000-8000-000000000002','level','مرحلة','Level','deletion-test-level'),
 ('71010000-0000-4000-8000-000000000003','grade','صف','Grade','deletion-test-grade');
update public.education_nodes set parent_id='71010000-0000-4000-8000-000000000001'
where id='71010000-0000-4000-8000-000000000002';
update public.education_nodes set parent_id='71010000-0000-4000-8000-000000000002'
where id='71010000-0000-4000-8000-000000000003';
insert into public.subjects(id,name_ar,name_en,slug) values
 ('71020000-0000-4000-8000-000000000001','مادة','Subject','deletion-test-subject');
insert into public.offerings(id,node_id,subject_id) values
 ('71030000-0000-4000-8000-000000000001','71010000-0000-4000-8000-000000000003','71020000-0000-4000-8000-000000000001');
insert into public.groups(id,teacher_id,offering_id,name,capacity,status) values
 ('71040000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000007','71030000-0000-4000-8000-000000000001','Retained teacher group',20,'draft'),
 ('71040000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003','71030000-0000-4000-8000-000000000001','Deleting teacher group',20,'draft');
insert into public.lessons(id,group_id,title,starts_at,ends_at) values
 ('71050000-0000-4000-8000-000000000001','71040000-0000-4000-8000-000000000001','Foreign group lesson',now(),now()+interval '1 hour'),
 ('71050000-0000-4000-8000-000000000002','71040000-0000-4000-8000-000000000002','Owned group lesson',now(),now()+interval '1 hour');
insert into public.enrollments(id,group_id,student_id,status) values
 ('71060000-0000-4000-8000-000000000001','71040000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000004','accepted'),
 ('71060000-0000-4000-8000-000000000002','71040000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','accepted'),
 ('71060000-0000-4000-8000-000000000003','71040000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000005','accepted');

insert into storage.buckets(id,name,public) values
 ('lesson-materials','lesson-materials',false),
 ('teacher-avatars','teacher-avatars',false),
 ('teacher-applications','teacher-applications',false)
on conflict(id) do nothing;
insert into storage.objects(bucket_id,name,owner,owner_id,metadata,version) values
 ('lesson-materials','71000000-0000-4000-8000-000000000001/foreign.pdf','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"size":123,"mimetype":"application/pdf"}','delete-test-foreign'),
 ('lesson-materials','71000000-0000-4000-8000-000000000001/owned.pdf','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"size":123,"mimetype":"application/pdf"}','delete-test-owned'),
 ('lesson-materials','strange/unreferenced.bin','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"size":123,"mimetype":"application/octet-stream"}','delete-test-strange'),
 ('lesson-materials','71000000-0000-4000-8000-000000000007/retained.pdf','71000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000007','{"size":123,"mimetype":"application/pdf"}','delete-test-retained'),
 ('teacher-applications','71000000-0000-4000-8000-000000000001/superseded-cv.pdf','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"size":123,"mimetype":"application/pdf"}','delete-test-cv'),
 ('teacher-avatars','71000000-0000-4000-8000-000000000001/cover/71070000-0000-4000-8000-000000000001.jpg','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"size":123,"mimetype":"image/jpeg"}','delete-test-cover'),
 ('lesson-materials','shared/owned.pdf','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','{"size":123,"mimetype":"application/pdf"}','delete-test-shared-material'),
 ('teacher-avatars','shared/owned.pdf','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','{"size":123,"mimetype":"application/pdf"}','delete-test-bucket-collision');
update public.teacher_profiles set cover_path='71000000-0000-4000-8000-000000000001/cover/71070000-0000-4000-8000-000000000001.jpg'
where id='71000000-0000-4000-8000-000000000001';
insert into public.lesson_materials(id,lesson_id,kind,title,storage_path,file_size,mime_type,uploaded_by) values
 ('71080000-0000-4000-8000-000000000001','71050000-0000-4000-8000-000000000001','file','Foreign upload','71000000-0000-4000-8000-000000000001/foreign.pdf',123,'application/pdf','71000000-0000-4000-8000-000000000001'),
 ('71080000-0000-4000-8000-000000000002','71050000-0000-4000-8000-000000000002','file','Owned lesson file','shared/owned.pdf',123,'application/pdf','71000000-0000-4000-8000-000000000003'),
 ('71080000-0000-4000-8000-000000000003','71050000-0000-4000-8000-000000000001','file','Foreign reference from another uploader','71000000-0000-4000-8000-000000000001/foreign-by-owner.pdf',123,'application/pdf','71000000-0000-4000-8000-000000000003'),
 ('71080000-0000-4000-8000-000000000004','71050000-0000-4000-8000-000000000001','file','Retained teacher file','71000000-0000-4000-8000-000000000007/retained.pdf',123,'application/pdf','71000000-0000-4000-8000-000000000007');
insert into storage.objects(bucket_id,name,owner,owner_id,metadata,version) values
 ('lesson-materials','71000000-0000-4000-8000-000000000001/foreign-by-owner.pdf','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','{"size":123,"mimetype":"application/pdf"}','delete-test-foreign-by-owner');
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values
 ('71050000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','present','71000000-0000-4000-8000-000000000001');

do $$
declare v_intent jsonb; v_request jsonb; v_status jsonb; v_claim record; v_file_count integer;
begin
  -- A deleting uploader with a retained foreign-group material is rejected
  -- before consuming state, deleting rows, or changing storage references.
  begin
    perform public.account_deletion_prepare('71000000-0000-4000-8000-000000000001',null,null,'password');
    raise exception 'foreign-group material preflight unexpectedly passed';
  exception when check_violation then
    if sqlerrm <> 'foreign_group_material' then raise; end if;
  end;
  if not exists(select 1 from public.profiles where id='71000000-0000-4000-8000-000000000001' and status='active')
     or not exists(select 1 from public.lesson_materials where id='71080000-0000-4000-8000-000000000001')
     or not exists(select 1 from storage.objects where bucket_id='lesson-materials' and name='71000000-0000-4000-8000-000000000001/foreign.pdf')
     or exists(select 1 from dars_private.account_deletion_requests where user_id='71000000-0000-4000-8000-000000000001') then
    raise exception 'foreign-group preflight changed data or queued deletion';
  end if;

  -- OAuth intent is UID/nonce/expiry-bound, timestamp-limited, and one-use.
  v_intent := public.account_deletion_create_intent('71000000-0000-4000-8000-000000000006',repeat('a',64),clock_timestamp()+interval '5 minutes');
  perform public.account_deletion_complete_intent('71000000-0000-4000-8000-000000000006',(v_intent->>'intent_id')::uuid,repeat('a',64),clock_timestamp());
  begin
    perform public.account_deletion_complete_intent('71000000-0000-4000-8000-000000000006',(v_intent->>'intent_id')::uuid,repeat('a',64),clock_timestamp());
    raise exception 'OAuth intent completion replay unexpectedly passed';
  exception when insufficient_privilege then
    if sqlerrm <> 'invalid_intent' then raise; end if;
  end;
  v_request := public.account_deletion_prepare('71000000-0000-4000-8000-000000000006',(v_intent->>'intent_id')::uuid,repeat('a',64),'google');
  if exists(select 1 from dars_private.pending_google_signups where user_id='71000000-0000-4000-8000-000000000006')
     or exists(select 1 from public.profiles where id='71000000-0000-4000-8000-000000000006') then
    raise exception 'pending Google identity was not removed transactionally';
  end if;
  perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000006',true);
  begin
    perform public.complete_google_signup('student');
    raise exception 'queued Google identity was recreated';
  exception when insufficient_privilege then null;
  end;

  -- Student deletion leaves a teacher's group, lesson, and material intact.
  v_request := public.account_deletion_prepare('71000000-0000-4000-8000-000000000004',null,null,'password');
  if v_request->>'state'<>'queued' or exists(select 1 from public.profiles where id='71000000-0000-4000-8000-000000000004')
     or not exists(select 1 from public.groups where id='71040000-0000-4000-8000-000000000001')
     or not exists(select 1 from public.lesson_materials where id='71080000-0000-4000-8000-000000000004') then
    raise exception 'student deletion removed teacher-owned content or did not queue';
  end if;

  -- Once foreign material is removed, admin deletion snapshots every UID-owned
  -- object, unusual unreferenced keys, and owned-group lesson files; profile
  -- cascade removes owned group content and releases the cover FK.
  delete from public.lesson_materials where id in (
    '71080000-0000-4000-8000-000000000001','71080000-0000-4000-8000-000000000003'
  );
  insert into dars_private.email_outbox(event_key,kind,fixed_admin_recipient,payload)
    values('deletion-test-same-name-unrelated','teacher_fee_announcement',true,
      jsonb_build_object('student_name','Deletion Admin'));
  v_intent := public.account_deletion_create_intent('71000000-0000-4000-8000-000000000001',repeat('c',64),clock_timestamp()+interval '5 minutes');
  v_request := public.account_deletion_prepare('71000000-0000-4000-8000-000000000001',null,null,'password');
  if v_request->>'state'<>'queued'
     or exists(select 1 from public.profiles where id='71000000-0000-4000-8000-000000000001')
     or not exists(select 1 from public.groups where id='71040000-0000-4000-8000-000000000002')
     or not exists(select 1 from public.groups where id='71040000-0000-4000-8000-000000000001')
     or not exists(select 1 from public.lesson_attendance where student_id='71000000-0000-4000-8000-000000000005' and recorded_by is null)
     or exists(select 1 from public.teacher_profiles where id='71000000-0000-4000-8000-000000000001') then
    raise exception 'teacher deletion cascade, preserved foreign content, attendance, or cover FK behavior failed';
  end if;
  if not exists(select 1 from dars_private.email_outbox where event_key='deletion-test-same-name-unrelated') then
    raise exception 'same-name unrelated email was deleted';
  end if;
  if not exists(select 1 from dars_private.account_deletion_intents where id=(v_intent->>'intent_id')::uuid) then
    raise exception 'intent was cleared before successful queue completion';
  end if;
  select r.* into v_claim from public.account_deletion_claim(5,(v_request->>'request_id')::uuid) r;
  if v_claim.request_id is distinct from (v_request->>'request_id')::uuid or v_claim.lease_token is null then
    raise exception 'request-scoped claim did not lease the intended request';
  end if;
  select count(*) into v_file_count from public.account_deletion_files(v_claim.request_id,v_claim.lease_token);
  if v_file_count<5
     or not exists(select 1 from jsonb_array_elements(v_claim.manifest) f where f->>'name'='strange/unreferenced.bin')
     or not exists(select 1 from jsonb_array_elements(v_claim.manifest) f where f->>'name'='71000000-0000-4000-8000-000000000001/cover/71070000-0000-4000-8000-000000000001.jpg') then
    raise exception 'manifest omitted an unusual owned object, cover, or current storage file';
  end if;
  if exists(select 1 from jsonb_array_elements(v_claim.manifest) f
    where f->>'bucket_id'='teacher-avatars' and f->>'name'='shared/owned.pdf') then
    raise exception 'owned-group material manifest crossed bucket boundaries';
  end if;
  v_status := public.account_deletion_status('71000000-0000-4000-8000-000000000001');
  if v_status->>'state'<>'pending' or v_status->>'request_id'<>v_request->>'request_id' then
    raise exception 'prepared request is not visible after profile removal';
  end if;

  -- A writer attaching a deleted owner's key after enqueue is serialized and
  -- rejected; it cannot race the manifest snapshot.
  begin
    insert into public.lesson_materials(id,lesson_id,kind,title,storage_path,file_size,mime_type,uploaded_by)
    values('71080000-0000-4000-8000-000000000003','71050000-0000-4000-8000-000000000001','file','Late attach','71000000-0000-4000-8000-000000000001/late.pdf',123,'application/pdf','71000000-0000-4000-8000-000000000003');
    raise exception 'late material attach unexpectedly passed';
  exception when check_violation then
    if sqlerrm <> 'account_deletion_in_progress' then raise; end if;
  end;
  perform public.account_deletion_progress(v_claim.request_id,v_claim.lease_token,'completed',null);
  if exists(select 1 from dars_private.account_deletion_intents where user_id='71000000-0000-4000-8000-000000000001') then
    raise exception 'completed deletion retained private OAuth intent proofs';
  end if;

  -- Teacher-owned groups remove their lessons, materials, and enrollments but
  -- files and material rows in other teachers' groups remain intact.
  v_request := public.account_deletion_prepare('71000000-0000-4000-8000-000000000003',null,null,'password');
  if exists(select 1 from public.profiles where id='71000000-0000-4000-8000-000000000003')
     or exists(select 1 from public.groups where id='71040000-0000-4000-8000-000000000002')
     or exists(select 1 from public.enrollments where id='71060000-0000-4000-8000-000000000003')
     or exists(select 1 from public.lesson_materials where id='71080000-0000-4000-8000-000000000002')
     or not exists(select 1 from public.groups where id='71040000-0000-4000-8000-000000000001')
     or not exists(select 1 from public.lesson_materials where id='71080000-0000-4000-8000-000000000004') then
    raise exception 'teacher deletion failed to remove own content or preserve foreign content';
  end if;
  select r.* into v_claim from public.account_deletion_claim(5,(v_request->>'request_id')::uuid) r;
  if not exists(select 1 from jsonb_array_elements(v_claim.manifest) f
      where f->>'bucket_id'='lesson-materials' and f->>'name'='shared/owned.pdf')
     or exists(select 1 from jsonb_array_elements(v_claim.manifest) f
      where f->>'bucket_id'='teacher-avatars' and f->>'name'='shared/owned.pdf') then
    raise exception 'attached material manifest failed bucket-scoped selection';
  end if;
  select count(*) into v_file_count from public.account_deletion_files(v_claim.request_id,v_claim.lease_token);
  if v_file_count<>1 then raise exception 'file listing included a different-bucket name collision'; end if;

  -- The trigger protects both deleting the last administrator and the
  -- existing admin suspension/demotion route, before its side effects.
  perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
  begin
    update public.profiles set status='suspended' where id='71000000-0000-4000-8000-000000000002';
    raise exception 'last administrator suspension unexpectedly passed';
  exception when check_violation then
    if sqlerrm <> 'last_active_admin' then raise; end if;
  end;
  begin
    delete from public.profiles where id='71000000-0000-4000-8000-000000000002';
    raise exception 'last administrator deletion unexpectedly passed';
  exception when check_violation then
    if sqlerrm <> 'last_active_admin' then raise; end if;
  end;

  update dars_private.account_deletion_worker_config set key_hash=repeat('b',64) where singleton;
  if not public.account_deletion_worker_authorized(repeat('b',64))
     or public.account_deletion_worker_authorized(repeat('c',64)) then
    raise exception 'worker key hash authorization failed';
  end if;
end $$;

rollback;
