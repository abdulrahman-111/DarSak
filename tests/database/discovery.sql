\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)') is null then
    raise exception 'discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer) is not installed';
  end if;
  if to_regprocedure('public.public_group_detail(uuid)') is null then
    raise exception 'public_group_detail(uuid) is not installed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('80000000-0000-4000-8000-000000000001','authenticated','authenticated','discover-teacher-one@regression.test','{"full_name":"Discovery One","requested_role":"teacher"}'),
 ('80000000-0000-4000-8000-000000000002','authenticated','authenticated','discover-teacher-two@regression.test','{"full_name":"Discovery Two","requested_role":"teacher"}'),
 ('80000000-0000-4000-8000-000000000003','authenticated','authenticated','discover-unapproved@regression.test','{"full_name":"Hidden Discovery","requested_role":"teacher"}'),
 ('80000000-0000-4000-8000-000000000004','authenticated','authenticated','discover-suspended@regression.test','{"full_name":"Suspended Discovery","requested_role":"teacher"}'),
 ('80000000-0000-4000-8000-000000000005','authenticated','authenticated','discover-student@regression.test','{"full_name":"Suspended Student","requested_role":"student"}');

set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in (
 '80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000004'
);
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
with primary_offering as (
  select o.id,o.node_id,o.subject_id from public.offerings o order by o.id limit 1
), secondary_offering as (
  select o.id from public.offerings o,primary_offering p where o.subject_id<>p.subject_id order by o.id limit 1
)
select f.id,f.teacher_id,case when f.id='80100000-0000-4000-8000-000000000002' then s.id else p.id end,
 f.name,f.description,f.capacity,f.status,f.location
from (values
 ('80100000-0000-4000-8000-000000000001'::uuid,'80000000-0000-4000-8000-000000000001'::uuid,'Discovery Algebra North','Searchable algebra description',2,'draft'::public.group_status,'North room'),
 ('80100000-0000-4000-8000-000000000002'::uuid,'80000000-0000-4000-8000-000000000002'::uuid,'Discovery Physics Central','Searchable physics description',1,'draft'::public.group_status,'Central room'),
 ('80100000-0000-4000-8000-000000000003'::uuid,'80000000-0000-4000-8000-000000000001'::uuid,'Discovery Draft Hidden','Draft description',2,'draft'::public.group_status,'Draft room'),
 ('80100000-0000-4000-8000-000000000004'::uuid,'80000000-0000-4000-8000-000000000003'::uuid,'Discovery Unapproved Hidden','Unapproved description',2,'draft'::public.group_status,'Hidden room'),
 ('80100000-0000-4000-8000-000000000005'::uuid,'80000000-0000-4000-8000-000000000004'::uuid,'Discovery Suspended Hidden','Suspended description',2,'draft'::public.group_status,'Hidden room'),
 ('80100000-0000-4000-8000-000000000006'::uuid,'80000000-0000-4000-8000-000000000001'::uuid,'Discovery Archived Hidden','Archived description',2,'archived'::public.group_status,'History room')
) as f(id,teacher_id,name,description,capacity,status,location)
cross join primary_offering p cross join secondary_offering s;

insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('80200000-0000-4000-8000-000000000001','80100000-0000-4000-8000-000000000001',0,'10:00','11:00'),
 ('80200000-0000-4000-8000-000000000002','80100000-0000-4000-8000-000000000001',2,'12:00','13:00'),
 ('80200000-0000-4000-8000-000000000003','80100000-0000-4000-8000-000000000002',4,'10:00','11:00'),
 ('80200000-0000-4000-8000-000000000004','80100000-0000-4000-8000-000000000003',0,'14:00','15:00'),
 ('80200000-0000-4000-8000-000000000005','80100000-0000-4000-8000-000000000004',1,'14:00','15:00'),
 ('80200000-0000-4000-8000-000000000006','80100000-0000-4000-8000-000000000005',3,'14:00','15:00'),
 ('80200000-0000-4000-8000-000000000007','80100000-0000-4000-8000-000000000006',5,'16:00','17:00');

