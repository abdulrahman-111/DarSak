\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='subjects' and column_name='owner_teacher_id') then
    raise exception 'teacher catalogue owner columns are not installed';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='updated_at') then
    raise exception 'groups.updated_at is not installed';
  end if;
  if to_regprocedure('public.public_discovery_catalogue()') is null then
    raise exception 'public_discovery_catalogue() is not installed';
  end if;
  if to_regprocedure('public.save_teacher_subject(uuid,text,text)') is null
     or to_regprocedure('public.save_teacher_category(uuid,text,text,text)') is null
     or to_regprocedure('public.set_teacher_catalogue_archived(text,uuid,boolean)') is null
     or to_regprocedure('public.save_teacher_offering(uuid,uuid)') is null
     or to_regprocedure('public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamptz)') is null then
    raise exception 'teacher catalogue write RPCs are not installed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7a000000-0000-4000-8000-000000000001','authenticated','authenticated','catalogue-owner-a@test.invalid','{"full_name":"Catalogue A","requested_role":"teacher"}'),
 ('7a000000-0000-4000-8000-000000000002','authenticated','authenticated','catalogue-owner-b@test.invalid','{"full_name":"Catalogue B","requested_role":"teacher"}'),
 ('7a000000-0000-4000-8000-000000000003','authenticated','authenticated','catalogue-member@test.invalid','{"full_name":"Catalogue member","requested_role":"student"}');
set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id in ('7a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000002');
set local session_replication_role = origin;

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('7a100000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001','مادة خاصة','Private subject','7a100000-0000-4000-8000-000000000001'),
 ('7a100000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000002','مادة خاصة','Private subject','7a100000-0000-4000-8000-000000000002'),
 ('7a100000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001','مسودة','Draft only','7a100000-0000-4000-8000-000000000003');
insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('7a200000-0000-4000-8000-000000000001',null,'student_category','فئة خاصة','Private category','7a200000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001'),
 ('7a200000-0000-4000-8000-000000000002',null,'student_category','فئة خاصة','Private category','7a200000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000002'),
 ('7a200000-0000-4000-8000-000000000003',null,'custom_year','عام خاص','Private year','7a200000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug)
    values('7a200000-0000-4000-8000-000000000004',null,'student_category','فئة عامة','Shared category','7a200000-0000-4000-8000-000000000004');
    raise exception 'shared catalogue accepted a teacher-only category kind';
  exception when check_violation then null;
  end;
end $$;
do $$
begin
  insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug)
  values('7a100000-0000-4000-8000-000000000010','7a000000-0000-4000-8000-000000000001','  Trimmed subject  ','','7a100000-0000-4000-8000-000000000010');
  if (select name_ar from public.subjects where id='7a100000-0000-4000-8000-000000000010')<>'Trimmed subject'
     or (select name_en from public.subjects where id='7a100000-0000-4000-8000-000000000010')<>'' then
    raise exception 'owned subject labels were not trimmed with the optional blank preserved';
  end if;
  insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id)
  values('7a200000-0000-4000-8000-000000000010',null,'student_category','','  Trimmed category  ','7a200000-0000-4000-8000-000000000010','7a000000-0000-4000-8000-000000000001');
  if (select name_en from public.education_nodes where id='7a200000-0000-4000-8000-000000000010')<>'Trimmed category'
     or (select name_ar from public.education_nodes where id='7a200000-0000-4000-8000-000000000010')<>'' then
    raise exception 'owned category labels were not trimmed with the optional blank preserved';
  end if;
  insert into public.subjects(id,name_ar,name_en,slug)
  values('7a100000-0000-4000-8000-000000000011','  Shared subject  ','','shared-trim-test');
  if (select name_ar from public.subjects where id='7a100000-0000-4000-8000-000000000011')<>'  Shared subject  ' then
    raise exception 'shared subject labels changed';
  end if;
  begin
    insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug)
    values('7a100000-0000-4000-8000-000000000012','7a000000-0000-4000-8000-000000000001',repeat('x',121),'','7a100000-0000-4000-8000-000000000012');
    raise exception 'owned subject accepted a label over 120 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug)
    values('7a100000-0000-4000-8000-000000000013','7a000000-0000-4000-8000-000000000001',E'\t\n',E'\r ','7a100000-0000-4000-8000-000000000013');
    raise exception 'owned subject accepted whitespace-only labels';
  exception when check_violation then null;
  end;
  begin
    insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id)
    values('7a200000-0000-4000-8000-000000000012',null,'student_category',repeat('x',121),'','7a200000-0000-4000-8000-000000000012','7a000000-0000-4000-8000-000000000001');
    raise exception 'owned category accepted a label over 120 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id)
    values('7a200000-0000-4000-8000-000000000013',null,'student_category',E'\t\n',E'\r ','7a200000-0000-4000-8000-000000000013','7a000000-0000-4000-8000-000000000001');
    raise exception 'owned category accepted whitespace-only labels';
  exception when check_violation then null;
  end;
  update public.subjects set name_ar='  Updated subject  ',name_en='' where id='7a100000-0000-4000-8000-000000000010';
  update public.education_nodes set name_ar=E'\t',name_en='  Updated category  ' where id='7a200000-0000-4000-8000-000000000010';
  if (select name_ar from public.subjects where id='7a100000-0000-4000-8000-000000000010')<>'Updated subject'
     or (select name_en from public.subjects where id='7a100000-0000-4000-8000-000000000010')<>''
     or (select name_ar from public.education_nodes where id='7a200000-0000-4000-8000-000000000010')<>''
     or (select name_en from public.education_nodes where id='7a200000-0000-4000-8000-000000000010')<>'Updated category' then
    raise exception 'owned label update normalization failed';
  end if;
  begin
    update public.subjects set name_ar=repeat('x',121) where id='7a100000-0000-4000-8000-000000000010';
    raise exception 'owned subject update accepted a label over 120 characters';
  exception when check_violation then null;
  end;
  begin
    update public.subjects set name_ar=E'\t\n',name_en=E'\r ' where id='7a100000-0000-4000-8000-000000000010';
    raise exception 'owned subject update accepted whitespace-only labels';
  exception when check_violation then null;
  end;
  begin
    update public.education_nodes set name_en=repeat('x',121) where id='7a200000-0000-4000-8000-000000000010';
    raise exception 'owned category update accepted a label over 120 characters';
  exception when check_violation then null;
  end;
  begin
    update public.education_nodes set name_ar=E'\t\n',name_en=E'\r ' where id='7a200000-0000-4000-8000-000000000010';
    raise exception 'owned category update accepted whitespace-only labels';
  exception when check_violation then null;
  end;
