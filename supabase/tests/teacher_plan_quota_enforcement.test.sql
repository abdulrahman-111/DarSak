-- Local/Supabase DB regression tests. Everything runs inside one rollback transaction.
-- Policy time is set to now only inside this test transaction so the trigger paths
-- can be exercised without changing the persisted future activation policy.
create extension if not exists pgtap;
begin;
select plan(30);

select ok(not dars_private.plan_quota_active(), 'policy starts off');
select is((select effective_at from dars_private.teacher_quota_policy where singleton), '2026-11-14 22:00:00+00'::timestamptz, 'policy earliest date is Cairo midnight 15 November');

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('99100000-0000-4000-8000-000000000001','authenticated','authenticated','plan-standard@example.test','','{}','{"requested_role":"teacher","full_name":"Plan standard fixture"}',now(),now()),
 ('99100000-0000-4000-8000-000000000002','authenticated','authenticated','plan-pro@example.test','','{}','{"requested_role":"teacher","full_name":"Plan pro fixture"}',now(),now()),
 ('99100000-0000-4000-8000-000000000003','authenticated','authenticated','plan-free@example.test','','{}','{"requested_role":"teacher","full_name":"Plan free fixture"}',now(),now()),
 ('99100000-0000-4000-8000-000000000004','authenticated','authenticated','plan-student@example.test','','{}','{"requested_role":"student","full_name":"Plan student fixture"}',now(),now()),
 ('99100000-0000-4000-8000-000000000005','authenticated','authenticated','plan-admin@example.test','','{}','{"requested_role":"student","full_name":"Plan admin fixture"}',now(),now());

set local role service_role;
update public.profiles set role='admin' where id='99100000-0000-4000-8000-000000000005';
reset role;
update dars_private.teacher_quota_policy set quotas_enabled=true,effective_at=statement_timestamp()-interval '1 second' where singleton;
insert into dars_private.teacher_plan_entitlements(teacher_id,plan_code,starts_at,expires_at,updated_version) values
 ('99100000-0000-4000-8000-000000000001','standard',statement_timestamp()-interval '1 day',statement_timestamp()+interval '1 month',1),
 ('99100000-0000-4000-8000-000000000002','pro',statement_timestamp()-interval '1 day',statement_timestamp()+interval '1 month',1);

select ok(dars_private.plan_quota_active(), 'enabled policy is effective');
select is((select count(*)::integer from public.groups where teacher_id='99100000-0000-4000-8000-000000000001' and status in ('draft','published')),0,'standard fixture starts with no groups');
insert into public.groups(teacher_id,offering_id,name,capacity,status)
 select '99100000-0000-4000-8000-000000000001',id,'standard group '||n,10,'draft' from public.offerings cross join generate_series(1,5) n where owner_teacher_id is null limit 5;
select is((select count(*)::integer from public.groups where teacher_id='99100000-0000-4000-8000-000000000001' and status in ('draft','published')),5,'standard permits five active groups');
select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) select '99100000-0000-4000-8000-000000000001',id,'blocked standard group',10,'draft' from public.offerings where owner_teacher_id is null limit 1$$,'23514',null,'standard blocks sixth active group');
update public.groups set status='archived' where teacher_id='99100000-0000-4000-8000-000000000001' and status='draft' and id=(select id from public.groups where teacher_id='99100000-0000-4000-8000-000000000001' order by id limit 1);
select lives_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) select '99100000-0000-4000-8000-000000000001',id,'replacement standard group',10,'draft' from public.offerings where owner_teacher_id is null limit 1$$,'archiving frees a group slot');

insert into public.groups(teacher_id,offering_id,name,capacity,status)
 select '99100000-0000-4000-8000-000000000002',id,'pro group '||n,10,'draft' from public.offerings cross join generate_series(1,20) n where owner_teacher_id is null limit 20;
select is((select count(*)::integer from public.groups where teacher_id='99100000-0000-4000-8000-000000000002' and status in ('draft','published')),20,'pro permits twenty active groups');
select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) select '99100000-0000-4000-8000-000000000002',id,'blocked pro group',10,'draft' from public.offerings where owner_teacher_id is null limit 1$$,'23514',null,'pro blocks twenty first active group');
update dars_private.teacher_plan_entitlements set plan_code='standard',updated_version=updated_version+1 where teacher_id='99100000-0000-4000-8000-000000000002';
select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) select '99100000-0000-4000-8000-000000000002',id,'blocked after downgrade',10,'draft' from public.offerings where owner_teacher_id is null limit 1$$,'23514',null,'downgrade blocks increases without deleting existing groups');
select is((select count(*)::integer from public.groups where teacher_id='99100000-0000-4000-8000-000000000002'),20,'downgrade retains existing groups');
update public.groups set status='archived' where teacher_id='99100000-0000-4000-8000-000000000002' and id=(select id from public.groups where teacher_id='99100000-0000-4000-8000-000000000002' order by id limit 1);

