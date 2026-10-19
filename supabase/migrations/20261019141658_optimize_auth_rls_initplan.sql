begin;

do $$
declare
  r record;
  v_policy_count integer;
  v_after text;
begin
  select count(*) into v_policy_count
  from pg_policies p
  join (values
    ('lesson_attendance','lesson_attendance_private_read'),
    ('student_saved_groups','student_saved_groups_read_own'),
    ('student_saved_groups','student_saved_groups_delete_own'),
    ('teacher_applications','teacher_applications_authorized_read'),
    ('user_notifications','user_notifications_own_active_read')
  ) expected(tablename,policyname)
    on expected.tablename=p.tablename and expected.policyname=p.policyname
  where p.schemaname='public';

  if v_policy_count<>5 then
    raise exception 'expected exactly the five targeted public RLS policies, found %',v_policy_count;
  end if;

  -- Build each replacement from the live catalog predicate. This preserves
  -- every existing guard, including helpers that may not appear in a source
  -- migration copy. Only auth.uid() is wrapped in an uncorrelated subquery.
  for r in
    select p.tablename,p.policyname,p.qual
    from pg_policies p
    join (values
      ('lesson_attendance','lesson_attendance_private_read'),
      ('student_saved_groups','student_saved_groups_read_own'),
      ('student_saved_groups','student_saved_groups_delete_own'),
      ('teacher_applications','teacher_applications_authorized_read'),
      ('user_notifications','user_notifications_own_active_read')
    ) expected(tablename,policyname)
      on expected.tablename=p.tablename and expected.policyname=p.policyname
    where p.schemaname='public'
    order by p.tablename,p.policyname
  loop
    execute format(
      'alter policy %I on public.%I using (%s)',
      r.policyname,
      r.tablename,
      replace(r.qual,'auth.uid()','(select auth.uid())')
    );

    select p.qual into v_after
    from pg_policies p
    where p.schemaname='public'
      and p.tablename=r.tablename
      and p.policyname=r.policyname;

    if regexp_replace(r.qual, '\(\s*SELECT\s+auth\.uid\(\)(\s+AS\s+uid)?\s*\)', 'auth.uid()', 'gi')
       is distinct from
       regexp_replace(v_after, '\(\s*SELECT\s+auth\.uid\(\)(\s+AS\s+uid)?\s*\)', 'auth.uid()', 'gi') then
      raise exception 'auth.uid() scalar wrapping changed predicate %.%',r.tablename,r.policyname;
    end if;
  end loop;
end $$;

commit;