end $$;
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('7a300000-0000-4000-8000-000000000001','7a200000-0000-4000-8000-000000000001','7a100000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001'),
 ('7a300000-0000-4000-8000-000000000002','7a200000-0000-4000-8000-000000000002','7a100000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000002'),
 ('7a300000-0000-4000-8000-000000000003','7a200000-0000-4000-8000-000000000003','7a100000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000001');
do $$
declare v_node uuid; v_subject uuid;
begin
  begin
    insert into public.offerings(id,node_id,subject_id,owner_teacher_id)
    values('7a300000-0000-4000-8000-000000000004','7a200000-0000-4000-8000-000000000001','7a100000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001');
    raise exception 'duplicate owner offering pair succeeded';
  exception when unique_violation then null;
  end;
  select node_id,subject_id into v_node,v_subject from public.offerings where owner_teacher_id is null limit 1;
  if v_node is null then raise exception 'shared catalogue fixture is missing'; end if;
  begin
    insert into public.offerings(id,node_id,subject_id) values('7a300000-0000-4000-8000-000000000005',v_node,v_subject);
    raise exception 'duplicate shared offering pair succeeded';
  exception when unique_violation then null;
  end;
end $$;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status,updated_at) values
 ('7a400000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000001','Published private pair',5,'draft','2100-01-01T00:00:00Z'),
 ('7a400000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000003','Draft private pair',5,'draft','2100-01-01T00:00:00Z'),
 ('7a400000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000002','7a300000-0000-4000-8000-000000000002','Owner B group',5,'draft','2100-01-01T00:00:00Z');
do $$
begin
  if exists(select 1 from public.groups where id in ('7a400000-0000-4000-8000-000000000001','7a400000-0000-4000-8000-000000000002','7a400000-0000-4000-8000-000000000003') and updated_at='2100-01-01T00:00:00Z'::timestamptz) then
    raise exception 'raw group insert forged updated_at';
  end if;
