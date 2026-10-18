begin;

-- An enrolled learning space is independent of public discovery eligibility.
-- Contacts deliberately stay outside this projection and use their existing RLS.
create function public.student_class_detail(p_group_id uuid)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,auth
as $$
 select jsonb_build_object(
  'id',g.id,'name',g.name,'description',g.description,'status',g.status,'location',g.location,
  'teacher_id',g.teacher_id,'teacher_name',p.full_name,'teacher_headline',t.headline,
  'teacher_available',p.status='active' and t.approved,
  'subject',jsonb_build_object('name_en',s.name_en,'name_ar',s.name_ar),
  'category',jsonb_build_object('name_en',n.name_en,'name_ar',n.name_ar),
  'enrollment_id',e.id,
  'learning',(select to_jsonb(d) from public.group_learning_details d where d.group_id=g.id),
  'attendance',(select jsonb_build_object(
    'present',count(*) filter(where a.status='present'),
    'late',count(*) filter(where a.status='late'),
    'absent',count(*) filter(where a.status='absent'),
    'excused',count(*) filter(where a.status='excused')
   ) from public.lesson_attendance a join public.lessons l on l.id=a.lesson_id
    where l.group_id=g.id and a.student_id=auth.uid())
 )
 from public.groups g
 join public.enrollments e on e.group_id=g.id and e.student_id=auth.uid() and e.status='accepted'
 join public.profiles p on p.id=g.teacher_id
 join public.teacher_profiles t on t.id=g.teacher_id
 join public.offerings o on o.id=g.offering_id
 join public.subjects s on s.id=o.subject_id
 join public.education_nodes n on n.id=o.node_id
 where g.id=p_group_id and exists(
   select 1 from public.profiles me where me.id=auth.uid() and me.role='student' and me.status='active'
 );
$$;
revoke all on function public.student_class_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function public.student_class_detail(uuid) to authenticated;

commit;
