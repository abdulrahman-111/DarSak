\set ON_ERROR_STOP on
begin;

do $$ begin
  if not has_function_privilege('authenticated','public.calendar_lesson_export(date,date)','EXECUTE')
     or has_function_privilege('anon','public.calendar_lesson_export(date,date)','EXECUTE')
     or has_function_privilege('service_role','public.calendar_lesson_export(date,date)','EXECUTE') then
    raise exception 'calendar export RPC grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7f300000-0000-4000-8000-000000000001','authenticated','authenticated','calendar-owner@test.invalid','{"full_name":"Calendar Owner","requested_role":"teacher"}'),
 ('7f300000-0000-4000-8000-000000000002','authenticated','authenticated','calendar-foreign@test.invalid','{"full_name":"Calendar Foreign","requested_role":"teacher"}'),
 ('7f300000-0000-4000-8000-000000000003','authenticated','authenticated','calendar-student@test.invalid','{"full_name":"Calendar Student","requested_role":"student"}'),
 ('7f300000-0000-4000-8000-000000000004','authenticated','authenticated','calendar-admin@test.invalid','{"full_name":"Calendar Admin","requested_role":"student"}'),
 ('7f300000-0000-4000-8000-000000000005','authenticated','authenticated','calendar-inactive@test.invalid','{"full_name":"Calendar Inactive","requested_role":"student"}');

-- These fixture-only protected profile changes bypass application triggers, then restore normal trigger behavior before any assertions.
set local session_replication_role=replica;
update public.profiles set role='admin' where id='7f300000-0000-4000-8000-000000000004';
update public.profiles set status='suspended' where id='7f300000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status,location)
select '7f310000-0000-4000-8000-000000000001','7f300000-0000-4000-8000-000000000001',o.id,'Calendar owner archived group',10,'archived','Cairo'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status,location)
select '7f310000-0000-4000-8000-000000000002','7f300000-0000-4000-8000-000000000002',o.id,'Calendar foreign group',10,'draft','Giza'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status,location)
select '7f310000-0000-4000-8000-000000000003','7f300000-0000-4000-8000-000000000002',o.id,'Calendar removed group',10,'archived','Giza'
from public.offerings o order by o.id limit 1;
insert into public.enrollments(group_id,student_id,status) values
 ('7f310000-0000-4000-8000-000000000001','7f300000-0000-4000-8000-000000000003','accepted'),
 ('7f310000-0000-4000-8000-000000000002','7f300000-0000-4000-8000-000000000003','pending'),
 ('7f310000-0000-4000-8000-000000000003','7f300000-0000-4000-8000-000000000003','removed');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('7f320000-0000-4000-8000-000000000001','7f310000-0000-4000-8000-000000000001','Cairo daylight boundary',timestamp '2026-04-24 00:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-24 02:00:00' at time zone 'Africa/Cairo','scheduled'),
 ('7f320000-0000-4000-8000-000000000002','7f310000-0000-4000-8000-000000000001','Cancelled history',timestamp '2026-04-25 12:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-25 13:00:00' at time zone 'Africa/Cairo','cancelled'),
 ('7f320000-0000-4000-8000-000000000003','7f310000-0000-4000-8000-000000000001','Exclusive next-day bound',timestamp '2026-04-26 00:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-26 01:00:00' at time zone 'Africa/Cairo','scheduled'),
 ('7f320000-0000-4000-8000-000000000004','7f310000-0000-4000-8000-000000000002','Pending membership',timestamp '2026-04-24 12:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-24 13:00:00' at time zone 'Africa/Cairo','scheduled'),
 ('7f320000-0000-4000-8000-000000000005','7f310000-0000-4000-8000-000000000002','Foreign teacher lesson',timestamp '2026-04-24 14:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-24 15:00:00' at time zone 'Africa/Cairo','scheduled'),
 ('7f320000-0000-4000-8000-000000000006','7f310000-0000-4000-8000-000000000003','Removed membership',timestamp '2026-04-24 16:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-24 17:00:00' at time zone 'Africa/Cairo','scheduled');

set local role authenticated;
set local request.jwt.claim.sub='7f300000-0000-4000-8000-000000000003';
do $$ declare v_result jsonb; v_rows jsonb; begin
  v_result := public.calendar_lesson_export('2026-04-24','2026-04-25');
  v_rows := v_result->'rows';
  if (v_result->>'total')::integer<>2
     or not (v_rows @> '[{"id":"7f320000-0000-4000-8000-000000000001"}]'::jsonb)
     or not (v_rows @> '[{"id":"7f320000-0000-4000-8000-000000000002","status":"cancelled"}]'::jsonb)
     or v_rows @> '[{"id":"7f320000-0000-4000-8000-000000000003"}]'::jsonb then
    raise exception 'accepted student visibility or Cairo inclusive bounds failed: %',v_result;
  end if;
  if (v_rows->0) ?| array['notes','materials','student_contacts','enrollments'] then
    raise exception 'calendar export leaked private fields: %',v_rows;
  end if;
  begin perform public.calendar_lesson_export('2026-04-24','2026-04-24'::date+93); raise exception '94-day range was accepted'; exception when sqlstate '22023' then null; end;
  v_result := public.calendar_lesson_export('2026-04-24','2026-07-25');
  if (v_result->>'total')::integer>500 then raise exception '93-day inclusive range incorrectly rejected'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f300000-0000-4000-8000-000000000001';
do $$ declare v_result jsonb; begin
  v_result := public.calendar_lesson_export('2026-04-24','2026-04-25');
  if (v_result->>'total')::integer<>2
     or not (v_result->'rows' @> '[{"id":"7f320000-0000-4000-8000-000000000002","status":"cancelled"}]'::jsonb) then
    raise exception 'teacher did not receive owned archived/cancelled lesson history: %',v_result;
  end if;
  begin perform public.calendar_lesson_export(null,'2026-04-25'); raise exception 'null date was accepted'; exception when sqlstate '22023' then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f300000-0000-4000-8000-000000000002';
do $$ declare v_result jsonb; begin
  v_result := public.calendar_lesson_export('2026-04-24','2026-04-25');
  if (v_result->>'total')::integer<>3
     or not (v_result->'rows' @> '[{"id":"7f320000-0000-4000-8000-000000000004"}]'::jsonb) then
    raise exception 'teacher did not receive only their own groups: %',v_result;
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f300000-0000-4000-8000-000000000004';
do $$ begin
  begin perform public.calendar_lesson_export('2026-04-24','2026-04-25'); raise exception 'admin export succeeded'; exception when sqlstate '42501' then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7f300000-0000-4000-8000-000000000005';
do $$ begin
  begin perform public.calendar_lesson_export('2026-04-24','2026-04-25'); raise exception 'inactive student export succeeded'; exception when sqlstate '42501' then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.calendar_lesson_export('2026-04-24','2026-04-25'); raise exception 'anon export succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.lessons(group_id,title,starts_at,ends_at)
select '7f310000-0000-4000-8000-000000000001','Calendar cap fixture',timestamp '2026-04-27 00:00:00' at time zone 'Africa/Cairo',timestamp '2026-04-27 00:30:00' at time zone 'Africa/Cairo'
from generate_series(1,501);
set local role authenticated;
set local request.jwt.claim.sub='7f300000-0000-4000-8000-000000000001';
do $$ begin
  begin perform public.calendar_lesson_export('2026-04-27','2026-04-27'); raise exception '501-event range was accepted'; exception when sqlstate '54000' then null; end;
end $$;
reset role;

rollback;
select 'calendar export SQL assertions passed' as result;