end $$;
set local session_replication_role = replica;
update public.groups set status='published' where id='7a400000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
insert into public.teacher_specializations(teacher_id,offering_id) values
 ('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000001'),
 ('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000003'),
 ('7a000000-0000-4000-8000-000000000002','7a300000-0000-4000-8000-000000000002');
insert into public.enrollments(group_id,student_id,status) values ('7a400000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000003','accepted');

do $$
begin
  if (select count(*) from pg_indexes where schemaname='public' and tablename='offerings' and indexdef ilike '%owner_teacher_id%' and indexdef ilike '%WHERE (owner_teacher_id IS NULL)%')<>1 then
    raise exception 'shared pair partial unique index is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.groups'::regclass and tgname='groups_updated_at_touch') then
    raise exception 'groups server timestamp trigger is missing';
  end if;
end $$;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000000';
set local role anon;
do $$
begin
  if exists(select 1 from public.subjects where id in ('7a100000-0000-4000-8000-000000000002','7a100000-0000-4000-8000-000000000003')) then
    raise exception 'anonymous catalogue read leaked a foreign or draft-only custom subject';
  end if;
  if not exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000001') then raise exception 'eligible published custom subject is not readable'; end if;
  if (select count(*) from public.public_teacher_specializations('7a000000-0000-4000-8000-000000000001'))<>1 then
    raise exception 'public specializations must include only the exact published custom pair';
  end if;
  if (select jsonb_array_length(public.public_discovery_catalogue()->'subjects'))<1 then
    raise exception 'discovery catalogue projection is empty';
  end if;
  if exists(select 1 from jsonb_array_elements(public.public_discovery_catalogue()->'subjects') x where x->>'id'='7a100000-0000-4000-8000-000000000003') then
    raise exception 'discovery projection leaked a draft-only subject';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000001';
do $$
begin
  if not exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000003') then raise exception 'owner cannot read a private draft label'; end if;
  if exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000002') then raise exception 'owner can read another teacher private label'; end if;
  update public.groups set name='Server timestamp check',updated_at='2100-01-01T00:00:00Z' where id='7a400000-0000-4000-8000-000000000002';
  if (select updated_at from public.groups where id='7a400000-0000-4000-8000-000000000002')='2100-01-01T00:00:00Z'::timestamptz then raise exception 'raw group update forged updated_at'; end if;
  begin
    insert into public.groups(teacher_id,offering_id,name,capacity)
    values('7a000000-0000-4000-8000-000000000001','7a300000-0000-4000-8000-000000000002','Foreign pair',5);
    raise exception 'teacher selected a foreign owned offering';
  exception when others then
    if sqlerrm='teacher selected a foreign owned offering' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000002';
do $$
begin
  if not exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000001') then raise exception 'published custom subject is not readable'; end if;
  if exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000003') then raise exception 'foreign draft label is readable'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000003';
do $$
declare v_shared_offering uuid;
begin
  if not exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000001') then raise exception 'accepted member cannot read the referenced custom subject'; end if;
  select id into v_shared_offering from public.offerings where owner_teacher_id is null limit 1;
  update public.student_profiles set offering_id=v_shared_offering where id='7a000000-0000-4000-8000-000000000003';
  if not exists(select 1 from public.student_profiles where id='7a000000-0000-4000-8000-000000000003' and offering_id=v_shared_offering) then raise exception 'student cannot select an active shared offering'; end if;
  begin
    update public.student_profiles set offering_id='7a300000-0000-4000-8000-000000000001' where id='7a000000-0000-4000-8000-000000000003';
    raise exception 'student selected an owned offering';
  exception when others then
    if sqlerrm='student selected an owned offering' then raise; end if;
  end;
end $$;
reset role;

insert into public.subjects(id,name_ar,name_en,slug) values
 ('7a100000-0000-4000-8000-000000000020','موضوع مشترك مؤقت','Task 2b shared subject','task-2b-shared-subject'),
 ('7a100000-0000-4000-8000-000000000021','موضوع مشترك للمجموعة','Task 2b group subject','task-2b-group-subject');
set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000001';
do $$
declare
  v_subject uuid;
  v_second_subject uuid;
  v_category uuid;
  v_offering uuid;
  v_group uuid;
  v_reuse_group uuid;
  v_shared_group uuid;
  v_shared_node uuid;
  v_shared_pair uuid;
  v_shared_pair_again uuid;
  v_shared_group_pair uuid;
  v_saved_group uuid;
  v_updated_at timestamptz;
