\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('dars_private.teacher_has_access(uuid)') is null
    or to_regprocedure('public.teacher_access_status()') is null
    or to_regprocedure('public.renew_teacher_access()') is null
    or to_regprocedure('public.admin_teacher_access_page(integer,integer)') is null
    or to_regprocedure('public.admin_teacher_access_history(uuid,integer,integer)') is null
    or to_regprocedure('public.set_teacher_access_fee_policy(boolean,timestamptz,text,text,boolean)') is null
    or to_regprocedure('public.decide_teacher_access_request(uuid,boolean)') is null then
    raise exception 'monthly access engine RPCs are missing';
  end if;
  if (select fees_enabled from dars_private.teacher_access_fee_policy where singleton) then
    raise exception 'fee policy must begin disabled';
  end if;
  if has_table_privilege('anon','dars_private.teacher_access_state','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','dars_private.teacher_access_grants','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role','dars_private.teacher_access_fee_policy','SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('anon','public.renew_teacher_access()','EXECUTE')
    or has_function_privilege('service_role','public.teacher_access_status()','EXECUTE')
    or not has_function_privilege('authenticated','public.renew_teacher_access()','EXECUTE') then
    raise exception 'monthly access ACLs are unsafe';
  end if;
end $$;

-- A transaction-local fixture emulates email signup and Google completion's
-- later teacher_profiles insert without modifying real accounts.
set local session_replication_role=replica;
insert into public.profiles(id,full_name,role,status) values
 ('9a000000-0000-4000-8000-000000000001','Pending monthly teacher','teacher','active'),
 ('9a000000-0000-4000-8000-000000000002','Approved monthly teacher','teacher','active'),
 ('9a000000-0000-4000-8000-000000000003','Admin monthly fixture','admin','active'),
 ('9a000000-0000-4000-8000-000000000004','Suspended monthly teacher','teacher','suspended'),
 ('9a000000-0000-4000-8000-000000000005','Decline monthly teacher','teacher','active');
set local session_replication_role=origin;
insert into public.teacher_profiles(id,approved) values
 ('9a000000-0000-4000-8000-000000000001',false),
 ('9a000000-0000-4000-8000-000000000002',true),
 ('9a000000-0000-4000-8000-000000000004',true),
 ('9a000000-0000-4000-8000-000000000005',false);

insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) values
 ('9a000000-0000-4000-8000-000000000006','authenticated','authenticated','monthly-email@test.invalid','{"full_name":"Email path teacher","requested_role":"teacher"}','{"provider":"email"}'),
 ('9a000000-0000-4000-8000-000000000007','authenticated','authenticated','monthly-google@test.invalid','{"full_name":"Google path teacher","requested_role":"teacher"}','{"provider":"google"}');
set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000007';
select public.complete_google_signup('teacher');
reset role;