set local request.jwt.claim.sub='80000000-0000-4000-8000-000000000001';
select public.publish_group('80100000-0000-4000-8000-000000000001',null,null);
select public.publish_group('80100000-0000-4000-8000-000000000006',null,null);
set local request.jwt.claim.sub='80000000-0000-4000-8000-000000000002';
select public.publish_group('80100000-0000-4000-8000-000000000002',null,null);
set local request.jwt.claim.sub='80000000-0000-4000-8000-000000000004';
select public.publish_group('80100000-0000-4000-8000-000000000005',null,null);

-- This deliberately models a legacy published row created before the approval guard.
set local session_replication_role=replica;
update public.groups set status='published' where id='80100000-0000-4000-8000-000000000004';
update public.groups set status='archived' where id='80100000-0000-4000-8000-000000000006';
update public.profiles set status='suspended' where id='80000000-0000-4000-8000-000000000004';
update public.profiles set status='suspended' where id='80000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

-- Trusted fixture inserts must not inherit the last suspended teacher actor.
set local request.jwt.claim.sub='';
insert into public.enrollments(group_id,student_id,status) values
 ('80100000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000005','accepted'),
 ('80100000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000005','accepted'),
 ('80100000-0000-4000-8000-000000000006','80000000-0000-4000-8000-000000000005','accepted');

insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('80300000-0000-4000-8000-000000000001','80100000-0000-4000-8000-000000000001','Rescheduled occurrence private title','2099-02-01 08:30+00','2099-02-01 09:30+00','scheduled'),
 ('80300000-0000-4000-8000-000000000002','80100000-0000-4000-8000-000000000001','Cancelled future private title','2099-02-01 08:00+00','2099-02-01 09:00+00','cancelled'),
 ('80300000-0000-4000-8000-000000000003','80100000-0000-4000-8000-000000000001','Completed future private title','2099-02-01 08:10+00','2099-02-01 09:10+00','completed'),
 ('80300000-0000-4000-8000-000000000004','80100000-0000-4000-8000-000000000001','Past private title','2000-02-01 08:00+00','2000-02-01 09:00+00','scheduled');

set local role authenticated;
set local request.jwt.claim.sub='80000000-0000-4000-8000-000000000005';
do $$
declare
  v_a uuid:='80100000-0000-4000-8000-000000000001';
  v_b uuid:='80100000-0000-4000-8000-000000000002';
  v_count integer;
  v_rows uuid[];
  v_json jsonb;
  v_accepted bigint;
  v_seats bigint;
  v_weekdays integer[];
  v_next timestamptz;
  v_expected_keys text[]:=array['id','teacher_id','offering_id','name','description','capacity','status','location','created_at','teacher_name','subject_name_ar','subject_name_en','node_name_ar','node_name_en','accepted_count','available_seats','weekdays','next_lesson_at'];
  v_subject uuid;
  v_node uuid;
  v_root uuid;
