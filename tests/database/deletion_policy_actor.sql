\set ON_ERROR_STOP on
begin;

-- Deleting the admin who last updated the quota policy must clear only its
-- attribution FK. Policy values and append-only history remain intact.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
 ('71600000-0000-4000-8000-000000000001','authenticated','authenticated','policy-actor@test.invalid','{"provider":"google"}','{}'),
 ('71600000-0000-4000-8000-000000000002','authenticated','authenticated','policy-remaining@test.invalid','{"provider":"google"}','{}');

-- Google identities stay pending in the auth trigger; seed the domain profiles
-- directly so these account-deletion actors remain eligible active admins.
delete from dars_private.pending_google_signups where user_id in (
 '71600000-0000-4000-8000-000000000001','71600000-0000-4000-8000-000000000002'
);

insert into public.profiles(id,full_name,role,status) values
 ('71600000-0000-4000-8000-000000000001','Policy Actor','admin','active'),
 ('71600000-0000-4000-8000-000000000002','Remaining Policy Admin','admin','active');

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','71600000-0000-4000-8000-000000000002',
  'role','authenticated',
  'aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from clock_timestamp())::bigint))
)::text,true);
select set_config('request.jwt.claim.sub','71600000-0000-4000-8000-000000000002',true);
update public.profiles set status='suspended'
where role='admin' and status='active'
  and id not in ('71600000-0000-4000-8000-000000000001','71600000-0000-4000-8000-000000000002');

-- Keep representative immutable plan and access history rows in the fixture.
insert into dars_private.teacher_plan_assignments
  (teacher_id,plan_code,starts_at,expires_at,transaction_reference,assigned_by,entitlement_version)
values
  ('71610000-0000-4000-8000-000000000001','standard','2026-11-15 00:00:00+00','2026-12-15 00:00:00+00','deletion-policy-actor-plan-history','71600000-0000-4000-8000-000000000001',1);
insert into dars_private.teacher_access_grants
  (teacher_id,starts_at,expires_at,source,actor_id)
values
  ('71610000-0000-4000-8000-000000000001','2026-11-15 00:00:00+00','2026-12-15 00:00:00+00','signup','71600000-0000-4000-8000-000000000001');

-- Drive the actual policy update RPC as an active admin with an explicit AAL2
-- TOTP AMR claim, compatible with deployments that enforce MFA on admin writes.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','71600000-0000-4000-8000-000000000001',
  'role','authenticated',
  'aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from clock_timestamp())::bigint))
)::text,true);
select set_config('request.jwt.claim.sub','71600000-0000-4000-8000-000000000001',true);
select public.admin_set_teacher_quota_policy(false,'2026-11-15 00:00:00+00');
reset role;

do $$
declare
  v_enabled boolean;
  v_effective_at timestamptz;
  v_updated_at timestamptz;
  v_request jsonb;
begin
  select quotas_enabled,effective_at,updated_at
    into strict v_enabled,v_effective_at,v_updated_at
  from dars_private.teacher_quota_policy where singleton;
  if (select updated_by from dars_private.teacher_quota_policy where singleton)
       is distinct from '71600000-0000-4000-8000-000000000001'::uuid then
    raise exception 'policy fixture did not record the deleting admin as actor';
  end if;

  v_request:=public.account_deletion_prepare('71600000-0000-4000-8000-000000000001',null,null,'password');
  if v_request->>'state'<>'queued'
     or exists(select 1 from public.profiles where id='71600000-0000-4000-8000-000000000001') then
    raise exception 'deleting a non-last policy actor did not prepare account deletion';
  end if;
  if (select updated_by from dars_private.teacher_quota_policy where singleton) is not null
     or (select quotas_enabled from dars_private.teacher_quota_policy where singleton) is distinct from v_enabled
     or (select effective_at from dars_private.teacher_quota_policy where singleton) is distinct from v_effective_at
     or (select updated_at from dars_private.teacher_quota_policy where singleton) is distinct from v_updated_at then
    raise exception 'policy actor deletion changed policy values or failed to clear attribution';
  end if;
  if not exists (
       select 1 from dars_private.account_deletion_requests
       where user_id='71600000-0000-4000-8000-000000000001' and state='queued'
     ) then
    raise exception 'prepared deletion request was not persisted';
  end if;
  if not exists (
       select 1 from dars_private.teacher_plan_assignments
       where transaction_reference='deletion-policy-actor-plan-history'
         and assigned_by='71600000-0000-4000-8000-000000000001' and entitlement_version=1
     ) or not exists (
       select 1 from dars_private.teacher_access_grants
       where teacher_id='71610000-0000-4000-8000-000000000001'
         and actor_id='71600000-0000-4000-8000-000000000001' and source='signup'
     ) then
    raise exception 'account deletion changed immutable plan or access history';
  end if;

  begin
    perform public.account_deletion_prepare('71600000-0000-4000-8000-000000000002',null,null,'password');
    raise exception 'last active admin deletion unexpectedly passed';
  exception when check_violation then
    if sqlerrm <> 'last_active_admin' then raise; end if;
  end;
  if not exists(select 1 from public.profiles where id='71600000-0000-4000-8000-000000000002' and status='active')
     or exists(select 1 from dars_private.account_deletion_requests where user_id='71600000-0000-4000-8000-000000000002') then
    raise exception 'last-admin denial changed profile or queued deletion';
  end if;
end $$;

rollback;
