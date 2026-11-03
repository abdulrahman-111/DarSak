-- The teacher catalogue choices RPC keeps the setup flow's complete catalogue
-- in one narrow invoker read while preserving the existing row policies.
create extension if not exists pgtap;
begin;
select plan(23);

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('99500000-0000-4000-8000-000000000001','authenticated','authenticated','choices-pending@example.test','','{}','{"requested_role":"teacher","full_name":"Pending choices teacher"}',now(),now()),
 ('99500000-0000-4000-8000-000000000002','authenticated','authenticated','choices-published@example.test','','{}','{"requested_role":"teacher","full_name":"Published choices teacher"}',now(),now()),
 ('99500000-0000-4000-8000-000000000003','authenticated','authenticated','choices-student@example.test','','{}','{"requested_role":"student","full_name":"Choices student"}',now(),now()),
 ('99500000-0000-4000-8000-000000000004','authenticated','authenticated','choices-admin@example.test','','{}','{"requested_role":"student","full_name":"Choices admin"}',now(),now()),
 ('99500000-0000-4000-8000-000000000005','authenticated','authenticated','choices-suspended@example.test','','{}','{"requested_role":"teacher","full_name":"Choices suspended teacher"}',now(),now()),
 ('99500000-0000-4000-8000-000000000006','authenticated','authenticated','choices-no-detail@example.test','','{}','{"requested_role":"teacher","full_name":"Choices teacher without detail"}',now(),now());
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='99500000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='99500000-0000-4000-8000-000000000004';
update public.profiles set status='suspended' where id='99500000-0000-4000-8000-000000000005';
delete from public.teacher_profiles where id='99500000-0000-4000-8000-000000000006';
set local session_replication_role=origin;
-- Prove this read does not depend on approval or teaching access.
update dars_private.teacher_access_state set starts_at=now()-interval '2 months',expires_at=now()-interval '1 month'
where teacher_id='99500000-0000-4000-8000-000000000001';

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('99510000-0000-4000-8000-000000000001','99500000-0000-4000-8000-000000000002','أجنبي منشور','Foreign published','99510000-0000-4000-8000-000000000001');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('99520000-0000-4000-8000-000000000001','student_category','فئة أجنبية','Foreign category','99520000-0000-4000-8000-000000000001','99500000-0000-4000-8000-000000000002');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('99530000-0000-4000-8000-000000000001','99520000-0000-4000-8000-000000000001','99510000-0000-4000-8000-000000000001','99500000-0000-4000-8000-000000000002');
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status) values
 ('99540000-0000-4000-8000-000000000001','99500000-0000-4000-8000-000000000002','99530000-0000-4000-8000-000000000001','Published foreign fixture',5,'published');
set local session_replication_role=origin;

insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug) values
 ('99550000-0000-4000-8000-000000000001',null,'system','مرحلة مؤرشفة','Archived stage','choices-archived-stage'),
 ('99550000-0000-4000-8000-000000000002','99550000-0000-4000-8000-000000000001','level','مستوى','Level','choices-level'),
 ('99550000-0000-4000-8000-000000000003','99550000-0000-4000-8000-000000000002','grade','صف نشط','Active grade','choices-active-grade');
insert into public.subjects(id,name_ar,name_en,slug) values
 ('99560000-0000-4000-8000-000000000001','مادة مشتركة','Shared choices subject','choices-shared-subject');
insert into public.offerings(id,node_id,subject_id) values
 ('99570000-0000-4000-8000-000000000001','99550000-0000-4000-8000-000000000003','99560000-0000-4000-8000-000000000001');
update public.education_nodes set archived_at=now() where id='99550000-0000-4000-8000-000000000001';

-- Every nested array has more than the PostgREST default row cap.
insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug)
select ('9958'||lpad(i::text,28,'0'))::uuid,'99500000-0000-4000-8000-000000000001','مادة '||i,'Bulk subject '||i,(('9958'||lpad(i::text,28,'0'))::uuid)::text
from generate_series(1,1001) i;
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id)
select ('9959'||lpad(i::text,28,'0'))::uuid,'student_category','فئة '||i,'Bulk category '||i,(('9959'||lpad(i::text,28,'0'))::uuid)::text,'99500000-0000-4000-8000-000000000001'
from generate_series(1,1001) i;
insert into public.offerings(id,node_id,subject_id,owner_teacher_id)
select ('995a'||lpad(i::text,28,'0'))::uuid,('9959'||lpad(i::text,28,'0'))::uuid,('9958'||lpad(i::text,28,'0'))::uuid,'99500000-0000-4000-8000-000000000001'
from generate_series(1,1001) i;

select ok(to_regprocedure('public.teacher_catalogue_choices()') is not null,'catalogue choices RPC exists');
select ok(not (select prosecdef from pg_proc where oid='public.teacher_catalogue_choices()'::regprocedure),'catalogue choices RPC is SECURITY INVOKER');
select is((select provolatile::text from pg_proc where oid='public.teacher_catalogue_choices()'::regprocedure),'s','catalogue choices RPC is stable');
select ok((select proconfig @> array['search_path=pg_catalog, public, auth'] from pg_proc where oid='public.teacher_catalogue_choices()'::regprocedure),'catalogue choices RPC pins its search path');
select ok(has_function_privilege('authenticated','public.teacher_catalogue_choices()','EXECUTE') and not has_function_privilege('anon','public.teacher_catalogue_choices()','EXECUTE'),'only authenticated can execute the RPC');

