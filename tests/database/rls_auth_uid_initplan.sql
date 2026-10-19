\set ON_ERROR_STOP on
begin;

-- Keep the advisor fix tightly scoped: these are the five known flagged
-- policies, and wrapping auth.uid() must not change their roles or commands.
do $$
declare
  v_policy_count integer;
begin
  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public'
    and policyname in (
      'lesson_attendance_private_read',
      'student_saved_groups_read_own',
      'student_saved_groups_delete_own',
      'teacher_applications_authorized_read',
      'user_notifications_own_active_read'
    );
  if v_policy_count<>5 then raise exception 'expected exactly the five targeted RLS policies, found %',v_policy_count; end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.policyname in (
        'lesson_attendance_private_read',
        'student_saved_groups_read_own',
        'student_saved_groups_delete_own',
        'teacher_applications_authorized_read',
        'user_notifications_own_active_read'
      )
      and (
        p.roles<>array['authenticated']::name[]
        or p.permissive<>'PERMISSIVE'
        or (p.tablename='lesson_attendance' and (p.policyname<>'lesson_attendance_private_read' or p.cmd<>'SELECT'))
        or (p.tablename='student_saved_groups' and p.policyname='student_saved_groups_read_own' and p.cmd<>'SELECT')
        or (p.tablename='student_saved_groups' and p.policyname='student_saved_groups_delete_own' and p.cmd<>'DELETE')
        or (p.tablename='teacher_applications' and (p.policyname<>'teacher_applications_authorized_read' or p.cmd<>'SELECT'))
        or (p.tablename='user_notifications' and (p.policyname<>'user_notifications_own_active_read' or p.cmd<>'SELECT'))
        or p.tablename not in ('lesson_attendance','student_saved_groups','teacher_applications','user_notifications')
      )
  ) then raise exception 'targeted policy table, role, permissiveness, or command changed'; end if;

  -- Remove only the scalar wrapper before checking for leftover direct calls.
  if exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.policyname in (
        'lesson_attendance_private_read',
        'student_saved_groups_read_own',
        'student_saved_groups_delete_own',
        'teacher_applications_authorized_read',
        'user_notifications_own_active_read'
      )
      and regexp_replace(p.qual, '\(\s*SELECT\s+auth\.uid\(\)(\s+AS\s+uid)?\s*\)', '', 'gi') ~* 'auth\.uid\s*\('
  ) then raise exception 'a targeted RLS predicate still calls auth.uid() directly'; end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.policyname in (
        'lesson_attendance_private_read',
        'student_saved_groups_read_own',
        'student_saved_groups_delete_own',
        'teacher_applications_authorized_read',
        'user_notifications_own_active_read'
      )
      and regexp_count(p.qual, 'auth\.uid\s*\(') <> case p.policyname
        when 'lesson_attendance_private_read' then 7
        when 'student_saved_groups_read_own' then 2
        when 'student_saved_groups_delete_own' then 2
        when 'teacher_applications_authorized_read' then 3
        when 'user_notifications_own_active_read' then 1
      end
  ) then raise exception 'a targeted RLS predicate lost or added an auth.uid() reference'; end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public'
      and p.tablename='lesson_attendance'
      and p.policyname='lesson_attendance_private_read'
      and p.qual like '%dars_private.teacher_has_access%'
  ) then raise exception 'lesson attendance access helper guard was lost'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7ff00000-0000-4000-8000-000000000001','authenticated','authenticated','rls-initplan-one@test.invalid','{"full_name":"Initplan One","requested_role":"student"}'),
 ('7ff00000-0000-4000-8000-000000000002','authenticated','authenticated','rls-initplan-two@test.invalid','{"full_name":"Initplan Two","requested_role":"student"}'),
 ('7ff00000-0000-4000-8000-000000000003','authenticated','authenticated','rls-initplan-suspended@test.invalid','{"full_name":"Initplan Suspended","requested_role":"student"}');

-- The existing notifications policy is the simplest behavioral fixture for
-- proving owner isolation and active-account denial under the new expression.
set local session_replication_role=replica;
update public.profiles set status='suspended' where id='7ff00000-0000-4000-8000-000000000003';
set local session_replication_role=origin;
insert into public.user_notifications(recipient_id,kind,event_key,payload) values
 ('7ff00000-0000-4000-8000-000000000001','lesson_rescheduled','rls-initplan-own','{}'),
 ('7ff00000-0000-4000-8000-000000000002','lesson_rescheduled','rls-initplan-other','{}'),
 ('7ff00000-0000-4000-8000-000000000003','lesson_rescheduled','rls-initplan-suspended','{}');

set local role authenticated;
set local request.jwt.claim.sub='7ff00000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.user_notifications)<>1
    or not exists(select 1 from public.user_notifications where event_key='rls-initplan-own')
    or exists(select 1 from public.user_notifications where event_key<>'rls-initplan-own') then
    raise exception 'active user notification policy lost owner isolation';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7ff00000-0000-4000-8000-000000000003';
do $$ begin
  if exists(select 1 from public.user_notifications) then
    raise exception 'suspended account retained notification access';
  end if;
end $$;
reset role;

rollback;
select 'auth.uid() RLS initplan SQL assertions passed' as result;
