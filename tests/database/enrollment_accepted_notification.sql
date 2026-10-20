\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7f500000-0000-4000-8000-000000000001','authenticated','authenticated','accept-teacher@test.invalid','{"full_name":"Acceptance Teacher","requested_role":"teacher"}'),
 ('7f500000-0000-4000-8000-000000000002','authenticated','authenticated','accept-student@test.invalid','{"full_name":"Accepted Student","requested_role":"student"}'),
 ('7f500000-0000-4000-8000-000000000003','authenticated','authenticated','accept-other@test.invalid','{"full_name":"Other Student","requested_role":"student"}'),
 ('7f500000-0000-4000-8000-000000000004','authenticated','authenticated','accept-rejected@test.invalid','{"full_name":"Rejected Student","requested_role":"student"}'),
 ('7f500000-0000-4000-8000-000000000005','authenticated','authenticated','accept-removed@test.invalid','{"full_name":"Removed Student","requested_role":"student"}');

set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='7f500000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into dars_private.teacher_access_grants(id,teacher_id,starts_at,expires_at,source)
values ('7f510000-0000-4000-8000-000000000001','7f500000-0000-4000-8000-000000000001',statement_timestamp()-interval '1 day',statement_timestamp()+interval '1 month','backfill');
insert into dars_private.teacher_access_state(teacher_id,current_grant_id,starts_at,expires_at)
values ('7f500000-0000-4000-8000-000000000001','7f510000-0000-4000-8000-000000000001',statement_timestamp()-interval '1 day',statement_timestamp()+interval '1 month')
on conflict (teacher_id) do update set
  current_grant_id=excluded.current_grant_id,
  starts_at=excluded.starts_at,
  expires_at=excluded.expires_at;

-- The acceptance kind extends the current constraint without removing fee announcements.
insert into public.user_notifications(recipient_id,kind,event_key)
values ('7f500000-0000-4000-8000-000000000001','teacher_fee_announcement','fee-kind-regression');

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f510000-0000-4000-8000-000000000002','7f500000-0000-4000-8000-000000000001',o.id,'Acceptance Group',10,'draft'
from public.offerings o order by o.id limit 1;
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
values ('7f510000-0000-4000-8000-000000000002',1,'09:00','10:00');
update public.groups set status='published' where id='7f510000-0000-4000-8000-000000000002';

insert into public.enrollments(id,group_id,student_id,status) values
 ('7f520000-0000-4000-8000-000000000001','7f510000-0000-4000-8000-000000000002','7f500000-0000-4000-8000-000000000002','pending'),
 ('7f520000-0000-4000-8000-000000000002','7f510000-0000-4000-8000-000000000002','7f500000-0000-4000-8000-000000000003','pending'),
 ('7f520000-0000-4000-8000-000000000003','7f510000-0000-4000-8000-000000000002','7f500000-0000-4000-8000-000000000004','pending'),
 ('7f520000-0000-4000-8000-000000000004','7f510000-0000-4000-8000-000000000002','7f500000-0000-4000-8000-000000000005','pending');

-- A teacher's authorized decision generates one event. Same-status writes do not
-- duplicate it; rejected, pending, and removed/reaccepted rows never do.
set local role authenticated;
set local request.jwt.claim.sub='7f500000-0000-4000-8000-000000000001';
select public.decide_enrollment('7f520000-0000-4000-8000-000000000001','accepted');
select public.decide_enrollment('7f520000-0000-4000-8000-000000000003','rejected');
reset role;

update public.enrollments set updated_at=statement_timestamp() where id='7f520000-0000-4000-8000-000000000001';
update public.enrollments set updated_at=statement_timestamp() where id='7f520000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub='7f500000-0000-4000-8000-000000000001';
select public.decide_enrollment('7f520000-0000-4000-8000-000000000001','removed');
reset role;
update public.enrollments set status='accepted' where id='7f520000-0000-4000-8000-000000000001';

do $$
declare v_payload jsonb;
begin
  if (select count(*) from public.user_notifications
      where recipient_id='7f500000-0000-4000-8000-000000000002' and kind='enrollment_accepted')<>1 then
    raise exception 'accepted enrollment must create exactly one student notification';
  end if;
  select payload into v_payload from public.user_notifications
  where recipient_id='7f500000-0000-4000-8000-000000000002' and kind='enrollment_accepted';
  if v_payload is distinct from jsonb_build_object('group_id','7f510000-0000-4000-8000-000000000002','group_name','Acceptance Group') then
    raise exception 'accepted enrollment payload must contain only its group id and name: %',v_payload;
  end if;
  if exists(select 1 from public.user_notifications where recipient_id in (
       '7f500000-0000-4000-8000-000000000003',
       '7f500000-0000-4000-8000-000000000004',
       '7f500000-0000-4000-8000-000000000005') and kind='enrollment_accepted') then
    raise exception 'other, rejected, or removed/reaccepted student received acceptance notification';
  end if;
  if has_function_privilege('anon','dars_private.notify_enrollment_accepted()','EXECUTE')
     or has_function_privilege('authenticated','dars_private.notify_enrollment_accepted()','EXECUTE') then
    raise exception 'private notification trigger function is directly executable by client roles';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='7f500000-0000-4000-8000-000000000003';
do $$
begin
  if (public.notifications_page(0,20)->>'total')::integer<>0 then
    raise exception 'another student can read the acceptance notification';
  end if;
  if exists(select 1 from public.user_notifications where recipient_id='7f500000-0000-4000-8000-000000000002') then
    raise exception 'RLS exposed another student acceptance notification';
  end if;
end $$;
reset role;

rollback;
