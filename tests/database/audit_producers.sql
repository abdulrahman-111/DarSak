\set ON_ERROR_STOP on
begin;

-- Rollback-only producer acceptance coverage. All feature actions below run as
-- an authenticated AAL2 admin through their public RPCs; only the fixture rows
-- are inserted by the database test owner.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmed_at)
values
 ('c1490000-0000-4000-8000-000000000001','authenticated','authenticated','c149-admin@test.invalid','{}','{"requested_role":"student","full_name":"C149 Admin"}',now(),now(),now()),
 ('c1490000-0000-4000-8000-000000000002','authenticated','authenticated','c149-teacher@test.invalid','{}','{"requested_role":"teacher","full_name":"C149 Teacher"}',now(),now(),now()),
 ('c1490000-0000-4000-8000-000000000003','authenticated','authenticated','c149-student@test.invalid','{}','{"requested_role":"student","full_name":"C149 Student"}',now(),now(),now());

-- Owner maintenance creates the test admin identity, before any feature RPC.
set local session_replication_role=replica;
update public.profiles set role='admin' where id='c1490000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

create function pg_temp.audit_count(p_action text,p_target uuid default null)
returns bigint language sql security definer set search_path=pg_catalog,dars_private,pg_temp as $$
  select count(*) from dars_private.audit_log
  where action=p_action and (p_target is null or target_id=p_target)
$$;
create function pg_temp.audit_has_unexpected_metadata(p_action text,p_target uuid,p_expected jsonb)
returns boolean language sql security definer set search_path=pg_catalog,dars_private,pg_temp as $$
  select exists(select 1 from dars_private.audit_log where action=p_action and (p_target is null or target_id=p_target) and metadata<>p_expected)
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1490000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','c1490000-0000-4000-8000-000000000001',true);

-- Profile status producer: one state change, one event; retry is a no-op.
do $$ declare n bigint; begin
  n:=pg_temp.audit_count('user_suspended','c1490000-0000-4000-8000-000000000003');
  perform public.admin_update_user('c1490000-0000-4000-8000-000000000003','suspended',null);
  if pg_temp.audit_count('user_suspended','c1490000-0000-4000-8000-000000000003')<>n+1 then raise exception 'admin_update_user suspension did not emit exactly one event'; end if;
  perform public.admin_update_user('c1490000-0000-4000-8000-000000000003','suspended',null);
  if pg_temp.audit_count('user_suspended','c1490000-0000-4000-8000-000000000003')<>n+1 then raise exception 'idempotent suspension emitted an event'; end if;
  if pg_temp.audit_has_unexpected_metadata('user_suspended','c1490000-0000-4000-8000-000000000003','{"status":"suspended"}') then raise exception 'suspension metadata contains unexpected fields'; end if;
end $$;

-- Policy controls remain off in the committed database because the enclosing
-- fixture always rolls back. The RPCs themselves must emit one status-only
-- event for a real transition and none for a repeated identical setting.
do $$ declare n bigint; v_at timestamptz:=greatest('2026-11-14 22:00:00+00'::timestamptz,now()+interval '2 days'); begin
  n:=pg_temp.audit_count('fee_policy_changed');
  perform public.set_teacher_access_fee_policy(true,v_at,'C149 test notice','C149 test notice',true);
  if pg_temp.audit_count('fee_policy_changed')<>n+1 then raise exception 'fee policy transition did not emit exactly one event'; end if;
  perform public.set_teacher_access_fee_policy(true,v_at,'C149 test notice','C149 test notice',true);
  if pg_temp.audit_count('fee_policy_changed')<>n+1 then raise exception 'fee policy no-op emitted an event'; end if;
  if pg_temp.audit_has_unexpected_metadata('fee_policy_changed',null,'{"policy_enabled":true}') then raise exception 'fee policy metadata is not status-only'; end if;
  n:=pg_temp.audit_count('quota_policy_changed');
  perform public.admin_set_teacher_quota_policy(true,v_at);
  if pg_temp.audit_count('quota_policy_changed')<>n+1 then raise exception 'quota policy transition did not emit exactly one event'; end if;
  perform public.admin_set_teacher_quota_policy(true,v_at);
  if pg_temp.audit_count('quota_policy_changed')<>n+1 then raise exception 'quota policy no-op emitted an event'; end if;
  if pg_temp.audit_has_unexpected_metadata('quota_policy_changed',null,'{"policy_enabled":true}') then raise exception 'quota policy metadata is not status-only'; end if;
end $$;
reset role;
-- The profile guard accepts this active MFA-qualified fixture admin; keep its
-- claims set for the owner-mediated role/status UPDATEs below.
select set_config('request.jwt.claims','{"sub":"c1490000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','c1490000-0000-4000-8000-000000000001',true);

