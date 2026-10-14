begin;

create table public.lesson_attendance (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('present','absent','late','excused')),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id),
  primary key (lesson_id, student_id)
);
create index lesson_attendance_student_idx on public.lesson_attendance(student_id, lesson_id);
alter table public.lesson_attendance enable row level security;
revoke all on public.lesson_attendance from public, anon, authenticated, service_role;
grant select on public.lesson_attendance to authenticated;
create policy lesson_attendance_private_read on public.lesson_attendance for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active')
  and (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
    or (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher') and exists(select 1 from public.groups g where g.id=(select l.group_id from public.lessons l where l.id=lesson_attendance.lesson_id) and g.teacher_id=auth.uid()))
    or (student_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='student') and exists(select 1 from public.enrollments e join public.lessons l on l.group_id=e.group_id where l.id=lesson_attendance.lesson_id and e.student_id=auth.uid() and e.status='accepted'))
  )
);

create or replace function public.set_lesson_attendance(p_lesson_id uuid,p_student_id uuid,p_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_group_id uuid; v_owner uuid; v_group_status public.group_status; v_starts_at timestamptz; v_lesson_status public.lesson_status;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved
  ) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('present','absent','late','excused') then
    raise exception 'invalid attendance status' using errcode='22023';
  end if;

  select g.id,g.teacher_id into v_group_id,v_owner
  from public.groups g join public.lessons l on l.group_id=g.id
  where l.id=p_lesson_id;
  if not found or v_owner<>auth.uid() then raise exception 'lesson not found' using errcode='42501'; end if;
  select status into v_group_status from public.groups where id=v_group_id and teacher_id=auth.uid() for update;
  if not found then raise exception 'lesson not found' using errcode='42501'; end if;
  select starts_at,status into v_starts_at,v_lesson_status from public.lessons where id=p_lesson_id and group_id=v_group_id for update;
  if not found then raise exception 'lesson not found' using errcode='P0002'; end if;
  if v_group_status='archived' then raise exception 'group archived' using errcode='22023'; end if;
  if v_lesson_status='cancelled' then raise exception 'lesson cancelled' using errcode='22023'; end if;
  if v_starts_at>now() then raise exception 'lesson has not started' using errcode='22023'; end if;
  perform 1 from public.enrollments e join public.profiles p on p.id=e.student_id
  where e.group_id=v_group_id and e.student_id=p_student_id and e.status='accepted' and p.role='student' for update of e;
  if not found then raise exception 'student is not currently accepted' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_status is null then
    delete from public.lesson_attendance where lesson_id=p_lesson_id and student_id=p_student_id;
  else
    insert into public.lesson_attendance(lesson_id,student_id,status,recorded_at,recorded_by)
    values(p_lesson_id,p_student_id,p_status,now(),auth.uid())
    on conflict(lesson_id,student_id) do update set status=excluded.status,recorded_at=excluded.recorded_at,recorded_by=excluded.recorded_by;
  end if;
end $$;

create or replace function public.teacher_lesson_attendance_page(p_lesson_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_total integer; v_rows jsonb; v_role public.user_role;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then
    raise exception 'invalid page' using errcode='22023';
  end if;
  select p.role into v_role from public.profiles p where p.id=auth.uid() and p.status='active';
  if v_role not in ('teacher','admin') or v_role is null then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id and (v_role='admin' or g.teacher_id=auth.uid())) then
    raise exception 'lesson not found' using errcode='42501';
  end if;
  select count(*)::integer into v_total from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.status='accepted' where l.id=p_lesson_id;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',q.student_id,'full_name',q.full_name,'status',q.status,'recorded_at',q.recorded_at) order by q.full_name,q.student_id),'[]'::jsonb)
  into v_rows from (
    select p.id student_id,p.full_name,a.status,a.recorded_at from public.lessons l
    join public.enrollments e on e.group_id=l.group_id and e.status='accepted'
    join public.profiles p on p.id=e.student_id
    left join public.lesson_attendance a on a.lesson_id=l.id and a.student_id=p.id
    where l.id=p_lesson_id order by p.full_name,p.id offset p_offset limit p_limit
  ) q;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

revoke all on function public.set_lesson_attendance(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.set_lesson_attendance(uuid,uuid,text) to authenticated;
revoke all on function public.teacher_lesson_attendance_page(uuid,integer,integer) from public,anon,service_role;
grant execute on function public.teacher_lesson_attendance_page(uuid,integer,integer) to authenticated;
commit;
