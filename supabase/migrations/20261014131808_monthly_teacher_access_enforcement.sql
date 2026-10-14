begin;

-- Latest source: supabase/migrations/202609190001_foundation.sql
CREATE OR REPLACE FUNCTION public.is_group_owner(gid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
select exists(select 1 from public.groups g join public.profiles p on p.id=g.teacher_id where g.id=gid and g.teacher_id=auth.uid() and p.role='teacher' and p.status='active' and dars_private.teacher_has_access(g.teacher_id)) $function$;
-- RLS published-group arms run as anon as well as authenticated; the helper
-- returns only current-access eligibility and has no table privileges.
grant usage on schema dars_private to anon,authenticated;
grant execute on function dars_private.teacher_has_access(uuid) to anon;
alter policy groups_read on public.groups using (
  (status='published' and exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
   where p.id=groups.teacher_id and p.role='teacher' and p.status='active' and t.approved and dars_private.teacher_has_access(p.id)))
  or public.is_group_owner(id) or (select public.current_role())='admin' or public.is_group_member(id));
alter policy groups_write on public.groups using (public.is_group_owner(id) or (select public.current_role())='admin')
 with check ((teacher_id=(select auth.uid()) and (select public.current_role())='teacher' and (select public.is_active_user()) and dars_private.teacher_has_access(teacher_id))
   or (select public.current_role())='admin');
alter policy slots_read on public.group_schedule_slots using (exists(select 1 from public.groups g where g.id=group_schedule_slots.group_id and (
 public.is_group_owner(g.id) or (select public.current_role())='admin' or public.is_group_member(g.id) or
 (g.status='published' and exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=g.teacher_id and p.role='teacher' and p.status='active' and t.approved and dars_private.teacher_has_access(p.id))))));
alter policy slots_write on public.group_schedule_slots using (exists(select 1 from public.groups g where g.id=group_schedule_slots.group_id and (public.is_group_owner(g.id) or (select public.current_role())='admin')))
 with check (exists(select 1 from public.groups g where g.id=group_schedule_slots.group_id and (public.is_group_owner(g.id) or (select public.current_role())='admin')));
alter policy enrollment_read on public.enrollments using (student_id=(select auth.uid()) or public.is_group_owner(group_id) or (select public.current_role())='admin');
alter policy material_write on public.lesson_materials using ((select public.current_role())='admin' or (uploaded_by=(select auth.uid()) and (select public.is_active_user()) and exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where l.id=lesson_materials.lesson_id and public.is_group_owner(g.id))))
 with check ((select public.current_role())='admin' or (uploaded_by=(select auth.uid()) and (select public.is_active_user()) and ((kind<>'file') or storage_path~('^'||(select auth.uid())::text||'/'||lesson_id::text||'/[^/]+$')) and exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where l.id=lesson_materials.lesson_id and public.is_group_owner(g.id))));
alter policy group_pinned_announcements_read_authorized on public.group_pinned_announcements using (
 exists(select 1 from public.groups g join public.profiles p on p.id=g.teacher_id where g.id=group_pinned_announcements.group_id and g.teacher_id=(select auth.uid()) and p.role='teacher' and p.status='active' and dars_private.teacher_has_access(g.teacher_id))
 or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.status='active')
 or exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.group_id=group_pinned_announcements.group_id and e.student_id=(select auth.uid()) and e.status='accepted' and p.role='student' and p.status='active'));
alter policy lesson_attendance_private_read on public.lesson_attendance using (
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active') and (
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
 or (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher') and exists(select 1 from public.groups g where g.id=(select l.group_id from public.lessons l where l.id=lesson_attendance.lesson_id) and g.teacher_id=auth.uid() and dars_private.teacher_has_access(g.teacher_id)))
 or (student_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='student') and exists(select 1 from public.enrollments e join public.lessons l on l.group_id=e.group_id where l.id=lesson_attendance.lesson_id and e.student_id=auth.uid() and e.status='accepted'))));