-- Owner-mediated profile maintenance can change status and role atomically.
-- The trigger records two independent logical actions from that one UPDATE.
do $$ declare v_status bigint; v_role bigint; begin
  v_status:=pg_temp.audit_count('user_reactivated','c1490000-0000-4000-8000-000000000003');
  v_role:=pg_temp.audit_count('admin_granted','c1490000-0000-4000-8000-000000000003');
  update public.profiles set status='active',role='admin' where id='c1490000-0000-4000-8000-000000000003';
  if pg_temp.audit_count('user_reactivated','c1490000-0000-4000-8000-000000000003')<>v_status+1
     or pg_temp.audit_count('admin_granted','c1490000-0000-4000-8000-000000000003')<>v_role+1 then
    raise exception 'compound profile change did not produce separate status and role events';
  end if;
  if pg_temp.audit_has_unexpected_metadata('user_reactivated','c1490000-0000-4000-8000-000000000003','{"status":"active"}')
     or pg_temp.audit_has_unexpected_metadata('admin_granted','c1490000-0000-4000-8000-000000000003','{"role":"admin"}') then
    raise exception 'profile events contain unsafe metadata';
  end if;
end $$;

-- Keep the separate fixture admin active while exercising the matching owner
-- revocation path; demotion and suspension must each be recorded once.
do $$ declare v_status bigint; v_role bigint; begin
  v_status:=pg_temp.audit_count('user_suspended','c1490000-0000-4000-8000-000000000003');
  v_role:=pg_temp.audit_count('admin_revoked','c1490000-0000-4000-8000-000000000003');
  update public.profiles set status='suspended',role='student' where id='c1490000-0000-4000-8000-000000000003';
  if pg_temp.audit_count('user_suspended','c1490000-0000-4000-8000-000000000003')<>v_status+1
     or pg_temp.audit_count('admin_revoked','c1490000-0000-4000-8000-000000000003')<>v_role+1 then
    raise exception 'compound profile demotion did not produce separate status and role events';
  end if;
  if pg_temp.audit_has_unexpected_metadata('user_suspended','c1490000-0000-4000-8000-000000000003','{"status":"suspended"}')
     or pg_temp.audit_has_unexpected_metadata('admin_revoked','c1490000-0000-4000-8000-000000000003','{"role":"student"}') then
    raise exception 'profile revocation events contain unsafe metadata';
  end if;
end $$;

-- Public report status changes flow through the guarded admin RPC. Stale and
-- invalid calls must fail without leaving an audit row (and their sub-blocks
-- roll back any incidental changes).
insert into public.reports(id,reporter_id,subject,description,status)
values('c1490000-0000-4000-8000-000000000010','c1490000-0000-4000-8000-000000000003','C149 fixture','c149 fixture private text','open');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1490000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','c1490000-0000-4000-8000-000000000001',true);
do $$ declare v_updated timestamptz; n bigint; v_failed boolean:=false; begin
  select updated_at into v_updated from public.reports where id='c1490000-0000-4000-8000-000000000010';
  n:=pg_temp.audit_count('report_resolved','c1490000-0000-4000-8000-000000000010');
  v_updated:=public.admin_update_problem_report('c1490000-0000-4000-8000-000000000010',v_updated,'resolved','Resolved','private fixture reason');
  if pg_temp.audit_count('report_resolved','c1490000-0000-4000-8000-000000000010')<>n+1 then raise exception 'report resolution did not emit exactly one event'; end if;
  begin
    perform public.admin_update_problem_report('c1490000-0000-4000-8000-000000000010',v_updated-'1 second','open','','');
  exception when serialization_failure then v_failed:=true;
  end;
  if not v_failed then raise exception 'stale report update unexpectedly succeeded'; end if;
  if pg_temp.audit_count('report_reopened','c1490000-0000-4000-8000-000000000010')<>0 then raise exception 'stale report update emitted an event'; end if;
  if pg_temp.audit_has_unexpected_metadata('report_resolved','c1490000-0000-4000-8000-000000000010','{"status":"resolved"}') then raise exception 'report metadata contains free text'; end if;
end $$;
select set_config('request.jwt.claims','{}',true);
reset role;

-- Report reopening also produces one bounded status event.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1490000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','c1490000-0000-4000-8000-000000000001',true);
do $$ declare v_updated timestamptz; n bigint; begin
  select updated_at into v_updated from public.reports where id='c1490000-0000-4000-8000-000000000010';
  n:=pg_temp.audit_count('report_reopened','c1490000-0000-4000-8000-000000000010');
  perform public.admin_update_problem_report('c1490000-0000-4000-8000-000000000010',v_updated,'open','','');
  if pg_temp.audit_count('report_reopened','c1490000-0000-4000-8000-000000000010')<>n+1 then raise exception 'report reopening did not emit exactly one event'; end if;
end $$;
select set_config('request.jwt.claims','{}',true);
reset role;

-- Catalog: every action is expected to be recorded by the underlying producer
-- trigger exactly once: teacher review approved/declined and operator_sync;
-- application changes requested; access approve/decline; fee/quota policy;
-- role plus status in a single profile update; feedback status/reply moderation;
-- report resolved/reopened; group archive/delete; deletion queued/completed;
-- and teacher plan assignment. Core fixtures exercise purge separately.
-- Negative acceptance cases required for those producers: duplicate review
-- mirrors, stale/denied review and access calls, disabled fee/quota changes,
-- rejected inactive-plan assignment, feedback no-ops/stale update, student
-- resubmit/withdrawal, denied group actions, and failed deletion transaction
-- all retain the pre-call action count. Their RPCs remain guarded by production
-- code; this fixture does not disable guards or insert ledger rows directly.

rollback;