select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) select '99100000-0000-4000-8000-000000000003',id,'blocked free group',10,'draft' from public.offerings where owner_teacher_id is null limit 1$$,'23514',null,'free teacher cannot increase groups after activation');
update dars_private.teacher_plan_entitlements set expires_at=statement_timestamp()-interval '1 second' where teacher_id='99100000-0000-4000-8000-000000000001';
update public.groups set status='archived' where teacher_id='99100000-0000-4000-8000-000000000001' and status<>'archived';
select throws_ok($$insert into public.groups(teacher_id,offering_id,name,capacity,status) select '99100000-0000-4000-8000-000000000001',id,'blocked expired group',10,'draft' from public.offerings where owner_teacher_id is null limit 1$$,'23514',null,'expired plan permits no increases');

-- Raw storage objects have no lesson_materials rows: quotas must count the objects themselves.
update dars_private.teacher_plan_entitlements set plan_code='standard',starts_at=statement_timestamp()-interval '1 day',expires_at=statement_timestamp()+interval '1 month' where teacher_id='99100000-0000-4000-8000-000000000001';
insert into storage.objects(bucket_id,name,metadata)
 select 'lesson-materials','99100000-0000-4000-8000-000000000001/99100000-0000-4000-8000-000000000099/file-'||n||'.pdf',jsonb_build_object('size',1048576) from generate_series(1,100) n;
select is((select count(*)::integer from storage.objects where bucket_id='lesson-materials' and split_part(name,'/',1)='99100000-0000-4000-8000-000000000001'),100,'standard counts all raw stored objects');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('lesson-materials','99100000-0000-4000-8000-000000000001/99100000-0000-4000-8000-000000000099/file-over.pdf',jsonb_build_object('size',1048576))$$,'23514',null,'standard blocks object 101');
insert into storage.objects(bucket_id,name,metadata)
 select 'lesson-materials','99100000-0000-4000-8000-000000000002/99100000-0000-4000-8000-000000000099/bytes-'||n||'.pdf',jsonb_build_object('size',3145728) from generate_series(1,83) n;
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('lesson-materials','99100000-0000-4000-8000-000000000002/99100000-0000-4000-8000-000000000099/bytes-over.pdf',jsonb_build_object('size',3145728))$$,'23514',null,'standard blocks storage above 250 MiB');
select throws_ok($$update storage.objects set metadata=jsonb_build_object('size',5242880) where bucket_id='lesson-materials' and name='99100000-0000-4000-8000-000000000002/99100000-0000-4000-8000-000000000099/bytes-1.pdf'$$,'23514',null,'upsert-like size increase cannot bypass byte quota');

select set_config('request.jwt.claim.sub','99100000-0000-4000-8000-000000000002',true);
select is((select plan_code from public.teacher_plan_status()),'standard','teacher RPC reports current plan');
select is((select stored_files::integer from public.teacher_plan_status()),83,'teacher RPC reports raw storage objects');
select is((select limits->>'bytes' from public.teacher_plan_status()),'262144000','teacher RPC reports standard byte limit');
select set_config('request.jwt.claim.sub','99100000-0000-4000-8000-000000000004',true);
select throws_ok($$select * from public.teacher_plan_status()$$,'P0001',null,'student cannot read teacher plan status');
select set_config('request.jwt.claim.sub','99100000-0000-4000-8000-000000000005',true);
select is((select plan_code from public.admin_teacher_plan_status('99100000-0000-4000-8000-000000000002')),'standard','admin can read teacher plan status');
select throws_ok($$select * from public.admin_assign_teacher_plan('99100000-0000-4000-8000-000000000002','standard',null,'test-null-version')$$,'22023',null,'admin assignment rejects null expected version');
select is((select already_recorded from public.admin_assign_teacher_plan('99100000-0000-4000-8000-000000000002','standard',2,'test-transfer-99100002')),'false'::boolean,'admin records a verified plan assignment');
select is((select already_recorded from public.admin_assign_teacher_plan('99100000-0000-4000-8000-000000000002','standard',0,'test-transfer-99100002')),'true'::boolean,'duplicate reference is idempotent despite stale version');
select is((select count(*)::integer from dars_private.teacher_plan_assignments where transaction_reference='test-transfer-99100002'),1,'duplicate reference creates one audit row');
select throws_ok($$select * from public.admin_assign_teacher_plan('99100000-0000-4000-8000-000000000002','standard',2,'test-stale-version')$$,'40001',null,'stale expected version conflicts');
select throws_ok($$select * from public.admin_assign_teacher_plan('99100000-0000-4000-8000-000000000001','standard',0,'test-transfer-99100002')$$,'23505',null,'reference cannot be reused for another teacher');
select throws_ok($$select * from public.admin_assign_teacher_plan('99100000-0000-4000-8000-000000000002','pro',3,'test-switch')$$,'55000',null,'plan switch waits for current period expiry');
select is((select approved from public.teacher_profiles where id='99100000-0000-4000-8000-000000000002'),false,'plan assignment never approves the teacher');
select * from finish();
rollback;
