-- Local/Supabase DB regression tests. Everything runs inside one rollback transaction.
-- authenticated has no direct INSERT/UPDATE on public.groups or public.teacher_profiles;
-- the SECURITY DEFINER RPCs remain the only write paths.
create extension if not exists pgtap;
begin;
select plan(28);

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('99200000-0000-4000-8000-000000000001','authenticated','authenticated','direct-owner@example.test','','{}','{"requested_role":"teacher","full_name":"Direct owner fixture"}',now(),now()),
 ('99200000-0000-4000-8000-000000000002','authenticated','authenticated','direct-peer@example.test','','{}','{"requested_role":"teacher","full_name":"Direct peer fixture"}',now(),now()),
 ('99200000-0000-4000-8000-000000000003','authenticated','authenticated','direct-admin@example.test','','{}','{"requested_role":"student","full_name":"Direct admin fixture"}',now(),now());
set local session_replication_role=replica;
update public.profiles set role='admin' where id='99200000-0000-4000-8000-000000000003';
update public.teacher_profiles set approved=true where id in ('99200000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000002');
set local session_replication_role=origin;

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('99210000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000001','رياضيات','Direct math','99210000-0000-4000-8000-000000000001');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('99220000-0000-4000-8000-000000000001','student_category','الصف الأول','Direct grade','99220000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000001');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('99230000-0000-4000-8000-000000000001','99220000-0000-4000-8000-000000000001','99210000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000001');
-- Fixture groups are inserted as the table owner; teachers can no longer do this themselves.
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status) values
 ('99240000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000001','99230000-0000-4000-8000-000000000001','Direct draft','',5,'','draft'),
 ('99240000-0000-4000-8000-000000000002','99200000-0000-4000-8000-000000000001','99230000-0000-4000-8000-000000000001','Direct cancel','',5,'','draft'),
 ('99240000-0000-4000-8000-000000000003','99200000-0000-4000-8000-000000000001','99230000-0000-4000-8000-000000000001','Direct admin draft','',5,'','draft'),
 ('99240000-0000-4000-8000-000000000004','99200000-0000-4000-8000-000000000001','99230000-0000-4000-8000-000000000001','Direct archived','',5,'','draft');
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('99250000-0000-4000-8000-000000000001','99240000-0000-4000-8000-000000000001',1,'09:00','10:00'),
 ('99250000-0000-4000-8000-000000000002','99240000-0000-4000-8000-000000000002',2,'09:00','10:00'),
 ('99250000-0000-4000-8000-000000000003','99240000-0000-4000-8000-000000000003',3,'09:00','10:00');

-- Grants
select ok(not has_table_privilege('authenticated','public.groups','INSERT') and not has_table_privilege('authenticated','public.groups','UPDATE'),'authenticated has no table INSERT/UPDATE on groups');
select ok(not has_any_column_privilege('authenticated','public.groups','INSERT') and not has_any_column_privilege('authenticated','public.groups','UPDATE'),'authenticated has no column INSERT/UPDATE on groups');
select ok(not has_any_column_privilege('anon','public.groups','INSERT') and not has_any_column_privilege('anon','public.groups','UPDATE'),'anon has no INSERT/UPDATE on groups');
select ok(not has_any_column_privilege('authenticated','public.teacher_profiles','INSERT') and not has_any_column_privilege('authenticated','public.teacher_profiles','UPDATE'),'authenticated has no INSERT/UPDATE on teacher_profiles');
select ok(has_table_privilege('authenticated','public.groups','SELECT') and has_table_privilege('authenticated','public.teacher_profiles','SELECT'),'authenticated keeps read access');

-- The write RPCs that teachers and admins rely on are SECURITY DEFINER.
select is((select count(*)::integer from pg_proc where oid in (
  'public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamptz)'::regprocedure,
  'public.publish_group(uuid,date,date)'::regprocedure,
  'public.duplicate_group(uuid)'::regprocedure,
  'public.cancel_teacher_group(uuid)'::regprocedure,
  'public.delete_unused_teacher_group(uuid)'::regprocedure,
  'public.save_teacher_profile_account(text,text,uuid[],text,text,text,text)'::regprocedure,
  'public.admin_set_group_draft(uuid)'::regprocedure
) and prosecdef),7,'group and profile write RPCs are security definer');
select ok(has_function_privilege('authenticated','public.admin_set_group_draft(uuid)','EXECUTE') and not has_function_privilege('anon','public.admin_set_group_draft(uuid)','EXECUTE'),'admin_set_group_draft is executable by authenticated only');