create temp table teacher_choices_result(value jsonb) on commit drop;
grant all on teacher_choices_result to authenticated;
set local role anon;
select throws_ok($$select public.teacher_catalogue_choices()$$,'42501',null,'anonymous callers cannot execute the RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','99500000-0000-4000-8000-000000000001',true);
insert into teacher_choices_result select public.teacher_catalogue_choices();
reset role;
select ok((select not approved from public.teacher_profiles where id='99500000-0000-4000-8000-000000000001') and not dars_private.teacher_has_access('99500000-0000-4000-8000-000000000001'),'pending fixture is unapproved and has no teaching access');
select ok((select jsonb_typeof(value->'subjects')='array' and jsonb_typeof(value->'nodes')='array' and jsonb_typeof(value->'offerings')='array' from teacher_choices_result),'RPC returns all three JSON arrays');
select ok((select array_agg(e->>'id' order by e->>'id')=array_agg(e->>'id' order by ordinality) from teacher_choices_result cross join lateral jsonb_array_elements(value->'subjects') with ordinality a(e,ordinality)),'subject rows are ID sorted');
select ok((select array_agg(e->>'id' order by e->>'id')=array_agg(e->>'id' order by ordinality) from teacher_choices_result cross join lateral jsonb_array_elements(value->'nodes') with ordinality a(e,ordinality)),'node rows are ID sorted');
select ok((select array_agg(e->>'id' order by e->>'id')=array_agg(e->>'id' order by ordinality) from teacher_choices_result cross join lateral jsonb_array_elements(value->'offerings') with ordinality a(e,ordinality)),'offering rows are ID sorted');
select ok((select not exists(select 1 from jsonb_array_elements(value->'subjects') e where array(select key from jsonb_object_keys(e) as fields(key) order by key) is distinct from array['archived_at','id','name_ar','name_en','owner_teacher_id']::text[])
  and not exists(select 1 from jsonb_array_elements(value->'nodes') e where array(select key from jsonb_object_keys(e) as fields(key) order by key) is distinct from array['archived_at','id','kind','name_ar','name_en','owner_teacher_id','parent_id']::text[])
  and not exists(select 1 from jsonb_array_elements(value->'offerings') e where array(select key from jsonb_object_keys(e) as fields(key) order by key) is distinct from array['archived_at','id','node_id','owner_teacher_id','subject_id']::text[]) from teacher_choices_result),'RPC exposes only the documented narrow row fields');
select ok((select not exists(select 1 from jsonb_array_elements(value->'subjects') e where e->>'owner_teacher_id' not in ('99500000-0000-4000-8000-000000000001') and e->>'id' not in ('99560000-0000-4000-8000-000000000001'))
  and not exists(select 1 from jsonb_array_elements(value->'nodes') e where e->>'owner_teacher_id' not in ('99500000-0000-4000-8000-000000000001') and e->>'id' not in ('99550000-0000-4000-8000-000000000001','99550000-0000-4000-8000-000000000002','99550000-0000-4000-8000-000000000003'))
  and not exists(select 1 from jsonb_array_elements(value->'offerings') e where e->>'owner_teacher_id' not in ('99500000-0000-4000-8000-000000000001') and e->>'id' not in ('99570000-0000-4000-8000-000000000001')) from teacher_choices_result),'RPC includes shared and own rows only');
set local role authenticated;
select set_config('request.jwt.claim.sub','99500000-0000-4000-8000-000000000001',true);
select ok(exists(select 1 from public.subjects where id='99510000-0000-4000-8000-000000000001'),'RLS exposes a foreign published reference to exercise the explicit owner filter');
reset role;
select ok((select not exists(select 1 from jsonb_array_elements(value->'subjects') e where e->>'id'='99510000-0000-4000-8000-000000000001') and not exists(select 1 from jsonb_array_elements(value->'nodes') e where e->>'id'='99520000-0000-4000-8000-000000000001') and not exists(select 1 from jsonb_array_elements(value->'offerings') e where e->>'id'='99530000-0000-4000-8000-000000000001') from teacher_choices_result),'foreign published reference rows are excluded');
select ok((select exists(select 1 from jsonb_array_elements(value->'nodes') e where e->>'id'='99550000-0000-4000-8000-000000000001' and e->>'archived_at' is not null) from teacher_choices_result),'raw archived shared ancestor is retained in RPC output');
select is((select count(*)::integer from teacher_choices_result cross join lateral jsonb_array_elements(value->'subjects') e where e->>'id' like '9958%'),1001,'all 1001 subject rows survive inside the JSON result');
select is((select count(*)::integer from teacher_choices_result cross join lateral jsonb_array_elements(value->'nodes') e where e->>'id' like '9959%'),1001,'all 1001 node rows survive inside the JSON result');
select is((select count(*)::integer from teacher_choices_result cross join lateral jsonb_array_elements(value->'offerings') e where e->>'id' like '995a%'),1001,'all 1001 offering rows survive inside the JSON result');

create temp table teacher_choices_no_detail(value jsonb) on commit drop;
grant all on teacher_choices_no_detail to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','99500000-0000-4000-8000-000000000006',true);
insert into teacher_choices_no_detail select public.teacher_catalogue_choices();
reset role;
select ok(not exists(select 1 from public.teacher_profiles where id='99500000-0000-4000-8000-000000000006') and exists(select 1 from teacher_choices_no_detail where jsonb_typeof(value->'subjects')='array'),'active teacher without a teacher_profiles row can use the RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub','99500000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.teacher_catalogue_choices()$$,'42501',null,'students are denied');
select set_config('request.jwt.claim.sub','99500000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.teacher_catalogue_choices()$$,'42501',null,'suspended teachers are denied');
select set_config('request.jwt.claim.sub','99500000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.teacher_catalogue_choices()$$,'42501',null,'admins are denied');
reset role;

select * from finish();
rollback;