-- Latest source: supabase/migrations/20260929092716_security_hardening.sql
CREATE OR REPLACE FUNCTION public.public_groups()
 RETURNS TABLE(id uuid, teacher_id uuid, offering_id uuid, name text, description text, capacity integer, status group_status, location text, created_at timestamp with time zone, teacher_name text, subject_name_ar text, subject_name_en text, node_name_ar text, node_name_en text, accepted_count bigint, available_seats bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
select
  g.id,g.teacher_id,g.offering_id,g.name,g.description,g.capacity,g.status,g.location,g.created_at,
  p.full_name,s.name_ar,s.name_en,n.name_ar,n.name_en,
  count(e.id) filter(where e.status='accepted') as accepted_count,
  greatest(g.capacity::bigint-count(e.id) filter(where e.status='accepted'),0::bigint) as available_seats
from public.groups g
join public.profiles p on p.id=g.teacher_id and p.role='teacher' and p.status='active'
join public.teacher_profiles tp on tp.id=p.id and tp.approved=true and dars_private.teacher_has_access(g.teacher_id)
join public.offerings o on o.id=g.offering_id
join public.subjects s on s.id=o.subject_id
join public.education_nodes n on n.id=o.node_id
left join public.enrollments e on e.group_id=g.id
where g.status='published'
group by g.id,p.full_name,s.name_ar,s.name_en,n.name_ar,n.name_en
$function$;
-- Latest source: supabase/migrations/20261014072112_optimize_group_discovery.sql
CREATE OR REPLACE FUNCTION public.discover_groups(p_subject_id uuid DEFAULT NULL::uuid, p_node_id uuid DEFAULT NULL::uuid, p_teacher_id uuid DEFAULT NULL::uuid, p_weekday integer DEFAULT NULL::integer, p_has_seats boolean DEFAULT false, p_query text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, teacher_id uuid, offering_id uuid, name text, description text, capacity integer, status group_status, location text, created_at timestamp with time zone, teacher_name text, subject_name_ar text, subject_name_en text, node_name_ar text, node_name_en text, accepted_count bigint, available_seats bigint, weekdays integer[], next_lesson_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if p_offset is null or p_offset < 0 then
    raise exception 'offset must be zero or greater' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit must be between 1 and 50' using errcode = '22023';
  end if;
  if p_weekday is not null and p_weekday not between 0 and 6 then
    raise exception 'weekday must be between 0 and 6' using errcode = '22023';
  end if;
  if p_query is not null and char_length(p_query) > 120 then
    raise exception 'query must be at most 120 characters' using errcode = '22023';
  end if;

  return query
  with recursive descendant_nodes(id) as (
    select n.id from public.education_nodes n where n.id = p_node_id
    union
    select child.id
    from public.education_nodes child
    join descendant_nodes parent on child.parent_id = parent.id
  ), eligible_groups as (
    select g.id, g.teacher_id, g.offering_id, g.name, g.description,
      g.capacity, g.status, g.location, g.created_at,
      p.full_name as teacher_name, s.name_ar as subject_name_ar,
      s.name_en as subject_name_en, n.name_ar as node_name_ar,
      n.name_en as node_name_en
    from public.groups g
    join public.profiles p on p.id = g.teacher_id
      and p.role = 'teacher' and p.status = 'active'
    join public.teacher_profiles tp on tp.id = p.id and tp.approved = true and dars_private.teacher_has_access(g.teacher_id)
    join public.offerings o on o.id = g.offering_id
    join public.subjects s on s.id = o.subject_id
    join public.education_nodes n on n.id = o.node_id
    where g.status = 'published'
      and (p_subject_id is null or o.subject_id = p_subject_id)
      and (p_node_id is null or o.node_id in (select dn.id from descendant_nodes dn))
      and (p_teacher_id is null or g.teacher_id = p_teacher_id)
      and (p_weekday is null or exists (
        select 1 from public.group_schedule_slots slot
        where slot.group_id = g.id and slot.weekday = p_weekday
      ))
      and (v_query = '' or position(v_query in lower(concat_ws(' ',
        g.name, g.description, g.location, p.full_name,
        s.name_ar, s.name_en, n.name_ar, n.name_en
      ))) > 0)
  ), counts as (
    select eg.*, count(e.id) filter (where e.status = 'accepted') as accepted_count
    from eligible_groups eg
    left join public.enrollments e on e.group_id = eg.id
    group by eg.id, eg.teacher_id, eg.offering_id, eg.name, eg.description,
      eg.capacity, eg.status, eg.location, eg.created_at, eg.teacher_name,
      eg.subject_name_ar, eg.subject_name_en, eg.node_name_ar, eg.node_name_en
  ), eligible_page as (
    select c.*,
      greatest(c.capacity::bigint - c.accepted_count, 0::bigint) as available_seats
    from counts c
    where p_has_seats is distinct from true
      or greatest(c.capacity::bigint - c.accepted_count, 0::bigint) > 0
    order by c.id
    offset p_offset
    limit p_limit
  )
  select pg.id, pg.teacher_id, pg.offering_id, pg.name, pg.description,
    pg.capacity, pg.status, pg.location, pg.created_at, pg.teacher_name,
    pg.subject_name_ar, pg.subject_name_en, pg.node_name_ar, pg.node_name_en,
    pg.accepted_count, pg.available_seats,
    coalesce(schedule.weekdays, array[]::integer[]), upcoming.next_lesson_at
  from eligible_page pg
  left join lateral (
    select array_agg(distinct slot.weekday order by slot.weekday)::integer[] as weekdays
    from public.group_schedule_slots slot where slot.group_id = pg.id
  ) schedule on true
  left join lateral (
    select min(l.starts_at) as next_lesson_at
    from public.lessons l
    where l.group_id = pg.id and l.status = 'scheduled'
      and l.starts_at > statement_timestamp()
  ) upcoming on true
  order by pg.id;
end;
$function$;
-- Latest source: supabase/migrations/20261014072112_optimize_group_discovery.sql
CREATE OR REPLACE FUNCTION public.public_group_detail(p_group_id uuid)
 RETURNS TABLE(id uuid, teacher_id uuid, offering_id uuid, name text, description text, capacity integer, status group_status, location text, created_at timestamp with time zone, teacher_name text, subject_name_ar text, subject_name_en text, node_name_ar text, node_name_en text, accepted_count bigint, available_seats bigint, weekdays integer[], next_lesson_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with eligible_group as (
    select g.id, g.teacher_id, g.offering_id, g.name, g.description,
      g.capacity, g.status, g.location, g.created_at,
      p.full_name as teacher_name, s.name_ar as subject_name_ar,
      s.name_en as subject_name_en, n.name_ar as node_name_ar,
      n.name_en as node_name_en
    from public.groups g
    join public.profiles p on p.id = g.teacher_id
      and p.role = 'teacher' and p.status = 'active'
    join public.teacher_profiles tp on tp.id = p.id and tp.approved = true and dars_private.teacher_has_access(g.teacher_id)
    join public.offerings o on o.id = g.offering_id
    join public.subjects s on s.id = o.subject_id
    join public.education_nodes n on n.id = o.node_id
    where g.id = p_group_id and g.status = 'published'
  ), counted_group as (
    select eg.*, count(e.id) filter (where e.status = 'accepted') as accepted_count
    from eligible_group eg
    left join public.enrollments e on e.group_id = eg.id
    group by eg.id, eg.teacher_id, eg.offering_id, eg.name, eg.description,
      eg.capacity, eg.status, eg.location, eg.created_at, eg.teacher_name,
      eg.subject_name_ar, eg.subject_name_en, eg.node_name_ar, eg.node_name_en
  )
  select g.id, g.teacher_id, g.offering_id, g.name, g.description,
    g.capacity, g.status, g.location, g.created_at, g.teacher_name,
    g.subject_name_ar, g.subject_name_en, g.node_name_ar, g.node_name_en,
    g.accepted_count, greatest(g.capacity::bigint - g.accepted_count, 0::bigint),
    coalesce(schedule.weekdays, array[]::integer[]), upcoming.next_lesson_at
  from counted_group g
  left join lateral (
    select array_agg(distinct slot.weekday order by slot.weekday)::integer[] as weekdays
    from public.group_schedule_slots slot where slot.group_id = g.id
  ) schedule on true
  left join lateral (
    select min(l.starts_at) as next_lesson_at
    from public.lessons l
    where l.group_id = g.id and l.status = 'scheduled'
      and l.starts_at > statement_timestamp()
  ) upcoming on true
$function$;
-- Latest source: supabase/migrations/20261014071627_public_teacher_choices.sql
CREATE OR REPLACE FUNCTION public.public_teacher_choices(p_search text DEFAULT NULL::text, p_selected uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with eligible as (
    select p.id, p.full_name
    from public.profiles p
    join public.teacher_profiles t on t.id=p.id
    where p.role='teacher'::public.user_role
      and p.status='active'::public.user_status
      and t.approved=true and dars_private.teacher_has_access(p.id)
  ), matches as (
    select e.id, e.full_name
    from eligible e
    where nullif(left(trim(coalesce(p_search,'')),80),'') is null
       or position(lower(left(trim(p_search),80)) in lower(e.full_name)) > 0
    order by e.full_name, e.id
    limit 50
  )
  select m.id, m.full_name from matches m
  union
  select e.id, e.full_name from eligible e where p_selected is not null and e.id=p_selected
  order by full_name, id
$function$;
-- Latest source: supabase/migrations/20261011191527_teacher_owned_catalogue_foundation.sql
CREATE OR REPLACE FUNCTION public.public_discovery_catalogue()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with eligible_groups as (
  select g.offering_id from public.groups g
  join public.profiles p on p.id=g.teacher_id
  join public.teacher_profiles t on t.id=p.id
  where g.status='published' and p.role='teacher' and p.status='active' and t.approved and dars_private.teacher_has_access(g.teacher_id)
), subjects_out as (
  select s.id,s.name_ar,s.name_en from public.subjects s where s.owner_teacher_id is null
  union
  select s.id,s.name_ar,s.name_en from public.subjects s join public.offerings o on o.subject_id=s.id
  join eligible_groups eg on eg.offering_id=o.id where s.owner_teacher_id is not null
), nodes_out as (
  select n.id,n.parent_id,n.kind,n.name_ar,n.name_en from public.education_nodes n where n.owner_teacher_id is null
  union
  select n.id,n.parent_id,n.kind,n.name_ar,n.name_en from public.education_nodes n join public.offerings o on o.node_id=n.id
  join eligible_groups eg on eg.offering_id=o.id where n.owner_teacher_id is not null
)
select jsonb_build_object(
  'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar,'name_en',name_en) order by id) from subjects_out),'[]'::jsonb),
  'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'kind',kind,'name_ar',name_ar,'name_en',name_en) order by id) from nodes_out),'[]'::jsonb)
)
$function$;
-- Latest source: supabase/migrations/20261014065340_enrollment_schedule_stability.sql
CREATE OR REPLACE FUNCTION public.request_enrollment(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_group public.groups;
  v_enrollment public.enrollments;
begin
  if public.current_role() is distinct from 'student'::public.user_role then
    raise exception 'only active students may request';
  end if;

  -- Match public_groups(): only a published group owned by an active,
  -- approved teacher is discoverable and therefore requestable.
  select * into v_group from public.groups where id=p_group_id for update;
  if not found or v_group.status is distinct from 'published'::public.group_status
     or not exists (
       select 1 from public.profiles p
       join public.teacher_profiles tp on tp.id=p.id
       where p.id=v_group.teacher_id and p.role='teacher'::public.user_role
         and p.status='active'::public.user_status and tp.approved and dars_private.teacher_has_access(v_group.teacher_id)
     ) then
    raise exception 'published group not found';
  end if;

  insert into public.enrollments(group_id,student_id) values(p_group_id,auth.uid())
  on conflict(group_id,student_id) do update
    set status=case when public.enrollments.status in ('rejected','cancelled','removed')
      then 'pending'::public.enrollment_status else public.enrollments.status end,
      updated_at=now()
  returning * into v_enrollment;
  return v_enrollment.id;
end
$function$;
-- Latest source: supabase/migrations/20261014081704_student_saved_groups.sql
CREATE OR REPLACE FUNCTION public.save_student_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_student uuid := auth.uid();
begin
  if v_student is null or not exists (
    select 1 from public.profiles p where p.id=v_student and p.role='student' and p.status='active'
  ) then raise exception 'active student required'; end if;
  if not exists (
    select 1 from public.groups g
    join public.profiles p on p.id=g.teacher_id and p.role='teacher' and p.status='active'
    join public.teacher_profiles tp on tp.id=p.id and tp.approved and dars_private.teacher_has_access(g.teacher_id)
    where g.id=p_group_id and g.status='published'
  ) then raise exception 'published group unavailable'; end if;
  insert into public.student_saved_groups(student_id,group_id)
  values(v_student,p_group_id) on conflict(student_id,group_id) do nothing;
end $function$;
-- Latest source: supabase/migrations/20261014082026_student_schedule_overlap_warning.sql
CREATE OR REPLACE FUNCTION public.student_group_schedule_overlap(p_group_id uuid)
 RETURNS TABLE(weekly_overlap boolean, dated_overlap boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null or not exists (
    select 1 from public.profiles p
    where p.id=v_student and p.role='student'::public.user_role
      and p.status='active'::public.user_status
  ) then
    raise exception 'active student required';
  end if;

  if not exists (
    select 1 from public.groups g
    join public.profiles p on p.id=g.teacher_id
    join public.teacher_profiles tp on tp.id=p.id
    where g.id=p_group_id and g.status='published'::public.group_status
      and p.role='teacher'::public.user_role and p.status='active'::public.user_status
      and tp.approved and dars_private.teacher_has_access(g.teacher_id)
  ) then
    return query select false, false;
    return;
  end if;

  return query
  with accepted_groups as (
    select g.id
    from public.enrollments e
    join public.groups g on g.id=e.group_id
    where e.student_id=v_student and e.status='accepted'::public.enrollment_status
      and g.status<>'archived'::public.group_status
      and g.id<>p_group_id
  ),
  recurring_conflict as (
    select exists (
      select 1 from public.group_schedule_slots candidate
      join public.group_schedule_slots existing
        on existing.weekday=candidate.weekday
       and existing.start_time<candidate.end_time
       and existing.end_time>candidate.start_time
      join accepted_groups ag on ag.id=existing.group_id
      where candidate.group_id=p_group_id
    ) as conflict
  ),
  date_conflict as (
    -- Compare two real future lessons by their absolute instants.
    select exists (
      select 1 from public.lessons candidate
      join public.lessons existing
        on existing.starts_at<candidate.ends_at and existing.ends_at>candidate.starts_at
      join accepted_groups ag on ag.id=existing.group_id
      where candidate.group_id=p_group_id and candidate.status='scheduled'::public.lesson_status
        and candidate.starts_at>statement_timestamp()
        and existing.status='scheduled'::public.lesson_status
        and existing.starts_at>statement_timestamp()
    )
    -- A proposed weekly slot against a member's real future lesson.
    or exists (
      select 1 from public.group_schedule_slots candidate
      join public.lessons existing on existing.group_id in (select id from accepted_groups)
      cross join lateral (
        select ((local_lesson.local_day + occurrence.day_offset) + candidate.start_time)
                 at time zone 'Africa/Cairo' as slot_start,
               ((local_lesson.local_day + occurrence.day_offset) + candidate.end_time)
                 at time zone 'Africa/Cairo' as slot_end
        from (select (existing.starts_at at time zone 'Africa/Cairo')::date as local_day) local_lesson
        cross join lateral (
          select ((candidate.weekday - extract(dow from local_lesson.local_day)::integer + 7) % 7) + step.days
            as day_offset
          from (values (0),(7)) as step(days)
        ) occurrence
      ) slot_time
      where candidate.group_id=p_group_id and existing.status='scheduled'::public.lesson_status
        and existing.starts_at>statement_timestamp()
        and existing.starts_at<slot_time.slot_end and existing.ends_at>slot_time.slot_start
    )
    -- A proposed dated lesson against a member's recurring weekly slot.
    or exists (
      select 1 from public.lessons candidate
      cross join public.group_schedule_slots existing
      join accepted_groups ag on ag.id=existing.group_id
      cross join lateral (
        select ((local_lesson.local_day + occurrence.day_offset) + existing.start_time)
                 at time zone 'Africa/Cairo' as slot_start,
               ((local_lesson.local_day + occurrence.day_offset) + existing.end_time)
                 at time zone 'Africa/Cairo' as slot_end
        from (select (candidate.starts_at at time zone 'Africa/Cairo')::date as local_day) local_lesson
        cross join lateral (
          select ((existing.weekday - extract(dow from local_lesson.local_day)::integer + 7) % 7) + step.days
            as day_offset
          from (values (0),(7)) as step(days)
        ) occurrence
      ) slot_time
      where candidate.group_id=p_group_id and candidate.status='scheduled'::public.lesson_status
        and candidate.starts_at>statement_timestamp()
        and candidate.starts_at<slot_time.slot_end and candidate.ends_at>slot_time.slot_start
    ) as conflict
  )
  select recurring_conflict.conflict, date_conflict.conflict from recurring_conflict, date_conflict;
end
$function$;
-- Latest source: supabase/migrations/20261009121542_lesson_preview.sql
CREATE OR REPLACE FUNCTION public.preview_lesson_generation(p_group_id uuid, p_from date, p_until date)
 RETURNS TABLE(slot_id uuid, local_date date, start_time time without time zone, end_time time without time zone, starts_at timestamp with time zone, ends_at timestamp with time zone, state text, conflict_lesson_id uuid, conflict_group_id uuid, conflict_title text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dars_private', 'auth'
AS $function$
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select candidates.slot_id, candidates.local_date, candidates.start_time, candidates.end_time,
         candidates.starts_at, candidates.ends_at, candidates.state, candidates.conflict_lesson_id,
         candidates.conflict_group_id, candidates.conflict_title
  from dars_private.lesson_generation_candidates(p_group_id, p_from, p_until) as candidates;
end;
$function$;
-- Latest source: supabase/migrations/20261012151302_optimize_enrollment_reads_and_rls.sql
CREATE OR REPLACE FUNCTION public.teacher_enrollment_page(p_status text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if v_actor is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(v_actor), false) then
    raise exception 'active teacher required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'accepted') then
    raise exception 'status must be pending or accepted' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;

  with page_rows as materialized (
    select e.id as enrollment_id, e.student_id, e.status::text as status,
      g.id as group_id, g.name as group_name, e.updated_at
    from public.enrollments e
    join public.groups g on g.id = e.group_id
    where g.teacher_id = v_actor and e.status = p_status::public.enrollment_status
    order by e.updated_at desc, e.id desc
    offset p_offset limit p_limit
  ), page as (
    select page_rows.*, p.full_name
    from page_rows join public.profiles p on p.id = page_rows.student_id
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', page.enrollment_id,
        'student_id', page.student_id,
        'full_name', page.full_name,
        'status', page.status,
        'group_id', page.group_id,
        'group_name', page.group_name
      ) order by page.updated_at desc, page.enrollment_id desc)
      from page
    ), '[]'::jsonb),
    'total', (
      select count(*) from public.enrollments e
      join public.groups g on g.id = e.group_id
      where g.teacher_id = v_actor and e.status = p_status::public.enrollment_status
    )
  ) into v_result;

  return v_result;
end;
$function$;
-- Latest source: supabase/migrations/20261014071351_group_enrollment_page.sql
CREATE OR REPLACE FUNCTION public.group_enrollment_page(p_group_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_role public.user_role := public.current_role();
  v_result jsonb;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if auth.uid() is null or not coalesce(public.is_active_user(auth.uid()), false)
     or (v_role is distinct from 'admin'::public.user_role
       and (v_role is distinct from 'teacher'::public.user_role
         or not coalesce(public.is_group_owner(p_group_id), false))) then
    raise exception 'active group owner or admin required' using errcode = '42501';
  end if;
  if p_group_id is null or p_offset is null or p_offset < 0
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;

  with page_rows as materialized (
    select e.id as enrollment_id, e.student_id, p.full_name, e.status::text as status,
      e.created_at
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    where e.group_id = p_group_id
    order by e.created_at asc, e.id asc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', page_rows.enrollment_id,
        'student_id', page_rows.student_id,
        'full_name', page_rows.full_name,
        'status', page_rows.status
      ) order by page_rows.created_at asc, page_rows.enrollment_id asc)
      from page_rows
    ), '[]'::jsonb),
    'total', (select count(*) from public.enrollments e where e.group_id = p_group_id)
  ) into v_result;

  return v_result;
