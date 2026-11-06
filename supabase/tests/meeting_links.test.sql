create extension if not exists pgtap;
begin;
select plan(14);

select ok((select relrowsecurity from pg_class where oid='dars_private.lesson_meetings'::regclass), 'pilot compatible lesson table has RLS');
select ok((select relrowsecurity from pg_class where oid='dars_private.group_meeting_settings'::regclass), 'group settings table has RLS');
select ok(not exists(
  select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where c.oid='dars_private.lesson_meetings'::regclass and acl.grantee=0
    and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
), 'PUBLIC has no lesson table access');
select ok(not has_table_privilege('anon','dars_private.group_meeting_settings','SELECT,INSERT,UPDATE,DELETE'), 'anon has no group settings access');
select ok(not has_table_privilege('authenticated','dars_private.lesson_meetings','SELECT,INSERT,UPDATE,DELETE'), 'authenticated has no lesson table access');
select ok(not has_table_privilege('service_role','dars_private.group_meeting_settings','SELECT,INSERT,UPDATE,DELETE'), 'service_role has no group settings access');
select ok(has_function_privilege('authenticated','public.meeting_links(uuid[])','EXECUTE'), 'authenticated can call meeting links RPC');
select ok(not has_function_privilege('anon','public.meeting_links(uuid[])','EXECUTE'), 'anon cannot call meeting links RPC');
select ok(not has_function_privilege('service_role','public.group_meeting_settings(uuid)','EXECUTE'), 'service_role cannot call owner settings RPC');
select ok(not has_function_privilege('authenticated','dars_private.effective_meeting_url(uuid)','EXECUTE'), 'effective scalar helper is private');
select ok(dars_private.meeting_url_is_safe('https://meet.example.test/path'), 'database URL contract accepts generic HTTPS hosts');
select ok(not dars_private.meeting_url_is_safe('http://meet.example.test/path'), 'database URL contract rejects HTTP');
select ok(not dars_private.meeting_url_is_safe('https://user@meet.example.test/path'), 'database URL contract rejects userinfo');

select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name in ('groups','lessons') and column_name ilike '%meeting%url%'),0,'public group and lesson rows expose no meeting URL column');
select * from finish();
rollback;