begin
  select node_id into v_shared_node from public.offerings where owner_teacher_id is null order by id limit 1;
  if v_shared_node is null then raise exception 'shared category fixture is missing'; end if;
  v_shared_pair:=public.save_teacher_offering('7a100000-0000-4000-8000-000000000020',v_shared_node);
  v_shared_pair_again:=public.save_teacher_offering('7a100000-0000-4000-8000-000000000020',v_shared_node);
  if v_shared_pair is distinct from v_shared_pair_again
     or (select owner_teacher_id from public.offerings where id=v_shared_pair)<>'7a000000-0000-4000-8000-000000000001'
     or exists(select 1 from public.offerings where owner_teacher_id is null and subject_id='7a100000-0000-4000-8000-000000000020') then
    raise exception 'explicit pair creation did not reuse a private teacher-owned fallback';
  end if;
  v_reuse_group:=public.save_teacher_group_draft(null,'7a100000-0000-4000-8000-000000000020',v_shared_node,'Reuse private fallback','',5,'',null);
  if (select offering_id from public.groups where id=v_reuse_group) is distinct from v_shared_pair then
    raise exception 'draft did not reuse the existing teacher-owned fallback pair';
  end if;
  v_shared_group:=public.save_teacher_group_draft(null,'7a100000-0000-4000-8000-000000000021',v_shared_node,'Shared components draft','',5,'',null);
  select o.id into v_shared_group_pair from public.groups g join public.offerings o on o.id=g.offering_id where g.id=v_shared_group;
  if (select owner_teacher_id from public.offerings where id=v_shared_group_pair)<>'7a000000-0000-4000-8000-000000000001'
     or exists(select 1 from public.offerings where owner_teacher_id is null and subject_id='7a100000-0000-4000-8000-000000000021') then
    raise exception 'draft pair creation exposed a missing shared/shared pair';
  end if;

  v_subject:=public.save_teacher_subject(null,'  مادة خاصة جديدة  ','');
  v_category:=public.save_teacher_category(null,'student_category','','  New private category  ');
  if (select name_ar from public.subjects where id=v_subject)<>'مادة خاصة جديدة'
     or (select name_en from public.subjects where id=v_subject)<>''
     or (select name_en from public.education_nodes where id=v_category)<>'New private category' then
    raise exception 'RPC catalogue labels were not normalized or localized';
  end if;
  v_offering:=public.save_teacher_offering(v_subject,v_category);
  v_group:=public.save_teacher_group_draft(null,v_subject,v_category,'Atomic draft','Description',12,'Cairo',null);
  select updated_at into v_updated_at from public.groups where id=v_group;
  v_saved_group:=public.save_teacher_group_draft(v_group,v_subject,v_category,'Atomic draft updated','Description updated',13,'Giza',v_updated_at);
  if v_saved_group<>v_group or not exists(select 1 from public.groups where id=v_group and capacity=13 and location='Giza') then
    raise exception 'atomic draft did not save the selected offering and fields';
  end if;

  v_second_subject:=public.save_teacher_subject(null,'Stale subject','');
  select updated_at into v_updated_at from public.groups where id=v_group;
  begin
    perform public.save_teacher_group_draft(v_group,v_second_subject,v_category,'Stale attempt','',20,'',v_updated_at-interval '1 second');
    raise exception 'stale draft save unexpectedly succeeded';
  exception when sqlstate '40001' then null;
  end;
  if exists(select 1 from public.offerings where owner_teacher_id='7a000000-0000-4000-8000-000000000001' and subject_id=v_second_subject)
     or not exists(select 1 from public.groups where id=v_group and name='Atomic draft updated' and capacity=13) then
    raise exception 'stale draft changed the saved row or left a dangling pair';
  end if;

  perform public.save_teacher_profile_account('Catalogue Owner','Profile',array[v_offering],'+201234567890','','owner@example.test','enrolled');
  perform public.set_teacher_catalogue_archived('offering',v_offering,true);
  if public.save_teacher_group_draft(v_group,v_subject,v_category,'Retained archived draft','',13,'Giza',
      (select updated_at from public.groups where id=v_group))<>v_group then
    raise exception 'unchanged archived group selection could not be retained';
  end if;
  perform public.save_teacher_profile_account('Catalogue Owner','Profile',array[v_offering],'+201234567890','','owner@example.test','enrolled');
  if not exists(select 1 from public.teacher_specializations where teacher_id='7a000000-0000-4000-8000-000000000001' and offering_id=v_offering) then
    raise exception 'unchanged archived profile selection was deleted';
  end if;
  begin
    perform public.duplicate_group(v_group);
    raise exception 'duplicate accepted an archived pair';
  exception when others then
    if sqlerrm='duplicate accepted an archived pair' then raise; end if;
    if sqlerrm not ilike '%update the original catalogue selection%' then raise; end if;
  end;
  perform public.set_teacher_catalogue_archived('offering',v_offering,false);
  perform public.set_teacher_catalogue_archived('subject',v_subject,true);
  perform public.set_teacher_catalogue_archived('subject',v_subject,false);
