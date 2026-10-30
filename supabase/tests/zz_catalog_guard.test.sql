-- Issue #155: catalog-wide guards for application table and SECURITY DEFINER policy drift.
-- Exceptions below are intentionally narrow and documented at the point of use.
create extension if not exists pgtap;
begin;
select plan(13);

-- Application tables require RLS. These four narrow internal tables are intentional exceptions:
-- internal_profile_bio_syncs is a backend/transaction-keyed trigger recursion guard; teacher plan
-- assignments are an append-only audit log; entitlements and the singleton quota policy are read
-- only by SECURITY DEFINER service paths. Their migrations revoke direct grants from app roles.
select is((
  select count(*)::integer
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','dars_private')
    and c.relkind in ('r','p')
    and not c.relrowsecurity
    and not (n.nspname='dars_private' and c.relname in (
      'internal_profile_bio_syncs','teacher_plan_assignments','teacher_plan_entitlements','teacher_quota_policy'
    ))
),0,'every application table has RLS outside the four documented private internals');
select is((
  select count(*)::integer
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='dars_private' and c.relname in (
    'internal_profile_bio_syncs','teacher_plan_assignments','teacher_plan_entitlements','teacher_quota_policy'
  ) and c.relkind in ('r','p')
    and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
),0,'unprotected internal exceptions have no direct anon/authenticated table grants');
select is((
  select count(*)::integer
  from pg_namespace n
  cross join (values ('anon'::name),('authenticated'::name)) r(role_name)
  where n.nspname in ('public','dars_private')
    and has_schema_privilege(r.role_name,n.oid,'CREATE')
),0,'anon and authenticated cannot create objects in application schemas');

-- Anonymous SQL table privileges are limited to the public discovery reads. The list is the
-- specific API surface documented by the existing SELECT grants/policies; each may grant SELECT
-- only. RLS remains the row-level filter for this surface.
select is((
  select count(*)::integer
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','dars_private') and c.relkind in ('r','p')
    and has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not (n.nspname='public' and c.relname in (
      'education_nodes','subjects','offerings','groups','group_schedule_slots',
      'teacher_contacts','group_learning_details'
    ))
),0,'anon has no table privilege outside the documented discovery allowlist');
select is((
  select count(*)::integer
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
    and c.relname in (
      'education_nodes','subjects','offerings','groups','group_schedule_slots',
      'teacher_contacts','group_learning_details'
    )
    and has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
),0,'anon discovery table grants are SELECT-only');

-- Write policies may not accidentally become read policies. The two exact legacy exceptions are
-- narrow: teacher_specializations couples owner/admin membership writes with the same visibility,
-- and platform_settings is admin-only configuration. No other FOR ALL policy is accepted.
select is((
  select count(*)::integer
  from pg_policy p
  join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','dars_private') and p.polcmd='*'
    and not (n.nspname='public' and c.relname='teacher_specializations' and p.polname='specialization_all')
    and not (n.nspname='public' and c.relname='platform_settings' and p.polname='settings_admin')
),0,'FOR ALL policies are limited to the two documented legacy cases');

-- Every SECURITY DEFINER function must declare a literal function-level search_path. PostgreSQL
-- implicitly searches pg_catalog first; fixed historical paths such as public,auth remain valid.
-- Reject $user and pg_temp entries because their resolution can be controlled by the caller.
select is((
  select count(*)::integer
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','dars_private') and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) as cfg(setting)
      where setting ~* '^search_path\s*='
        and position('$user' in lower(setting))=0
        and (position('pg_temp' in lower(setting))=0 or
          (regexp_count(lower(setting),'pg_temp')=1 and lower(setting) ~ 'pg_temp(_[0-9]+)?[" ]*$'))
    )
),0,'all application SECURITY DEFINER functions have a fixed caller-independent search_path');

-- PUBLIC gets EXECUTE on new functions by PostgreSQL default, so every SECURITY DEFINER function
-- must explicitly revoke that default. An explicit role grant to anon/authenticated remains valid.
select is((
  select count(*)::integer
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  where n.nspname in ('public','dars_private') and p.prosecdef
    and acl.grantee=0 and acl.privilege_type='EXECUTE'
),0,'PUBLIC cannot execute application SECURITY DEFINER functions');

-- Personal data must not be exposed through a permissive policy applying to authenticated users.
-- A PUBLIC policy also applies to authenticated, so it is included in the role check.
select is((
  select count(*)::integer
  from pg_policy p
  join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('profiles','enrollments','lessons','lesson_materials','lesson_attendance',
      'user_notifications','group_assignments','assignment_submissions','booking_slots','booking_requests')
    and (0=any(p.polroles) or 'authenticated'::regrole::oid=any(p.polroles))
    and pg_get_expr(p.polqual,p.polrelid)='true'
),0,'personal-data tables have no unfiltered authenticated policy');

-- Negative controls prove the same catalog predicates catch a future unprotected table and an
-- unsafe SECURITY DEFINER function. Both objects are rolled back with this test transaction.
create table public.catalog_guard_probe_no_rls(id integer primary key);
select is((
  select count(*)::integer
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','dars_private') and c.relkind in ('r','p')
    and not c.relrowsecurity and not (n.nspname='dars_private' and c.relname in (
      'internal_profile_bio_syncs','teacher_plan_assignments','teacher_plan_entitlements','teacher_quota_policy'
    ))
    and c.relname='catalog_guard_probe_no_rls'
),1,'negative control: catalog predicate catches an application table without RLS');

create function public.catalog_guard_probe_unsafe_definer() returns integer
language sql security definer as $$ select 1 $$;
select is((
  select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','dars_private') and p.prosecdef
    and p.proname='catalog_guard_probe_unsafe_definer'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) as cfg(setting)
      where setting ~* '^search_path\s*='
        and position('$user' in lower(setting))=0
        and (position('pg_temp' in lower(setting))=0 or
          (regexp_count(lower(setting),'pg_temp')=1 and lower(setting) ~ 'pg_temp(_[0-9]+)?[" ]*$'))
    )
),1,'negative control: catalog predicate catches a SECURITY DEFINER function without fixed search_path');
select is((
  select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  where n.nspname='public' and p.proname='catalog_guard_probe_unsafe_definer'
    and acl.grantee=0 and acl.privilege_type='EXECUTE'
),1,'negative control: catalog predicate catches PUBLIC execute on a SECURITY DEFINER function');

create table public.catalog_guard_probe_open_policy(id integer primary key);
alter table public.catalog_guard_probe_open_policy enable row level security;
create policy catalog_guard_probe_open_policy on public.catalog_guard_probe_open_policy
  for select to authenticated using (true);
select is((
  select count(*)::integer
  from pg_policy p
  join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='catalog_guard_probe_open_policy'
    and (0=any(p.polroles) or 'authenticated'::regrole::oid=any(p.polroles))
    and pg_get_expr(p.polqual,p.polrelid)='true'
),1,'negative control: predicate catches an unfiltered authenticated policy');

select * from finish();
rollback;
