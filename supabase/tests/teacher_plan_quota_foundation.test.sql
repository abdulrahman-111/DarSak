-- Run with `supabase test db` after migration. These contract checks deliberately
-- do not modify the policy singleton or any teacher data.
begin;
select plan(6);
select ok((select not quotas_enabled from dars_private.teacher_quota_policy where singleton), 'quotas default off');
select is((select effective_at from dars_private.teacher_quota_policy where singleton), '2026-11-14 22:00:00+00'::timestamptz, 'earliest activation is midnight Cairo on 15 November');
select ok(not dars_private.plan_quota_active(), 'quota enforcement is inactive by default regardless of current date');
select has_function('public','teacher_plan_status',array[]::text[], 'teacher plan status RPC exists');
select has_function('public','admin_teacher_plan_status',array['uuid'], 'admin status RPC exists');
select has_function('public','admin_assign_teacher_plan',array['uuid','text','bigint','text'], 'manual assignment RPC exists');
select * from finish();
rollback;