do $$
begin
  if (select count(*) from dars_private.teacher_access_grants where teacher_id in
      ('9a000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000004','9a000000-0000-4000-8000-000000000005','9a000000-0000-4000-8000-000000000006','9a000000-0000-4000-8000-000000000007'))<>6
    or (select count(*) from dars_private.teacher_access_state where teacher_id in
      ('9a000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000004','9a000000-0000-4000-8000-000000000005'))<>4
    or not exists(select 1 from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000001' and source='signup')
    or not exists(select 1 from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000002' and source='signup')
    or not exists(select 1 from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000006' and source='signup')
    or not exists(select 1 from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000007' and source='signup')
    or not exists(select 1 from public.teacher_profiles where id='9a000000-0000-4000-8000-000000000007' and not approved) then
    raise exception 'signup initialization omitted a teacher or changed approval path';
  end if;
end $$;

-- Cairo calendar arithmetic: month end clamps, leap February works, and DST
-- changes the elapsed-hour count while preserving seven local calendar days.
do $$
declare v_start timestamptz; v_end timestamptz; v_open timestamptz;
begin
  v_start:='2025-01-31 12:00:00'::timestamp at time zone 'Africa/Cairo';
  v_end:=((v_start at time zone 'Africa/Cairo')+interval '1 month') at time zone 'Africa/Cairo';
  if (v_end at time zone 'Africa/Cairo')::date<>date '2025-02-28' then raise exception 'January month-end did not clamp'; end if;
  v_start:='2024-01-31 12:00:00'::timestamp at time zone 'Africa/Cairo';
  v_end:=((v_start at time zone 'Africa/Cairo')+interval '1 month') at time zone 'Africa/Cairo';
  if (v_end at time zone 'Africa/Cairo')::date<>date '2024-02-29' then raise exception 'leap February did not clamp'; end if;
  v_start:='2024-04-25 09:00:00'::timestamp at time zone 'Africa/Cairo';
  v_end:='2024-05-02 09:00:00'::timestamp at time zone 'Africa/Cairo';
  v_open:=((v_end at time zone 'Africa/Cairo')-interval '7 days') at time zone 'Africa/Cairo';
  if (v_open at time zone 'Africa/Cairo')::timestamp<>timestamp '2024-04-25 09:00:00'
    or extract(epoch from (v_end-v_open))=604800 then raise exception 'DST renewal window was treated as fixed hours'; end if;
end $$;

set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000001';
update dars_private.teacher_access_state set expires_at=clock_timestamp()+interval '6 days' where teacher_id='9a000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v_status jsonb; v_result jsonb; begin
  v_status:=public.teacher_access_status();
  if not (v_status->>'has_access')::boolean or not (v_status->>'can_renew')::boolean then raise exception 'new teacher must have one active free month'; end if;
  v_result:=public.renew_teacher_access();
  if v_result->>'outcome'<>'renewed' or not (v_result->'access'->>'has_access')::boolean then
    raise exception 'disabled-fee renewal did not renew once'; end if;
  if (select not approved from public.teacher_profiles where id=auth.uid()) is distinct from true then raise exception 'renewal changed teacher approval'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000001')<>2 then raise exception 'free renewal issued more than one grant'; end if;
end $$;

set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000002';
update dars_private.teacher_access_state set starts_at=clock_timestamp()-interval '1 month',expires_at=clock_timestamp()-interval '1 second'
  where teacher_id='9a000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare v_status jsonb; v_result jsonb; begin
  v_status:=public.teacher_access_status();
  if (v_status->>'has_access')::boolean or not (v_status->>'can_renew')::boolean then raise exception 'expiry boundary is wrong'; end if;
  v_result:=public.renew_teacher_access();
  if v_result->>'outcome'<>'renewed' or not (v_result->'access'->>'has_access')::boolean then raise exception 'post-expiry renewal did not grant immediate access'; end if;
end $$;
reset role;

set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
  begin perform public.teacher_access_status(); raise exception 'suspended teacher read access status';
  exception when insufficient_privilege then null; end;
  begin perform public.renew_teacher_access(); raise exception 'suspended teacher renewed access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000002';
do $$
begin
  begin perform public.admin_teacher_access_page(); raise exception 'teacher read admin page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000003';
do $$ begin
  perform public.set_teacher_access_fee_policy(true,statement_timestamp()+interval '2 days',' Future fees ',' رسوم مستقبلية ',true);
  perform public.set_teacher_access_fee_policy(true,statement_timestamp()+interval '2 days','Future fees','رسوم مستقبلية',true);
  begin perform public.set_teacher_access_fee_policy(true,statement_timestamp()+interval '3 days','New fees','رسوم جديدة',false); raise exception 'policy change omitted confirmation';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from dars_private.teacher_access_announcements)<>1 then raise exception 'confirmed/no-op policy announcement count is wrong'; end if;
  if not exists(select 1 from public.user_notifications where recipient_id='9a000000-0000-4000-8000-000000000001' and kind='teacher_fee_announcement') then raise exception 'announcement missing teacher notification'; end if;
end $$;
update dars_private.teacher_access_fee_policy set effective_at=clock_timestamp()-interval '1 second' where singleton;

set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000001';
reset role;
update dars_private.teacher_access_state set expires_at=clock_timestamp()+interval '6 days' where teacher_id='9a000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v_first jsonb; v_second jsonb; v_request uuid; begin
  v_first:=public.renew_teacher_access();
  v_second:=public.renew_teacher_access();
  if v_first->>'outcome'<>'requested' or v_second->>'outcome'<>'pending' then
    raise exception 'fee-mode requests were not serialized and deduplicated'; end if;
  v_request:=(v_first->>'request_id')::uuid;
  if (v_first->'access'->>'has_access')::boolean is not true then raise exception 'request removed current access'; end if;
end $$;
reset role;
do $$ begin
if (select count(*) from dars_private.teacher_access_requests where teacher_id='9a000000-0000-4000-8000-000000000001' and status='pending')<>1 then raise exception 'pending request was duplicated'; end if;
end $$;

set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000005';
delete from dars_private.teacher_access_state where teacher_id='9a000000-0000-4000-8000-000000000005';
set local role authenticated;
do $$ declare v_result jsonb; begin
  v_result:=public.renew_teacher_access();
  if v_result->>'outcome'<>'requested' then raise exception 'effective fee policy did not require review'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000003';
do $$ declare v_request uuid; begin
  v_request:=((public.admin_teacher_access_history('9a000000-0000-4000-8000-000000000005')->'requests'->0)->>'id')::uuid;
  perform public.decide_teacher_access_request(v_request,false);
  begin
    perform public.decide_teacher_access_request(v_request,true);
    raise exception 'approval contradicted a persisted decline';
  exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from dars_private.teacher_access_requests where teacher_id='9a000000-0000-4000-8000-000000000005' and status='declined')
    or exists(select 1 from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000005' and source='admin_approved') then raise exception 'decline issued a grant or failed to close request'; end if;
end $$;

set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000006';
update dars_private.teacher_access_state set expires_at=clock_timestamp()+interval '6 days' where teacher_id='9a000000-0000-4000-8000-000000000006';
set local role authenticated;
do $$ declare v_result jsonb; begin
  v_result:=public.renew_teacher_access();
  if v_result->>'outcome'<>'requested' or not (v_result->'access'->>'has_access')::boolean then raise exception 'approved teacher fee request did not retain access'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000003';
do $$ declare v_request uuid; begin
  v_request:=((public.admin_teacher_access_history('9a000000-0000-4000-8000-000000000006')->'requests'->0)->>'id')::uuid;
  perform public.decide_teacher_access_request(v_request,true);
  begin
    perform public.decide_teacher_access_request(v_request,false);
    raise exception 'decline contradicted a persisted approval';
  exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000006' and source='admin_approved')<>1
    or exists(select 1 from public.teacher_profiles where id='9a000000-0000-4000-8000-000000000006' and approved) then
    raise exception 'paid-mode approval did not issue exactly one access grant independently of teacher approval'; end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000003';
do $$ begin
  perform public.set_teacher_access_fee_policy(false,null,null,null,false);
end $$;
reset role;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare v_result jsonb; begin
  v_result:=public.renew_teacher_access();
  if v_result->>'outcome'<>'renewed' or (v_result->'access'->>'has_access')::boolean is not true then raise exception 'free renewal did not preserve access after pending request'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from dars_private.teacher_access_requests where teacher_id='9a000000-0000-4000-8000-000000000001' and status='approved' and decided_by='9a000000-0000-4000-8000-000000000001')
    or (select count(*) from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000001' and request_id is not null)<>1 then raise exception 'free renewal failed to resolve request exactly once'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='9a000000-0000-4000-8000-000000000003';
do $$ declare v_request uuid; begin
  v_request:=((public.admin_teacher_access_history('9a000000-0000-4000-8000-000000000001')->'requests'->0)->>'id')::uuid;
  perform public.decide_teacher_access_request(v_request,true); -- same persisted decision remains idempotent
end $$;
reset role;
do $$ begin
  if (select count(*) from dars_private.teacher_access_grants where teacher_id='9a000000-0000-4000-8000-000000000001' and request_id is not null)<>1 then
    raise exception 'obsolete request decision issued a second grant'; end if;
end $$;

rollback;
select 'monthly teacher access engine SQL assertions passed' as result;