begin
  if not has_function_privilege('anon','public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)','EXECUTE')
     or not has_function_privilege('anon','public.public_group_detail(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.public_group_detail(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.public_group_detail(uuid)','EXECUTE') then
    raise exception 'public discovery RPC grants are incorrect';
  end if;
  if (select prosecdef from pg_proc where oid='public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)'::regprocedure) is not true
     or (select prosecdef from pg_proc where oid='public.public_group_detail(uuid)'::regprocedure) is not true
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid='public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)'::regprocedure)
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid='public.public_group_detail(uuid)'::regprocedure) then
    raise exception 'discovery functions must be fixed-path security definer';
  end if;
  if (select proargnames from pg_proc where oid='public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer)'::regprocedure)
     is distinct from array['p_subject_id','p_node_id','p_teacher_id','p_weekday','p_has_seats','p_query','p_offset','p_limit','id','teacher_id','offering_id','name','description','capacity','status','location','created_at','teacher_name','subject_name_ar','subject_name_en','node_name_ar','node_name_en','accepted_count','available_seats','weekdays','next_lesson_at']::text[] then
    raise exception 'discover_groups argument or output contract changed';
  end if;

  select count(*) into v_count from public.discover_groups();
  if v_count<>2 then raise exception 'public discovery exposed draft, archived, unapproved or suspended groups'; end if;
  select array_agg(d.id order by d.id) into v_rows from public.discover_groups(null,null,null,null,null,null,0,50) d;
  if v_rows is distinct from array[v_a,v_b] then raise exception 'NULL query/seat filters were not normalized or deterministic'; end if;
  select d.accepted_count,d.available_seats,d.weekdays,d.next_lesson_at
  into v_accepted,v_seats,v_weekdays,v_next from public.discover_groups() d where d.id=v_a;
  if v_accepted<>1 or v_seats<>1 or v_weekdays is distinct from array[0,2]
     or v_next is distinct from '2099-02-01 08:30+00'::timestamptz then
    raise exception 'safe aggregates must retain accepted counts, all weekdays and the actual next scheduled timestamp';
  end if;
  if (select accepted_count from public.discover_groups() where id=v_a)<>1
     or (select available_seats from public.discover_groups() where id=v_a)<>1
     or (select weekdays from public.discover_groups() where id=v_a)<>array[0,2]
     or (select next_lesson_at from public.discover_groups() where id=v_a)<>'2099-02-01 08:30+00'::timestamptz then
    raise exception 'safe aggregate fields do not include all accepted seats, recurring days and the actual next scheduled timestamp';
  end if;
  if (select accepted_count from public.discover_groups() where id=v_b)<>1
     or (select available_seats from public.discover_groups() where id=v_b)<>0
     or (select weekdays from public.discover_groups() where id=v_b)<>array[4]
     or (select next_lesson_at from public.discover_groups() where id=v_b) is not null then
    raise exception 'group without a future scheduled lesson has incorrect safe fields';
  end if;

  select to_jsonb(d) into v_json from public.discover_groups() d where d.id=v_a;
  if (select count(*) from jsonb_object_keys(v_json))<>18
     or (select array_agg(k order by k) from jsonb_object_keys(v_json) as keys(k)) is distinct from (select array_agg(k order by k) from unnest(v_expected_keys) as expected(k))
     or v_json ?| array['lesson_id','lesson_title','title','notes','materials','student_id','roster','contact_email','phone_number','profile'] then
    raise exception 'discovery projection exposes an unexpected or protected field';
  end if;

  select p.id,o.node_id into v_subject,v_node from public.offerings o join public.subjects p on p.id=o.subject_id where o.id=(select offering_id from public.public_groups() where id=v_a);
  with recursive ancestors(id,parent_id) as (
    select n.id,n.parent_id from public.education_nodes n where n.id=v_node
    union all select p.id,p.parent_id from public.education_nodes p join ancestors a on p.id=a.parent_id
  ) select id into v_root from ancestors where parent_id is null limit 1;
  if (select count(*) from public.discover_groups(v_subject,null,null,null,false,'',0,50))<>1 then raise exception 'subject filter failed for %, count %',v_subject,(select count(*) from public.discover_groups(v_subject,null,null,null,false,'',0,50)); end if;
  if (select count(*) from public.discover_groups(null,v_root,null,null,false,null,0,50) where id=v_a)<>1 then raise exception 'descendant node filter failed'; end if;
  if (select count(*) from public.discover_groups(null,'ffffffff-ffff-4fff-8fff-ffffffffffff',null,null,false,'',0,50))<>0 then raise exception 'unknown node filter failed'; end if;
  if (select count(*) from public.discover_groups('ffffffff-ffff-4fff-8fff-ffffffffffff',null,null,null,false,'',0,50))<>0 then raise exception 'unknown subject filter failed'; end if;
  if (select count(*) from public.discover_groups(null,null,'80000000-0000-4000-8000-000000000002',null,false,'',0,50))<>1 then raise exception 'teacher filter failed'; end if;
  if (select count(*) from public.discover_groups(null,null,null,0,false,'',0,50) where id=v_a)<>1 then raise exception 'weekday match filter failed'; end if;
  if (select count(*) from public.discover_groups(null,null,null,3,false,'',0,50))<>0 then raise exception 'weekday miss filter failed'; end if;
  if (select count(*) from public.discover_groups(null,null,null,null,true,'',0,50))<>1 then raise exception 'available seats filter failed'; end if;
  if (select count(*) from public.discover_groups(null,null,null,null,false,'Discovery Algebra',0,50) where id=v_a)<>1 then raise exception 'literal search match failed'; end if;
  if (select count(*) from public.discover_groups(null,null,null,null,false,'%',0,50))<>0 then raise exception 'literal wildcard search failed'; end if;
  if (select id from public.discover_groups(null,null,null,null,false,'',0,1))<>v_a
     or (select id from public.discover_groups(null,null,null,null,false,'',1,1))<>v_b then
    raise exception 'discovery pagination is not stable';
  end if;
  begin
    perform * from public.discover_groups(null,null,null,7,false,'',0,1);
    raise exception 'invalid weekday was accepted';
  exception when others then if sqlerrm='invalid weekday was accepted' then raise; end if; end;
  begin
    perform * from public.discover_groups(null,null,null,null,false,'',0,51);
    raise exception 'limit above 50 was accepted';
  exception when others then if sqlerrm='limit above 50 was accepted' then raise; end if; end;
  begin
    perform * from public.discover_groups(null,null,null,null,false,'',-1,1);
    raise exception 'negative offset was accepted';
  exception when others then if sqlerrm='negative offset was accepted' then raise; end if; end;
  begin
    perform * from public.discover_groups(null,null,null,null,false,repeat('x',121),0,1);
    raise exception 'query longer than 120 characters was accepted';
  exception when others then if sqlerrm='query longer than 120 characters was accepted' then raise; end if; end;
  begin
    perform * from public.discover_groups(null,null,null,null,false,'',null,1);
    raise exception 'null offset was accepted';
  exception when others then if sqlerrm='null offset was accepted' then raise; end if; end;
  begin
    perform * from public.discover_groups(null,null,null,null,false,'',0,null);
    raise exception 'null limit was accepted';
  exception when others then if sqlerrm='null limit was accepted' then raise; end if; end;

  select to_jsonb(d) into v_json from public.public_group_detail(v_a) d;
  if (select count(*) from jsonb_object_keys(v_json))<>18
     or (select array_agg(k order by k) from jsonb_object_keys(v_json) as keys(k)) is distinct from (select array_agg(k order by k) from unnest(v_expected_keys) as expected(k))
     or (select count(*) from public.public_group_detail(v_a))<>1
     or (select count(*) from public.public_group_detail(null))<>0
     or (select count(*) from public.public_group_detail('ffffffff-ffff-4fff-8fff-ffffffffffff'))<>0
     or (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000003'))<>0
     or (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000004'))<>0
     or (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000005'))<>0
     or (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000006'))<>0 then
    raise exception 'public_group_detail does not match public visibility and field projection';
  end if;
end $$;
reset role;

set local role anon;
set local request.jwt.claim.sub='';
do $$
begin
  if (select count(*) from public.discover_groups())<>2
     or (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000001'))<>1
     or (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000003'))<>0 then
    raise exception 'anonymous detail visibility differs from the safe public projection';
  end if;
  if (select count(*) from public.group_schedule_slots where group_id='80100000-0000-4000-8000-000000000001')<>2 then
    raise exception 'anonymous lost the existing published schedule-slot projection';
  end if;
end $$;
reset role;

set local session_replication_role=replica;
update public.profiles set status='active' where id='80000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='80000000-0000-4000-8000-000000000005';
do $$
begin
  if (select count(*) from public.groups where id='80100000-0000-4000-8000-000000000006')<>1 then
    raise exception 'accepted member lost existing archived group RLS access';
  end if;
  if (select count(*) from public.public_group_detail('80100000-0000-4000-8000-000000000006'))<>0 then
    raise exception 'public detail exposed an archived accepted group';
  end if;
end $$;
reset role;

rollback;
select 'safe discovery assertions passed' as result;