end;
$function$;
-- Latest source: supabase/migrations/20261014071526_teacher_dashboard_summary.sql
CREATE OR REPLACE FUNCTION public.teacher_dashboard_summary(p_day_start timestamp with time zone, p_day_end timestamp with time zone, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if v_actor is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(v_actor), false) then
    raise exception 'active teacher required' using errcode = '42501';
  end if;
  if p_day_start is null or p_day_end is null or p_now is null
     or p_day_end <= p_day_start
     or p_day_end - p_day_start < interval '22 hours'
     or p_day_end - p_day_start > interval '26 hours'
     or p_now < p_day_start or p_now >= p_day_end then
    raise exception 'invalid Cairo day bounds' using errcode = '22023';
  end if;

  with owned as materialized (
    select g.id, g.name, g.capacity, g.status::text as status, g.location,
      g.description, g.created_at, s.name_ar as subject_name_ar, s.name_en as subject_name_en
    from public.groups g
    join public.offerings o on o.id = g.offering_id
    join public.subjects s on s.id = o.subject_id
    where g.teacher_id = v_actor
  ), preview_groups as (
    select * from owned order by created_at desc, id desc limit 8
  ), today_lessons as (
    select l.id, l.group_id, l.title, l.starts_at, l.ends_at, l.status::text as status, g.name as group_name
    from public.lessons l join public.groups g on g.id = l.group_id
    where g.teacher_id = v_actor
      and l.status in ('scheduled','completed')
      and l.starts_at < p_day_end and l.ends_at > p_day_start
    order by l.starts_at, l.id limit 8
  ), upcoming_lessons as (
    select l.id, l.group_id, l.title, l.starts_at, l.ends_at, l.status::text as status, g.name as group_name
    from public.lessons l join public.groups g on g.id = l.group_id
    where g.teacher_id = v_actor and l.status = 'scheduled' and l.starts_at >= p_now
    order by l.starts_at, l.id limit 8
  ), draft_candidate as (
    select id, name, status from owned where status = 'draft' order by created_at, id limit 1
  ), missing_schedule_candidate as (
    select g.id, g.name, g.status from owned g
    where g.status <> 'archived'
      and not exists (select 1 from public.group_schedule_slots ss where ss.group_id = g.id)
    order by g.created_at desc, g.id desc limit 1
  )
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'capacity', capacity, 'status', status, 'location', location,
      'description', description,
      'offering', jsonb_build_object('subject', jsonb_build_object('name_ar', subject_name_ar, 'name_en', subject_name_en))
    ) order by created_at desc, id desc) from preview_groups), '[]'::jsonb),
    'group_count', (select count(*) from owned),
    'today', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'group_id', group_id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
      'status', status, 'group', jsonb_build_object('name', group_name)
    ) order by starts_at, id) from today_lessons), '[]'::jsonb),
    'today_count', (select count(*) from public.lessons l join public.groups g on g.id=l.group_id
      where g.teacher_id=v_actor and l.status in ('scheduled','completed') and l.starts_at < p_day_end and l.ends_at > p_day_start),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'group_id', group_id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at,
      'status', status, 'group', jsonb_build_object('name', group_name)
    ) order by starts_at, id) from upcoming_lessons), '[]'::jsonb),
    'upcoming_count', (select count(*) from public.lessons l join public.groups g on g.id=l.group_id
      where g.teacher_id=v_actor and l.status='scheduled' and l.starts_at >= p_now),
    'has_specializations', exists(select 1 from public.teacher_specializations ts where ts.teacher_id=v_actor),
    'draft_candidate', (select jsonb_build_object('id', id, 'name', name, 'status', status) from draft_candidate),
    'missing_schedule_candidate', (select jsonb_build_object('id', id, 'name', name, 'status', status) from missing_schedule_candidate)
  ) into v_result;

  return v_result;
