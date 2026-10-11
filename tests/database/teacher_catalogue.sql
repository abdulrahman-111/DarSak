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