-- Teacher: direct writes fail, RPCs work.
set local role authenticated;
select set_config('request.jwt.claim.sub','99200000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.groups set capacity=1 where id='99240000-0000-4000-8000-000000000001'$$,'42501',null,'teacher cannot directly update own group');
select throws_ok($$update public.groups set status='archived' where id='99240000-0000-4000-8000-000000000001'$$,'42501',null,'teacher cannot directly archive own group');
select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) values('99200000-0000-4000-8000-000000000001','99230000-0000-4000-8000-000000000001','Direct insert',5,'draft')$$,'42501',null,'teacher cannot directly insert a group');
select throws_ok($$update public.teacher_profiles set headline=repeat('x',5000) where id='99200000-0000-4000-8000-000000000001'$$,'42501',null,'teacher cannot directly set an over-long headline');
select throws_ok($$update public.teacher_profiles set bio='direct' where id='99200000-0000-4000-8000-000000000001'$$,'42501',null,'teacher cannot directly update bio');
select throws_ok($$update public.teacher_profiles set approved=false where id='99200000-0000-4000-8000-000000000001'$$,'42501',null,'teacher cannot directly update approval');
select lives_ok($$select public.save_teacher_group_draft(null,'99210000-0000-4000-8000-000000000001','99220000-0000-4000-8000-000000000001','RPC created draft','',6,'Room',null)$$,'save_teacher_group_draft still creates a draft');
select is((select capacity from public.groups where teacher_id='99200000-0000-4000-8000-000000000001' and name='RPC created draft'),6,'RPC-created draft was stored');
select lives_ok($$select public.save_teacher_group_draft('99240000-0000-4000-8000-000000000001','99210000-0000-4000-8000-000000000001','99220000-0000-4000-8000-000000000001','Direct draft renamed','',7,'',(select updated_at from public.groups where id='99240000-0000-4000-8000-000000000001'))$$,'save_teacher_group_draft still edits a draft');
select lives_ok($$select public.publish_group('99240000-0000-4000-8000-000000000001',null,null)$$,'publish_group still publishes');
select is((select status::text from public.groups where id='99240000-0000-4000-8000-000000000001'),'published','group is published');
select lives_ok($$select public.cancel_teacher_group('99240000-0000-4000-8000-000000000002')$$,'cancel_teacher_group still archives');
select lives_ok($$select public.save_teacher_profile_account('Direct owner','Short headline',array['99230000-0000-4000-8000-000000000001']::uuid[],'','','','enrolled')$$,'save_teacher_profile_account still saves');
select is((select headline from public.teacher_profiles where id='99200000-0000-4000-8000-000000000001'),'Short headline','RPC stored the headline');
select throws_ok($$select public.save_teacher_profile_account('Direct owner',repeat('x',161),array['99230000-0000-4000-8000-000000000001']::uuid[],'','','','enrolled')$$,'P0001',null,'profile RPC still rejects an over-long headline');

-- The admin group status control goes through RPCs only.
select throws_ok($$select public.admin_set_group_draft('99240000-0000-4000-8000-000000000001')$$,'42501',null,'a teacher cannot use the admin draft RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','99200000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.publish_group('99240000-0000-4000-8000-000000000003',null,null)$$,'admin publishes through publish_group');
select lives_ok($$select public.admin_set_group_draft('99240000-0000-4000-8000-000000000003')$$,'admin returns a published group to draft');
select throws_ok($$select public.admin_set_group_draft('99240000-0000-4000-8000-000000000002')$$,'P0001',null,'admin cannot un-archive a group through the draft RPC');
reset role;

-- Database-level headline limit (the table owner bypasses grants, not constraints).
select throws_ok($$update public.teacher_profiles set headline=repeat('x',161) where id='99200000-0000-4000-8000-000000000002'$$,'23514',null,'headline over 160 characters violates the table check');
select lives_ok($$update public.teacher_profiles set headline=repeat('x',160) where id='99200000-0000-4000-8000-000000000002'$$,'headline of exactly 160 characters is accepted');

select * from finish();
rollback;