end $$;
reset role;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000000';
set local role anon;
do $$
begin
  if exists(select 1 from public.offerings where subject_id in ('7a100000-0000-4000-8000-000000000020','7a100000-0000-4000-8000-000000000021')) then
    raise exception 'anonymous reader can see an unreferenced or draft-only private fallback pair';
  end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000001';
do $$
declare v_group uuid;
begin
  select id into v_group from public.groups where teacher_id='7a000000-0000-4000-8000-000000000001' and name='Shared components draft';
  perform public.save_schedule_slot(v_group,4,'14:00','15:00',null);
  perform public.publish_group(v_group,null,null);
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000000';
set local role anon;
do $$
begin
  if not exists(select 1 from public.offerings where subject_id='7a100000-0000-4000-8000-000000000021') then
    raise exception 'eligible publication did not expose the private fallback pair';
  end if;
end $$;
reset role;

set local session_replication_role = replica;
update public.groups set status='archived' where id='7a400000-0000-4000-8000-000000000001';
update public.profiles set status='suspended' where id='7a000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000003';
do $$
begin
  if not exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000001') then raise exception 'accepted history was lost after teacher suspension and group archival'; end if;
end $$;
reset role;
set local session_replication_role = replica;
update public.profiles set status='suspended' where id='7a000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000003';
do $$
begin
  if exists(select 1 from public.subjects where id='7a100000-0000-4000-8000-000000000001') then raise exception 'suspended student retained historical catalogue access'; end if;
end $$;
reset role;

set local role service_role;
set local request.jwt.claim.sub='7a000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    update public.subjects set owner_teacher_id='7a000000-0000-4000-8000-000000000002' where id='7a100000-0000-4000-8000-000000000001';
    raise exception 'owned subject ownership reassignment succeeded';
  exception when others then
    if sqlerrm='owned subject ownership reassignment succeeded' then raise; end if;
  end;
  begin
    update public.education_nodes set kind='year' where id='7a200000-0000-4000-8000-000000000001';
    raise exception 'owned category kind change succeeded';
  exception when others then
    if sqlerrm='owned category kind change succeeded' then raise; end if;
  end;
  begin
    update public.offerings set subject_id='7a100000-0000-4000-8000-000000000002' where id='7a300000-0000-4000-8000-000000000001';
    raise exception 'owned offering component change succeeded';
  exception when others then
    if sqlerrm='owned offering component change succeeded' then raise; end if;
  end;
  begin
    delete from public.subjects where id='7a100000-0000-4000-8000-000000000001';
    raise exception 'owned subject physical delete succeeded';
  exception when others then
    if sqlerrm='owned subject physical delete succeeded' then raise; end if;
  end;
end $$;
reset role;

delete from auth.users where id='7a000000-0000-4000-8000-000000000002';
do $$
begin
  if exists(select 1 from public.subjects where owner_teacher_id='7a000000-0000-4000-8000-000000000002')
     or exists(select 1 from public.education_nodes where owner_teacher_id='7a000000-0000-4000-8000-000000000002')
     or exists(select 1 from public.offerings where owner_teacher_id='7a000000-0000-4000-8000-000000000002')
     or exists(select 1 from public.groups where teacher_id='7a000000-0000-4000-8000-000000000002')
     or exists(select 1 from public.teacher_specializations where teacher_id='7a000000-0000-4000-8000-000000000002') then
    raise exception 'account deletion did not cascade owned catalogue and group records';
  end if;
end $$;

rollback;
select 'teacher catalogue assertions passed' as result;