end;
$function$;
-- Latest source: supabase/migrations/20261014080126_teacher_enrollment_search_and_group_choices.sql
CREATE OR REPLACE FUNCTION public.teacher_enrollment_search(p_status text, p_query text DEFAULT ''::text, p_group_id uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_result jsonb;
  v_query text := left(coalesce(p_query, ''), 120);
  v_like text;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if auth.uid() is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(auth.uid()), false) then
    raise exception 'active teacher required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'accepted') then
    raise exception 'invalid enrollment status' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid page bounds' using errcode = '22023';
  end if;
  if p_group_id is not null and not public.is_group_owner(p_group_id) then
    raise exception 'group not found' using errcode = '42501';
  end if;

  -- Escape wildcard characters so the supplied text is always a literal substring.
  v_like := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  with matching as materialized (
    select e.id as enrollment_id, e.student_id, p.full_name,
      e.status::text as status, g.id as group_id, g.name as group_name, e.created_at
    from public.enrollments e
    join public.groups g on g.id = e.group_id and g.teacher_id = auth.uid()
    join public.profiles p on p.id = e.student_id
    where e.status::text = p_status
      and (p_group_id is null or g.id = p_group_id)
      and (v_query = '' or p.full_name ilike v_like escape E'\\' or g.name ilike v_like escape E'\\')
  ), page_rows as (
    select * from matching order by created_at asc, enrollment_id asc offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'enrollment_id', enrollment_id, 'student_id', student_id, 'full_name', full_name,
      'status', status, 'group_id', group_id, 'group_name', group_name
    ) order by created_at asc, enrollment_id asc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from matching)
  ) into v_result;
  return v_result;
end;
$function$;
-- Latest source: supabase/migrations/20261014080126_teacher_enrollment_search_and_group_choices.sql
CREATE OR REPLACE FUNCTION public.teacher_group_choices(p_query text DEFAULT ''::text, p_selected uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_query text := left(coalesce(p_query, ''), 120);
  v_like text;
  v_result jsonb;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if auth.uid() is null
     or public.current_role() is distinct from 'teacher'::public.user_role
     or not coalesce(public.is_active_user(auth.uid()), false) then
    raise exception 'active teacher required' using errcode = '42501';
  end if;
  v_like := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with choices as (
    select g.id, g.name, g.status::text as status, g.created_at
    from public.groups g
    where g.teacher_id = auth.uid() and (v_query = '' or g.name ilike v_like escape E'\\')
    order by g.created_at desc, g.id desc
    limit 50
  ), selected as (
    select g.id, g.name, g.status::text as status, g.created_at
    from public.groups g
    where p_selected is not null and g.id = p_selected and g.teacher_id = auth.uid()
      and not exists (select 1 from choices c where c.id = g.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status)
    order by created_at desc, id desc), '[]'::jsonb) into v_result
  from (select * from choices union all select * from selected) all_choices;
  return v_result;
