begin;

create or replace function public.my_group_feedback(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_own jsonb;
  v_reason text;
begin
  if public.current_role() is distinct from 'student'::public.user_role then
    raise exception 'student required' using errcode='42501';
  end if;

  select jsonb_build_object('id',id,'rating',rating,'comment',comment,'status',status,'version',version)
  into v_own
  from dars_private.group_feedback
  where group_id=p_group_id and student_id=auth.uid();

  if not exists (
    select 1 from public.enrollments e
    join public.profiles p on p.id=e.student_id and p.role='student' and p.status='active'
    where e.group_id=p_group_id and e.student_id=auth.uid() and e.status='accepted'
  ) then
    v_reason := 'accepted_enrollment_required';
  elsif not exists(select 1 from public.groups g where g.id=p_group_id and g.status='published') then
    v_reason := 'published_group_required';
  elsif not exists (
    select 1 from public.groups g
    join public.profiles tp on tp.id=g.teacher_id and tp.role='teacher' and tp.status='active'
    join public.teacher_profiles t on t.id=tp.id and t.approved
    where g.id=p_group_id
  ) then
    v_reason := 'active_approved_teacher_required';
  elsif not exists (
    select 1 from public.lessons l
    where l.group_id=p_group_id and l.status<>'cancelled' and l.ends_at<=now()
  ) then
    v_reason := 'completed_lesson_required';
  elsif not exists (
    select 1 from public.lessons l
    join public.lesson_attendance a on a.lesson_id=l.id and a.student_id=auth.uid()
    where l.group_id=p_group_id and l.status<>'cancelled' and l.ends_at<=now()
      and a.status in ('present','late')
  ) then
    v_reason := 'present_or_late_attendance_required';
  else
    v_reason := 'eligible';
  end if;

  return jsonb_build_object('eligible',v_reason='eligible','reason',v_reason,'own',v_own);
end $$;

revoke all on function public.my_group_feedback(uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_group_feedback(uuid) to authenticated;

commit;
