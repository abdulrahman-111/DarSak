\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('public.teacher_dashboard_summary(timestamp with time zone,timestamp with time zone,timestamp with time zone)') is null
     or not has_function_privilege('authenticated','public.teacher_dashboard_summary(timestamptz,timestamptz,timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.teacher_dashboard_summary(timestamptz,timestamptz,timestamptz)','EXECUTE')
     or has_function_privilege('service_role','public.teacher_dashboard_summary(timestamptz,timestamptz,timestamptz)','EXECUTE') then
    raise exception 'teacher dashboard summary signature or grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7e300000-0000-4000-8000-000000000001','authenticated','authenticated','dashboard-owner@test.invalid','{"full_name":"Dashboard owner","requested_role":"teacher"}'),
 ('7e300000-0000-4000-8000-000000000002','authenticated','authenticated','dashboard-foreign@test.invalid','{"full_name":"Dashboard foreign","requested_role":"teacher"}'),
 ('7e300000-0000-4000-8000-000000000003','authenticated','authenticated','dashboard-student@test.invalid','{"full_name":"Dashboard student","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='7e300000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status,created_at)
select ('7e310000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       '7e300000-0000-4000-8000-000000000001', o.id,
       'Dashboard group '||n, 10,
       case when n=1 then 'draft'::public.group_status when n=11 then 'published'::public.group_status else 'archived'::public.group_status end,
       timestamptz '2026-01-01 00:00:00+00' + n * interval '1 day'
from generate_series(1,12) n cross join lateral (select id from public.offerings order by id limit 1) o;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e310000-0000-4000-8000-000000000099','7e300000-0000-4000-8000-000000000002',o.id,'Foreign dashboard group',10,'draft'
from (select id from public.offerings order by id limit 1) o;
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
values ('7e310000-0000-4000-8000-000000000011',1,'10:00','11:00');
insert into public.teacher_specializations(teacher_id,offering_id)
select '7e300000-0000-4000-8000-000000000001', id from public.offerings order by id limit 1;

insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
select ('7e320000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       '7e310000-0000-4000-8000-000000000011','Today lesson '||n,
       timestamptz '2026-05-03 10:00:00+00' + n * interval '1 minute',
       timestamptz '2026-05-03 11:00:00+00' + n * interval '1 minute','scheduled'
from generate_series(1,10) n;
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
select ('7e330000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       '7e310000-0000-4000-8000-000000000011','Upcoming lesson '||n,
       timestamptz '2026-05-03 12:00:00+00' + n * interval '1 day',
       timestamptz '2026-05-03 13:00:00+00' + n * interval '1 day','scheduled'
from generate_series(1,10) n;

set local role authenticated;
set local request.jwt.claim.sub='7e300000-0000-4000-8000-000000000001';
do $$
declare v jsonb;
begin
  v:=public.teacher_dashboard_summary('2026-05-03 00:00:00+00','2026-05-04 00:00:00+00','2026-05-03 10:11:00+00');
  if (v->>'group_count')::int<>12 or jsonb_array_length(v->'groups')<>8 then
    raise exception 'group count/preview is not complete and bounded';
  end if;
  if v->'draft_candidate'->>'id'<>'7e310000-0000-4000-8000-000000000001'
     or v->'missing_schedule_candidate'->>'id'<>'7e310000-0000-4000-8000-000000000001'
     or v->'has_specializations'<>'true' then
    raise exception 'task candidates or specialization flag omitted';
  end if;
  if (v->>'today_count')::int<>10 or jsonb_array_length(v->'today')<>8
     or (v->>'upcoming_count')::int<>10 or jsonb_array_length(v->'upcoming')<>8 then
    raise exception 'lesson counts/previews are not complete and bounded';
  end if;
  if exists(select 1 from jsonb_array_elements(v->'groups') g where g->>'id'='7e310000-0000-4000-8000-000000000099') then
    raise exception 'foreign group appeared in summary';
  end if;
  begin perform public.teacher_dashboard_summary('2026-05-03 00:00:00+00','2026-05-05 00:00:00+00','2026-05-03 10:11:00+00');
    raise exception 'unreasonable day range accepted';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e300000-0000-4000-8000-000000000003';
do $$ begin
  begin perform public.teacher_dashboard_summary('2026-05-03 00:00:00+00','2026-05-04 00:00:00+00','2026-05-03 10:11:00+00');
    raise exception 'student called teacher dashboard summary';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
set local request.jwt.claim.sub='';
do $$ begin
  begin perform public.teacher_dashboard_summary('2026-05-03 00:00:00+00','2026-05-04 00:00:00+00','2026-05-03 10:11:00+00');
    raise exception 'anonymous called teacher dashboard summary';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
select 'teacher dashboard summary SQL assertions passed' as result;