end;
$function$;
-- Latest source: supabase/migrations/20261014120923_lesson_attendance.sql
CREATE OR REPLACE FUNCTION public.teacher_lesson_attendance_page(p_lesson_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_total integer; v_rows jsonb; v_role public.user_role;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
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
end $function$;
-- Latest source: supabase/migrations/20261014122647_calendar_lesson_export.sql
CREATE OR REPLACE FUNCTION public.calendar_lesson_export(p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_role public.user_role;
  v_actor_status public.user_status;
  v_from timestamptz;
  v_until timestamptz;
  v_rows jsonb;
  v_total integer;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select p.role into v_role
  from public.profiles p
  where p.id = v_actor and p.status = 'active';

  if v_actor is null or v_role is null or v_role not in ('student', 'teacher') then
    raise exception 'active student or teacher required' using errcode = '42501';
  end if;
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'calendar dates are required and must be ordered' using errcode = '22023';
  end if;
  if p_until - p_from + 1 > 93 then
    raise exception 'calendar range cannot exceed 93 days' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Africa/Cairo';
  v_until := (p_until + 1)::timestamp at time zone 'Africa/Cairo';

  with visible_lessons as materialized (
    select l.id, l.title, l.starts_at, l.ends_at, l.status, l.created_at,
           g.name as group_name, g.location
    from public.lessons l
    join public.groups g on g.id = l.group_id
    where l.starts_at >= v_from
      and l.starts_at < v_until
      and (
        (v_role = 'student' and exists (
          select 1 from public.enrollments e
          where e.group_id = l.group_id and e.student_id = v_actor and e.status = 'accepted'
        ))
        or (v_role = 'teacher' and g.teacher_id = v_actor)
      )
    order by l.starts_at, l.id
    limit 501
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'title', title,
           'starts_at', starts_at,
           'ends_at', ends_at,
           'status', status,
           'created_at', created_at,
           'group_name', group_name,
           'location', location
         ) order by starts_at, id), '[]'::jsonb)
  into v_total, v_rows
  from visible_lessons;

  if v_total > 500 then
    raise exception 'calendar export exceeds 500 lessons' using errcode = '54000';
  end if;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.save_teacher_group_draft(p_group_id uuid, p_subject_id uuid, p_category_id uuid, p_name text, p_description text, p_capacity integer, p_location text, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
 v_teacher uuid:=auth.uid(); v_group public.groups; v_subject_owner uuid; v_subject_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz;
 v_offering_owner uuid; v_offering_archived timestamptz; v_old_node uuid; v_old_subject uuid; v_old_offering uuid; v_offering uuid; v_existing_archived timestamptz;
 v_name text:=btrim(coalesce(p_name,'')); v_description text:=coalesce(p_description,''); v_location text:=btrim(coalesce(p_location,''));
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
 if p_group_id is null and p_expected_updated_at is not null then raise exception 'new drafts cannot include an expected timestamp'; end if;
 if p_group_id is not null and p_expected_updated_at is null then raise exception 'draft timestamp is required'; end if;
 if length(v_name) not between 2 and 120 or length(v_description)>2000 or p_capacity not between 1 and 500 or length(v_location)>200 then
   raise exception 'draft fields are invalid';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
 if p_group_id is not null then
   select * into v_group from public.groups where id=p_group_id for update;
   if not found or v_group.teacher_id<>v_teacher or v_group.status<>'draft' then raise exception 'owned draft not found'; end if;
   if v_group.updated_at is distinct from p_expected_updated_at then raise exception 'draft changed; refresh and retry' using errcode='40001'; end if;
   v_old_offering:=v_group.offering_id;
   select node_id,subject_id into v_old_node,v_old_subject from public.offerings where id=v_old_offering;
 end if;
 -- Draft identity, status and CAS are checked before any pair resolution or insertion.
 perform 1 from public.subjects where id=p_subject_id for update;
 if not found then raise exception 'subject is not selectable'; end if;
 perform 1 from public.education_nodes where id=p_category_id for update;
 if not found then raise exception 'category is not selectable'; end if;
 select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=p_subject_id;
 select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=p_category_id;
 if (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher) then raise exception 'catalogue components belong to another teacher'; end if;
 if p_group_id is not null and p_subject_id=v_old_subject and p_category_id=v_old_node then
   v_offering:=v_old_offering;
   select owner_teacher_id,archived_at into v_offering_owner,v_offering_archived from public.offerings where id=v_offering for update;
 else
   if v_subject_archived is not null or v_node_archived is not null then raise exception 'choose active catalogue components'; end if;
   if v_subject_owner is null and v_node_owner is null then
     select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id is null and subject_id=p_subject_id and node_id=p_category_id for update;
     if v_existing_archived is not null then v_offering:=null; end if;
   end if;
   if v_offering is null then
     select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id for update;
   end if;
   if v_offering is not null then
     if v_existing_archived is not null then raise exception 'restore the archived specialization before selecting it'; end if;
   else
     insert into public.offerings(node_id,subject_id,owner_teacher_id) values(p_category_id,p_subject_id,v_teacher)
     on conflict(owner_teacher_id,node_id,subject_id) where owner_teacher_id is not null do nothing returning id into v_offering;
     if v_offering is null then
       select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id;
       if v_existing_archived is not null then raise exception 'restore the archived specialization before selecting it'; end if;
     end if;
   end if;
   select owner_teacher_id,archived_at into v_offering_owner,v_offering_archived from public.offerings where id=v_offering for update;
 end if;
 if (v_offering_owner is not null and v_offering_owner<>v_teacher) then raise exception 'offering belongs to another teacher'; end if;
 if p_group_id is null then
   insert into public.groups(teacher_id,offering_id,name,description,capacity,location,status)
   values(v_teacher,v_offering,v_name,v_description,p_capacity,v_location,'draft') returning id into v_group.id;
 else
   update public.groups set offering_id=v_offering,name=v_name,description=v_description,capacity=p_capacity,location=v_location
   where id=p_group_id returning * into v_group;
 end if;
 return v_group.id;
end
$function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.publish_group(p_group_id uuid, p_from date DEFAULT NULL::date, p_until date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_teacher uuid; v_group public.groups; v_actor_role public.user_role; v_generated integer:=0; v_node uuid; v_subject uuid; v_owner uuid; v_archived timestamptz; v_component_owner uuid; v_component_archived timestamptz;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
 if (p_from is null) is distinct from (p_until is null) then raise exception 'publication range must provide both dates or neither'; end if;
 select teacher_id into v_teacher from public.groups where id=p_group_id;
 if v_teacher is null then raise exception 'group not found'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 select * into v_group from public.groups where id=p_group_id for update;
 if not found or v_group.teacher_id<>v_teacher then raise exception 'group teacher changed'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 if not private.teacher_catalogue_active(v_group.teacher_id) or not exists(select 1 from public.teacher_profiles t where t.id=v_teacher and t.approved) then raise exception 'only an active approved teacher may publish'; end if;
 select node_id,subject_id into v_node,v_subject from public.offerings where id=v_group.offering_id;
 perform 1 from public.subjects where id=v_subject for update;
 perform 1 from public.education_nodes where id=v_node for update;
 select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=v_group.offering_id for update;
 select owner_teacher_id,archived_at into v_component_owner,v_component_archived from public.subjects where id=v_subject;
 if (v_owner is not null and v_owner<>v_teacher) or (v_component_owner is not null and v_component_owner<>v_teacher) then raise exception 'saved catalogue selection belongs to another teacher'; end if;
 select owner_teacher_id,archived_at into v_component_owner,v_component_archived from public.education_nodes where id=v_node;
 if v_component_owner is not null and v_component_owner<>v_teacher then raise exception 'saved catalogue selection belongs to another teacher'; end if;
 if btrim(v_group.name)='' or length(btrim(v_group.name)) not between 2 and 120 or length(v_group.description)>2000 or v_group.capacity not between 1 and 500 or length(v_group.location)>200 then raise exception 'group fields are invalid'; end if;
 if not exists(select 1 from public.group_schedule_slots s where s.group_id=p_group_id) then raise exception 'a schedule slot is required before publishing'; end if;
 if p_from is not null then v_generated:=public.generate_lessons(p_group_id,p_from,p_until); end if;
 update public.groups set status='published' where id=p_group_id;
 return v_generated;
end
$function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.duplicate_group(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_source public.groups; v_teacher uuid; v_actor_role public.user_role; v_node uuid; v_subject uuid; v_owner uuid; v_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz; v_subject_owner uuid; v_subject_archived timestamptz; v_name text; v_duplicate uuid;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
 select * into v_source from public.groups where id=p_group_id;
 if not found then raise exception 'group not found'; end if;
 v_teacher:=v_source.teacher_id;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 select * into v_source from public.groups where id=p_group_id for update;
 if not found or v_source.teacher_id<>v_teacher then raise exception 'group teacher changed'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'source teacher must be active'; end if;
 select node_id,subject_id into v_node,v_subject from public.offerings where id=v_source.offering_id;
 perform 1 from public.subjects where id=v_subject for update;
 perform 1 from public.education_nodes where id=v_node for update;
 select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=v_source.offering_id for update;
 select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=v_subject;
 select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=v_node;
 if (v_owner is not null and v_owner<>v_teacher) or (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher) then raise exception 'source selection belongs to another teacher'; end if;
 if v_archived is not null or v_subject_archived is not null or v_node_archived is not null then raise exception 'Update the original catalogue selection before duplicating this group.'; end if;
 v_name:=rtrim(left(btrim(v_source.name),113)); if v_name='' then v_name:='Group'; end if;
 insert into public.groups(teacher_id,offering_id,name,description,capacity,status,location)
 values(v_teacher,v_source.offering_id,v_name||' (copy)',v_source.description,v_source.capacity,'draft',v_source.location)
 returning id into v_duplicate;
 return v_duplicate;
end
$function$;
-- Latest source: supabase/migrations/20261014065340_enrollment_schedule_stability.sql
CREATE OR REPLACE FUNCTION public.save_schedule_slot(p_group_id uuid, p_weekday integer, p_start_time time without time zone, p_end_time time without time zone, p_slot_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_existing_group uuid;
  v_slot_id uuid;
  v_bad boolean;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_weekday not between 0 and 6 or p_start_time is null or p_end_time is null or p_start_time>=p_end_time then
    raise exception 'invalid schedule slot';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status
    from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if v_group_status='archived'::public.group_status then raise exception 'cannot edit archived group schedule'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;

  if p_slot_id is not null then
    select s.group_id into v_existing_group from public.group_schedule_slots s where s.id=p_slot_id for update;
    if v_existing_group is null then raise exception 'slot not found'; end if;
    if v_existing_group<>p_group_id then raise exception 'slot belongs to another group'; end if;
  end if;

  select exists(
    select 1 from public.group_schedule_slots s
    join public.groups g on g.id=s.group_id
    where g.teacher_id=v_teacher_id and g.status<>'archived'::public.group_status
      and s.weekday=p_weekday and s.start_time<p_end_time and s.end_time>p_start_time
      and s.id is distinct from p_slot_id
  ) into v_bad;
  if v_bad then raise exception 'teacher recurring schedule overlaps'; end if;

  select exists(
    select 1 from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=v_teacher_id and g.status<>'archived'::public.group_status
      and l.status='scheduled'::public.lesson_status and l.starts_at>statement_timestamp()
      and extract(dow from (l.starts_at at time zone 'Africa/Cairo'))::int=p_weekday
      and (l.starts_at at time zone 'Africa/Cairo')::time<p_end_time
      and (l.ends_at at time zone 'Africa/Cairo')::time>p_start_time
  ) into v_bad;
  if v_bad then raise exception 'schedule overlaps existing lesson'; end if;

  if p_slot_id is null then
    insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
    values(p_group_id,p_weekday,p_start_time,p_end_time) returning id into v_slot_id;
  else
    update public.group_schedule_slots set weekday=p_weekday,start_time=p_start_time,end_time=p_end_time
    where id=p_slot_id and group_id=p_group_id returning id into v_slot_id;
    if v_slot_id is null then raise exception 'slot not found'; end if;
  end if;
  return v_slot_id;
end
$function$;
-- Latest source: supabase/migrations/20261009150802_delete_schedule_slot.sql
CREATE OR REPLACE FUNCTION public.delete_schedule_slot(p_group_id uuid, p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_slot_group_id uuid;
  v_slot_count integer;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select g.teacher_id into v_teacher_id
  from public.groups g
  where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));

  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status
  from public.groups g
  where g.id=p_group_id
  for update;
  if v_locked_teacher_id is null or v_locked_teacher_id is distinct from v_teacher_id then
    raise exception 'group teacher changed';
  end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized';
  end if;

  select s.group_id into v_slot_group_id
  from public.group_schedule_slots s
  where s.id=p_slot_id
  for update;
  if v_slot_group_id is null then raise exception 'slot not found'; end if;
  if v_slot_group_id is distinct from p_group_id then
    raise exception 'slot belongs to another group';
  end if;

  if exists(select 1 from public.lessons l where l.slot_id=p_slot_id) then
    raise exception 'schedule slot has generated lessons';
  end if;

  if v_group_status='published'::public.group_status then
    select count(*) into v_slot_count
    from public.group_schedule_slots s
    where s.group_id=p_group_id;
    if v_slot_count<=1 then
      raise exception 'published group must keep at least one schedule slot';
    end if;
  end if;

  delete from public.group_schedule_slots s
  where s.id=p_slot_id and s.group_id=p_group_id;
  if not found then raise exception 'slot not found'; end if;
end
$function$;
-- Latest source: supabase/migrations/20261009145704_lesson_generation_exclusions_lock_order.sql
CREATE OR REPLACE FUNCTION public.set_lesson_exclusions(p_group_id uuid, p_dates date[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_date_count integer;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_dates is null then raise exception 'exclusion dates are required'; end if;
  if exists(select 1 from unnest(p_dates) as dates(local_date) where local_date is null or not isfinite(local_date)) then
    raise exception 'exclusion dates must be finite and cannot contain NULL';
  end if;
  select count(distinct dates.local_date)::integer into v_date_count from unnest(p_dates) as dates(local_date);
  if v_date_count>366 then raise exception 'at most 366 exclusion dates are allowed'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id into v_locked_teacher_id from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;

  delete from public.group_lesson_exclusions e where e.group_id=p_group_id;
  insert into public.group_lesson_exclusions(group_id,local_date)
  select p_group_id,dates.local_date from unnest(p_dates) as dates(local_date) group by dates.local_date;
end
$function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.create_lesson(p_group_id uuid, p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text DEFAULT ''::text, p_lesson_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_existing_group uuid;
  v_slot_id uuid;
  v_local_date date;
  v_lesson_id uuid;
  v_bad boolean;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at) then
    raise exception 'lesson interval must be finite';
  end if;
  if p_starts_at>=p_ends_at then raise exception 'invalid lesson interval'; end if;
  if length(btrim(p_title)) not between 1 and 200 then raise exception 'invalid lesson title'; end if;
  if length(p_notes)>10000 then raise exception 'lesson notes too long'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if v_group_status='archived'::public.group_status then raise exception 'group is archived'; end if;

  if p_lesson_id is not null then
    select l.group_id,l.slot_id,l.local_date into v_existing_group,v_slot_id,v_local_date
    from public.lessons l where l.id=p_lesson_id for update;
    if v_existing_group is null then raise exception 'lesson not found'; end if;
    if v_existing_group<>p_group_id then raise exception 'lesson belongs to another group'; end if;
  end if;

  select exists(
    select 1 from public.lessons l
    join public.groups g on g.id=l.group_id
    where g.teacher_id=v_teacher_id
      and l.status in ('scheduled'::public.lesson_status,'completed'::public.lesson_status)
      and l.id is distinct from p_lesson_id
      and l.starts_at<p_ends_at and l.ends_at>p_starts_at
  ) into v_bad;
  if v_bad then raise exception 'teacher dated lesson overlaps'; end if;

  if p_lesson_id is null then
    insert into public.lessons(group_id,title,starts_at,ends_at,notes,local_date)
    values(p_group_id,btrim(p_title),p_starts_at,p_ends_at,p_notes,(p_starts_at at time zone 'Africa/Cairo')::date)
    returning id into v_lesson_id;
  else
    update public.lessons
    set title=btrim(p_title),starts_at=p_starts_at,ends_at=p_ends_at,notes=p_notes,
        slot_id=v_slot_id,
        local_date=case when v_slot_id is not null then v_local_date else (p_starts_at at time zone 'Africa/Cairo')::date end
    where id=p_lesson_id and group_id=p_group_id returning id into v_lesson_id;
    if v_lesson_id is null then raise exception 'lesson not found'; end if;
  end if;
  return v_lesson_id;
end
$function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.set_lesson_status(p_lesson_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_group_id uuid;
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_locked_group_id uuid;
  v_group_status public.group_status;
  v_bad boolean;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if p_status not in ('scheduled','cancelled','completed') then raise exception 'invalid lesson status'; end if;
  select l.group_id,g.teacher_id into v_group_id,v_teacher_id
  from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id;
  if v_group_id is null then raise exception 'lesson not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(v_group_id) then raise exception 'not authorized'; end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status from public.groups g where g.id=v_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  select l.group_id into v_locked_group_id from public.lessons l where l.id=p_lesson_id for update;
  if v_locked_group_id is null then raise exception 'lesson not found'; end if;
  if v_locked_group_id<>v_group_id then raise exception 'lesson group changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(v_locked_group_id) then raise exception 'not authorized'; end if;
  if p_status='scheduled' and v_group_status='archived'::public.group_status then raise exception 'group is archived'; end if;

  if p_status in ('scheduled','completed') then
    select exists(
      select 1 from public.lessons target
      join public.lessons other on other.id<>target.id
      join public.groups other_group on other_group.id=other.group_id
      where target.id=p_lesson_id and other_group.teacher_id=v_teacher_id
        and other.status in ('scheduled'::public.lesson_status,'completed'::public.lesson_status)
        and other.starts_at<target.ends_at and other.ends_at>target.starts_at
    ) into v_bad;
    if v_bad then raise exception 'teacher dated lesson overlaps'; end if;
  end if;
  update public.lessons set status=p_status::public.lesson_status where id=p_lesson_id;
end
$function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.generate_lessons(p_group_id uuid, p_from date, p_until date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dars_private'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_candidate record;
  v_made integer := 0;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) then
    raise exception 'generation range dates must be finite';
  end if;
  if p_until<p_from or p_until-p_from>90 then
    raise exception 'range must be 0 to 90 days';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
  if v_group_status='archived'::public.group_status then raise exception 'group is archived'; end if;

  perform s.id from public.group_schedule_slots s where s.group_id=p_group_id order by s.id for update;
  for v_candidate in
    select * from dars_private.lesson_generation_candidates(p_group_id,p_from,p_until)
  loop
    if v_candidate.state='conflicting' then
      raise exception 'generated lesson overlaps on %',v_candidate.local_date;
    elsif v_candidate.state='ready' then
      insert into public.lessons(group_id,slot_id,local_date,title,starts_at,ends_at)
      values(p_group_id,v_candidate.slot_id,v_candidate.local_date,'Scheduled lesson',v_candidate.starts_at,v_candidate.ends_at)
      on conflict(group_id,slot_id,local_date)
        where slot_id is not null and local_date is not null do nothing;
      if found then v_made:=v_made+1; end if;
    end if;
  end loop;
  return v_made;
end
$function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.cancel_teacher_group(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_cancelled integer;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select teacher_id into v_teacher_id from public.groups where id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id into v_locked_teacher_id from public.groups where id=p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (v_actor_role='admin'::public.user_role or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active group owner or admin only';
  end if;
  update public.groups set status='archived'::public.group_status where id=p_group_id;
  update public.lessons set status='cancelled'::public.lesson_status
    where group_id=p_group_id and status='scheduled'::public.lesson_status and starts_at>statement_timestamp();
  get diagnostics v_cancelled=row_count;
  update public.enrollments set status='rejected'::public.enrollment_status
    where group_id=p_group_id and status='pending'::public.enrollment_status;
  return v_cancelled;
end $function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.delete_unused_teacher_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_group_status public.group_status;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select teacher_id into v_teacher_id from public.groups where id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id,status into v_locked_teacher_id,v_group_status from public.groups where id=p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (v_actor_role='admin'::public.user_role or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active group owner or admin only';
  end if;
  if v_group_status not in ('draft'::public.group_status,'archived'::public.group_status) then raise exception 'published groups must be cancelled before deletion'; end if;
  if exists(select 1 from public.enrollments where group_id=p_group_id) then raise exception 'groups with enrollment history cannot be deleted'; end if;
  if exists(select 1 from public.lessons where group_id=p_group_id) then raise exception 'groups with lesson history cannot be deleted'; end if;
  delete from public.groups where id=p_group_id;
end $function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.delete_manual_teacher_lesson(p_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
declare
  v_group_id uuid;
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_locked_group_id uuid;
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_lesson public.lessons%rowtype;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  select l.group_id,g.teacher_id into v_group_id,v_teacher_id from public.lessons l join public.groups g on g.id=l.group_id where l.id=p_lesson_id;
  if v_group_id is null then raise exception 'lesson not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select teacher_id into v_locked_teacher_id from public.groups where id=v_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  select role,status into v_target_role,v_target_status from public.profiles where id=v_teacher_id;
  if v_actor is null or v_actor_status is distinct from 'active'::public.user_status
     or not (v_actor_role='admin'::public.user_role or
       (v_actor_role='teacher'::public.user_role and v_actor=v_teacher_id and v_target_role='teacher'::public.user_role and v_target_status='active'::public.user_status)) then
    raise exception 'active lesson owner or admin only';
  end if;
  select * into v_lesson from public.lessons where id=p_lesson_id for update;
  if not found or v_lesson.group_id is distinct from v_group_id then raise exception 'lesson changed'; end if;
  if v_lesson.starts_at<=statement_timestamp() then raise exception 'only future manual lessons can be deleted'; end if;
  if v_lesson.status='completed'::public.lesson_status then raise exception 'completed lessons cannot be deleted'; end if;
  if v_lesson.slot_id is not null then raise exception 'generated lessons must be cancelled instead'; end if;
  if exists(select 1 from public.lesson_materials where lesson_id=p_lesson_id) then raise exception 'remove lesson materials before deleting this lesson'; end if;
  -- Uploads use teacher_id/lesson_id/object-id.extension. Never delete Storage rows here.
  if exists(select 1 from storage.objects o where o.bucket_id='lesson-materials'
      and o.name like v_teacher_id::text||'/'||p_lesson_id::text||'/%') then
    raise exception 'remove stored lesson files before deleting this lesson';
  end if;
  delete from public.lessons where id=p_lesson_id;
end $function$;
-- Latest source: supabase/migrations/20261014065340_enrollment_schedule_stability.sql
CREATE OR REPLACE FUNCTION public.decide_enrollment(p_enrollment_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_group_id uuid;
  v_group public.groups;
  v_enrollment public.enrollments;
  v_count integer;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  -- Discover the parent id without locking, then follow cancellation's lock
  -- order: group first, enrollment second. Re-read after both locks.
  select group_id into v_group_id from public.enrollments where id=p_enrollment_id;
  if not found then raise exception 'not authorized'; end if;
  select * into v_group from public.groups where id=v_group_id for update;
  if not found then raise exception 'not authorized'; end if;
  select * into v_enrollment from public.enrollments
    where id=p_enrollment_id and group_id=v_group_id for update;
  if not found
     or (public.current_role() is distinct from 'admin'::public.user_role
       and not public.is_group_owner(v_group_id)) then
    raise exception 'not authorized';
  end if;

  if p_status='accepted' then
    if v_group.status is distinct from 'published'::public.group_status then
      raise exception 'cannot accept enrollment for archived or unpublished group';
    end if;
    if v_enrollment.status<>'pending' then raise exception 'only pending can be accepted'; end if;
    select count(*) into v_count from public.enrollments
      where group_id=v_group_id and status='accepted'::public.enrollment_status;
    if v_count>=v_group.capacity then raise exception 'group is full'; end if;
  elsif p_status='rejected' and v_enrollment.status<>'pending' then
    raise exception 'only pending can be rejected';
  elsif p_status='removed' and v_enrollment.status<>'accepted' then
    raise exception 'only accepted can be removed';
  elsif p_status not in ('accepted','rejected','removed') then
    raise exception 'invalid decision';
  end if;

  update public.enrollments set status=p_status::public.enrollment_status where id=v_enrollment.id;
  insert into public.notifications(user_id,kind,title_ar,title_en,href) values
    (v_enrollment.student_id,'enrollment_decision',
     case when p_status='accepted' then 'تم قبول طلب الانضمام' when p_status='removed' then 'تمت إزالة عضويتك' else 'تم رفض طلب الانضمام' end,
     case when p_status='accepted' then 'Your enrollment was accepted' when p_status='removed' then 'Your membership was removed' else 'Your enrollment was rejected' end,
     '/student/classes');
end
$function$;
-- Latest source: supabase/migrations/20261014083113_group_pinned_announcements.sql
CREATE OR REPLACE FUNCTION public.set_group_pinned_announcement(p_group_id uuid, p_body text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_owner uuid;
  v_group_status text;
  v_body text;
  v_edited_at timestamptz;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if auth.uid() is null then raise exception 'active approved teacher owner required'; end if;

  -- Serialize writes against archive/status changes by locking the parent first.
  if not exists (
    select 1 from public.profiles p
    join public.teacher_profiles tp on tp.id = p.id
    where p.id = auth.uid() and p.role = 'teacher' and p.status = 'active' and tp.approved
  ) then raise exception 'active approved teacher owner required'; end if;

  select g.teacher_id, g.status into v_owner, v_group_status
  from public.groups g where g.id = p_group_id and g.teacher_id = auth.uid() for update;
  if not found then raise exception 'group not found or not owned'; end if;
  if v_group_status = 'archived' then raise exception 'archived group cannot be edited'; end if;
  if v_owner <> auth.uid() then raise exception 'active approved teacher owner required'; end if;

  if p_body is null then raise exception 'announcement text required'; end if;
  if char_length(p_body) > 2000 then raise exception 'announcement exceeds 2000 characters'; end if;
  if p_body ~ '^[[:space:]]*$' then
    delete from public.group_pinned_announcements where group_id = p_group_id;
    return null;
  end if;
  v_body := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if v_body = '' then
    delete from public.group_pinned_announcements where group_id = p_group_id;
    return null;
  end if;

  insert into public.group_pinned_announcements(group_id, body, edited_at)
  values (p_group_id, v_body, clock_timestamp())
  on conflict (group_id) do update set body = excluded.body, edited_at = excluded.edited_at
  returning edited_at into v_edited_at;
  return v_edited_at;
end;
$function$;
-- Latest source: supabase/migrations/20261014120923_lesson_attendance.sql
CREATE OR REPLACE FUNCTION public.set_lesson_attendance(p_lesson_id uuid, p_student_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_group_id uuid; v_owner uuid; v_group_status public.group_status; v_starts_at timestamptz; v_lesson_status public.lesson_status;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
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
end $function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.save_teacher_subject(p_id uuid, p_name_ar text, p_name_en text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_teacher uuid:=auth.uid(); v_id uuid:=coalesce(p_id,gen_random_uuid()); v_ar text:=btrim(coalesce(p_name_ar,'')); v_en text:=btrim(coalesce(p_name_en,''));
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if length(v_ar)>120 or length(v_en)>120 or (v_ar='' and v_en='') then raise exception 'provide a label up to 120 characters in at least one language' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_id is null then
    insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values(v_id,v_teacher,v_ar,v_en,v_id::text);
  else
    update public.subjects set name_ar=v_ar,name_en=v_en where id=p_id and owner_teacher_id=v_teacher and archived_at is null;
    if not found then raise exception 'active owned subject not found'; end if;
  end if;
  return v_id;
end
$function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.save_teacher_category(p_id uuid, p_kind text, p_name_ar text, p_name_en text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_teacher uuid:=auth.uid(); v_id uuid:=coalesce(p_id,gen_random_uuid()); v_ar text:=btrim(coalesce(p_name_ar,'')); v_en text:=btrim(coalesce(p_name_en,''));
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_kind not in ('custom_year','student_category') then raise exception 'category kind must be custom_year or student_category' using errcode='22023'; end if;
  if length(v_ar)>120 or length(v_en)>120 or (v_ar='' and v_en='') then raise exception 'provide a label up to 120 characters in at least one language' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_id is null then
    insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id)
    values(v_id,null,p_kind,v_ar,v_en,v_id::text,v_teacher);
  else
    update public.education_nodes set name_ar=v_ar,name_en=v_en
    where id=p_id and owner_teacher_id=v_teacher and kind=p_kind and parent_id is null and archived_at is null;
    if not found then raise exception 'active owned category of the requested kind not found'; end if;
  end if;
  return v_id;
end
$function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.set_teacher_catalogue_archived(p_kind text, p_id uuid, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_teacher uuid:=auth.uid(); v_owner uuid; v_node uuid; v_subject uuid;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_kind not in ('subject','category','offering') or p_archived is null then raise exception 'invalid catalogue archive request' using errcode='22023'; end if;
  if p_kind='offering' then select owner_teacher_id,node_id,subject_id into v_owner,v_node,v_subject from public.offerings where id=p_id;
  elsif p_kind='subject' then select owner_teacher_id into v_owner from public.subjects where id=p_id;
  else select owner_teacher_id into v_owner from public.education_nodes where id=p_id; end if;
  if v_owner is distinct from v_teacher then raise exception 'owned catalogue row not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_kind='offering' then
    perform 1 from public.subjects where id=v_subject for update;
    perform 1 from public.education_nodes where id=v_node for update;
    update public.offerings set archived_at=case when p_archived then clock_timestamp() else null end
      where id=p_id and owner_teacher_id=v_teacher;
  elsif p_kind='subject' then
    update public.subjects set archived_at=case when p_archived then clock_timestamp() else null end where id=p_id and owner_teacher_id=v_teacher;
  else
    update public.education_nodes set archived_at=case when p_archived then clock_timestamp() else null end where id=p_id and owner_teacher_id=v_teacher;
  end if;
  if not found then raise exception 'owned catalogue row changed'; end if;
end
$function$;
-- Latest source: supabase/migrations/20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql
CREATE OR REPLACE FUNCTION public.save_teacher_offering(p_subject_id uuid, p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_teacher uuid:=auth.uid(); v_subject_owner uuid; v_subject_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz; v_offering_id uuid; v_existing_archived timestamptz;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform 1 from public.subjects where id=p_subject_id for update;
  if not found then raise exception 'subject is not selectable'; end if;
  perform 1 from public.education_nodes where id=p_category_id for update;
  if not found then raise exception 'category is not selectable'; end if;
  select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=p_subject_id;
  select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=p_category_id;
  if (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher)
     or v_subject_archived is not null or v_node_archived is not null then raise exception 'choose active shared or owned catalogue components'; end if;
  if v_subject_owner is null and v_node_owner is null then
    select id,archived_at into v_offering_id,v_existing_archived from public.offerings
    where owner_teacher_id is null and subject_id=p_subject_id and node_id=p_category_id for update;
    if found and v_existing_archived is null then
      return v_offering_id;
    end if;
  end if;

  select id,archived_at into v_offering_id,v_existing_archived from public.offerings
  where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id for update;
  if found then
    if v_existing_archived is not null then raise exception 'restore the archived specialization before adding it'; end if;
    return v_offering_id;
  end if;
  insert into public.offerings(node_id,subject_id,owner_teacher_id) values(p_category_id,p_subject_id,v_teacher)
  on conflict(owner_teacher_id,node_id,subject_id) where owner_teacher_id is not null do nothing returning id into v_offering_id;
  if v_offering_id is null then
    select id,archived_at into v_offering_id,v_existing_archived from public.offerings
    where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id;
    if v_existing_archived is not null then raise exception 'restore the archived specialization before adding it'; end if;
  end if;
  return v_offering_id;
end
$function$;
-- Latest source: supabase/migrations/202609190001_foundation.sql
CREATE OR REPLACE FUNCTION public.storage_lesson_access(object_name text, write_access boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
select exists(select 1 from public.lesson_materials m join public.lessons l on l.id=m.lesson_id join public.groups g on g.id=l.group_id join public.profiles p on p.id=g.teacher_id
where m.storage_path=object_name and p.status='active' and ((write_access and ((g.teacher_id=auth.uid() and dars_private.teacher_has_access(g.teacher_id)) or public.current_role()='admin')) or (not write_access and ((g.teacher_id=auth.uid() and dars_private.teacher_has_access(g.teacher_id)) or public.is_group_member(g.id) or public.current_role()='admin')))) $function$;
-- Latest source: supabase/migrations/20261012131933_teacher_management_controls.sql
CREATE OR REPLACE FUNCTION public.can_upload_lesson_object(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_teacher uuid:=auth.uid(); v_lesson uuid;
begin
  if v_teacher is null or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
     or split_part(object_name,'/',1)<>v_teacher::text then return false; end if;
  v_lesson:=split_part(object_name,'/',2)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  return exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id
    join public.profiles p on p.id=g.teacher_id
    where l.id=v_lesson and g.teacher_id=v_teacher and p.status='active' and dars_private.teacher_has_access(g.teacher_id));
end $function$;
-- Latest source: supabase/migrations/20261014065323_lesson_material_cleanup.sql
CREATE OR REPLACE FUNCTION public.can_cleanup_lesson_object(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
select case
  when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
       and split_part(object_name,'/',1)=auth.uid()::text
  then exists(
      select 1
      from public.lessons l
      join public.groups g on g.id=l.group_id
      join public.profiles p on p.id=g.teacher_id
      where l.id=split_part(object_name,'/',2)::uuid
        and g.teacher_id=auth.uid()
        and p.role='teacher'
        and p.status='active'
        and dars_private.teacher_has_access(g.teacher_id) and public.can_upload_lesson_object(object_name)
    )
  else false
end
$function$;
-- Latest source: supabase/migrations/20261011191527_teacher_owned_catalogue_foundation.sql
CREATE OR REPLACE FUNCTION private.catalogue_row_visible(p_table text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_owner uuid; v_archived timestamptz; v_shared boolean; v_visible boolean;
begin
  if p_table='subjects' then
    select owner_teacher_id,archived_at into v_owner,v_archived from public.subjects where id=p_id;
  elsif p_table='education_nodes' then
    select owner_teacher_id,archived_at into v_owner,v_archived from public.education_nodes where id=p_id;
  elsif p_table='offerings' then
    select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=p_id;
  else
    return false;
  end if;
  if not found then return false; end if;
  v_shared := v_owner is null;
  if v_shared then return true; end if;
  if public.current_role()='admin'::public.user_role then return true; end if;
  if exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
            where p.id=v_owner and p.id=auth.uid() and p.role='teacher' and p.status='active') then
    return true;
  end if;
  if p_table='subjects' then
    select exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.profiles p on p.id=g.teacher_id join public.teacher_profiles t on t.id=p.id
      where o.subject_id=p_id and g.status='published' and p.role='teacher' and p.status='active' and t.approved and dars_private.teacher_has_access(g.teacher_id)
    ) or exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.enrollments e on e.group_id=g.id join public.profiles sp on sp.id=e.student_id
      where o.subject_id=p_id and e.student_id=auth.uid() and e.status='accepted' and sp.role='student' and sp.status='active'
    ) into v_visible;
  elsif p_table='education_nodes' then
    select exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.profiles p on p.id=g.teacher_id join public.teacher_profiles t on t.id=p.id
      where o.node_id=p_id and g.status='published' and p.role='teacher' and p.status='active' and t.approved and dars_private.teacher_has_access(g.teacher_id)
    ) or exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.enrollments e on e.group_id=g.id join public.profiles sp on sp.id=e.student_id
      where o.node_id=p_id and e.student_id=auth.uid() and e.status='accepted' and sp.role='student' and sp.status='active'
    ) into v_visible;
  else
    select exists(
      select 1 from public.groups g join public.profiles p on p.id=g.teacher_id
      join public.teacher_profiles t on t.id=p.id
      where g.offering_id=p_id and g.status='published' and p.role='teacher' and p.status='active' and t.approved and dars_private.teacher_has_access(g.teacher_id)
    ) or exists(
      select 1 from public.groups g join public.enrollments e on e.group_id=g.id join public.profiles sp on sp.id=e.student_id
      where g.offering_id=p_id and e.student_id=auth.uid() and e.status='accepted' and sp.role='student' and sp.status='active'
    ) into v_visible;
  end if;
  return coalesce(v_visible,false);
end
$function$;


-- Raw DML enforcement (auth.uid() identifies the actor even inside definer RPCs).
create or replace function dars_private.guard_teacher_teaching_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare
  v_actor uuid:=auth.uid();
  v_role public.user_role;
  v_actor_status public.user_status;
  v_old_group uuid;
  v_new_group uuid;
  v_old_owner uuid;
  v_new_owner uuid;
  v_old_lesson uuid;
  v_new_lesson uuid;
begin
  if v_actor is null then return coalesce(new,old); end if;
  select p.role,p.status into v_role,v_actor_status from public.profiles p where p.id=v_actor;
  if v_role='admin' and v_actor_status='active' then return coalesce(new,old); end if;
  if v_role is distinct from 'teacher' then return coalesce(new,old); end if;
  if v_actor_status is distinct from 'active'::public.user_status then
    raise exception 'active teacher required' using errcode='42501';
  end if;

  if tg_table_name='groups' then
    if tg_op<>'INSERT' then v_old_owner:=old.teacher_id; end if;
    if tg_op<>'DELETE' then v_new_owner:=new.teacher_id; end if;
  elsif tg_table_name in ('group_schedule_slots','group_lesson_exclusions','group_pinned_announcements') then
    if tg_op<>'INSERT' then v_old_group:=old.group_id; end if;
    if tg_op<>'DELETE' then v_new_group:=new.group_id; end if;
  elsif tg_table_name in ('lessons','lesson_materials') then
    if tg_table_name='lessons' then
      if tg_op<>'INSERT' then v_old_group:=old.group_id; end if;
      if tg_op<>'DELETE' then v_new_group:=new.group_id; end if;
    else
      if tg_op<>'INSERT' then v_old_lesson:=old.lesson_id; end if;
      if tg_op<>'DELETE' then v_new_lesson:=new.lesson_id; end if;
      select l.group_id into v_old_group from public.lessons l where l.id=v_old_lesson;
      select l.group_id into v_new_group from public.lessons l where l.id=v_new_lesson;
    end if;
  elsif tg_table_name in ('enrollments','lesson_attendance') then
    if tg_table_name='enrollments' then
      if tg_op<>'INSERT' then v_old_group:=old.group_id; end if;
      if tg_op<>'DELETE' then v_new_group:=new.group_id; end if;
      -- A student's own cancellation remains available after the group teacher expires.
      if v_actor=coalesce(case when tg_op<>'INSERT' then old.student_id end,case when tg_op<>'DELETE' then new.student_id end)
         and (tg_op='DELETE' or (tg_op='UPDATE' and new.status='cancelled')) then return coalesce(new,old); end if;
    else
      if tg_op<>'INSERT' then v_old_lesson:=old.lesson_id; end if;
      if tg_op<>'DELETE' then v_new_lesson:=new.lesson_id; end if;
      select l.group_id into v_old_group from public.lessons l where l.id=v_old_lesson;
      select l.group_id into v_new_group from public.lessons l where l.id=v_new_lesson;
    end if;
  else return coalesce(new,old);
  end if;

  if v_old_group is not null then select g.teacher_id into v_old_owner from public.groups g where g.id=v_old_group; end if;
  if v_new_group is not null then select g.teacher_id into v_new_owner from public.groups g where g.id=v_new_group; end if;
  -- OLD and NEW ownership are both checked, including reassignment attempts.
  if (v_old_owner is not null and v_old_owner is distinct from v_actor)
     or (v_new_owner is not null and v_new_owner is distinct from v_actor) then
    raise exception 'active teaching owner required' using errcode='42501';
  end if;
  if (v_old_owner=v_actor or v_new_owner=v_actor) and not coalesce(dars_private.teacher_has_access(v_actor),false) then
    raise exception 'teacher teaching access expired' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;
revoke all on function dars_private.guard_teacher_teaching_write() from public,anon,authenticated,service_role;
create trigger groups_teacher_access_guard before insert or update or delete on public.groups for each row execute function dars_private.guard_teacher_teaching_write();
create trigger group_schedule_slots_teacher_access_guard before insert or update or delete on public.group_schedule_slots for each row execute function dars_private.guard_teacher_teaching_write();
create trigger group_lesson_exclusions_teacher_access_guard before insert or update or delete on public.group_lesson_exclusions for each row execute function dars_private.guard_teacher_teaching_write();
create trigger lessons_teacher_access_guard before insert or update or delete on public.lessons for each row execute function dars_private.guard_teacher_teaching_write();
create trigger lesson_materials_teacher_access_guard before insert or update or delete on public.lesson_materials for each row execute function dars_private.guard_teacher_teaching_write();
create trigger enrollments_teacher_access_guard before insert or update or delete on public.enrollments for each row execute function dars_private.guard_teacher_teaching_write();
create trigger lesson_attendance_teacher_access_guard before insert or update or delete on public.lesson_attendance for each row execute function dars_private.guard_teacher_teaching_write();
create trigger group_pinned_announcements_teacher_access_guard before insert or update or delete on public.group_pinned_announcements for each row execute function dars_private.guard_teacher_teaching_write();

commit;
