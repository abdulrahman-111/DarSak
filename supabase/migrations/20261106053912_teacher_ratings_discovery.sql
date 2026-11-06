begin;
create or replace function dars_private.public_teacher_rating_aggregate(p_teacher_ids uuid[] default null)
returns table(teacher_id uuid, rating_average numeric, rating_count bigint)
language sql stable security definer set search_path=pg_catalog,public,dars_private
as $$
 select g.teacher_id, avg(gf.rating)::numeric, count(*)::bigint
 from dars_private.group_feedback gf join public.groups g on g.id=gf.group_id and g.status='published'
 join public.profiles tp on tp.id=g.teacher_id and tp.role='teacher' and tp.status='active'
 join public.teacher_profiles teacher on teacher.id=tp.id and teacher.approved and dars_private.teacher_has_access(tp.id)
 join public.profiles student on student.id=gf.student_id and student.role='student' and student.status='active'
 where gf.status='approved' and (p_teacher_ids is null or g.teacher_id=any(p_teacher_ids))
 group by g.teacher_id
$$;
revoke all on function dars_private.public_teacher_rating_aggregate(uuid[]) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.discover_groups_rated(p_subject_id uuid DEFAULT NULL::uuid, p_node_id uuid DEFAULT NULL::uuid, p_teacher_id uuid DEFAULT NULL::uuid, p_weekday integer DEFAULT NULL::integer, p_has_seats boolean DEFAULT false, p_query text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 12, p_sort text DEFAULT 'default'::text, p_min_rating integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, teacher_id uuid, offering_id uuid, name text, description text, capacity integer, status group_status, location text, created_at timestamp with time zone, teacher_name text, subject_name_ar text, subject_name_en text, node_name_ar text, node_name_en text, accepted_count bigint, available_seats bigint, weekdays integer[], next_lesson_at timestamp with time zone, teacher_rating_average numeric, teacher_rating_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if coalesce(p_sort,'') not in ('default','rating') then raise exception 'unsupported sort' using errcode='22023'; end if;
  if p_min_rating is not null and p_min_rating not between 1 and 5 then raise exception 'minimum rating must be between 1 and 5' using errcode='22023'; end if;
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
  ), rated as (
    select c.*, greatest(c.capacity::bigint-c.accepted_count,0::bigint) as available_seats,
      case when coalesce(a.rating_count,0)>=3 then round(a.rating_average,1) else null end as public_rating_average,
      case when coalesce(a.rating_count,0)>=3 then a.rating_count else 0::bigint end as public_rating_count
    from counts c left join dars_private.public_teacher_rating_aggregate(array(select distinct c.teacher_id from counts c)) a on a.teacher_id=c.teacher_id
    where (p_has_seats is distinct from true or greatest(c.capacity::bigint-c.accepted_count,0::bigint)>0)
      and (p_min_rating is null or (coalesce(a.rating_count,0)>=3 and round(a.rating_average,1)>=p_min_rating))
  ), eligible_page as (
    select r.* from rated r
    order by case when p_sort='rating' then r.public_rating_average end desc nulls last,
      case when p_sort='rating' then r.public_rating_count end desc, r.id
    offset p_offset
    limit p_limit
  )
  select pg.id, pg.teacher_id, pg.offering_id, pg.name, pg.description,
    pg.capacity, pg.status, pg.location, pg.created_at, pg.teacher_name,
    pg.subject_name_ar, pg.subject_name_en, pg.node_name_ar, pg.node_name_en,
    pg.accepted_count, pg.available_seats,
    coalesce(schedule.weekdays, array[]::integer[]), upcoming.next_lesson_at,
    pg.public_rating_average, pg.public_rating_count
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
  order by case when p_sort='rating' then pg.public_rating_average end desc nulls last, case when p_sort='rating' then pg.public_rating_count end desc, pg.id;
end;
$function$;
revoke all on function public.discover_groups_rated(uuid,uuid,uuid,integer,boolean,text,integer,integer,text,integer) from public;
grant execute on function public.discover_groups_rated(uuid,uuid,uuid,integer,boolean,text,integer,integer,text,integer) to anon,authenticated;

create or replace function public.public_teachers_rated()
returns table(id uuid,full_name text,headline text,bio text,avatar_path text,teacher_rating_average numeric,teacher_rating_count bigint)
language sql stable security definer set search_path=pg_catalog,public,dars_private
as $$
 select t.id,t.full_name,t.headline,t.bio,t.avatar_path,
   case when coalesce(a.rating_count,0)>=3 then round(a.rating_average,1) else null end,
   case when coalesce(a.rating_count,0)>=3 then a.rating_count else 0::bigint end
 from public.public_teachers() t left join dars_private.public_teacher_rating_aggregate() a on a.teacher_id=t.id
$$;
revoke all on function public.public_teachers_rated() from public;
grant execute on function public.public_teachers_rated() to anon,authenticated;

commit;
