begin;

create or replace function public.discover_groups(
  p_subject_id uuid default null,
  p_node_id uuid default null,
  p_teacher_id uuid default null,
  p_weekday integer default null,
  p_has_seats boolean default false,
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 12
)
returns table(
  id uuid,
  teacher_id uuid,
  offering_id uuid,
  name text,
  description text,
  capacity integer,
  status public.group_status,
  location text,
  created_at timestamptz,
  teacher_name text,
  subject_name_ar text,
  subject_name_en text,
  node_name_ar text,
  node_name_en text,
  accepted_count bigint,
  available_seats bigint,
  weekdays integer[],
  next_lesson_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
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
    join public.teacher_profiles tp on tp.id = p.id and tp.approved = true
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
$$;

create or replace function public.public_group_detail(p_group_id uuid)
returns table(
  id uuid,
  teacher_id uuid,
  offering_id uuid,
  name text,
  description text,
  capacity integer,
  status public.group_status,
  location text,
  created_at timestamptz,
  teacher_name text,
  subject_name_ar text,
  subject_name_en text,
  node_name_ar text,
  node_name_en text,
  accepted_count bigint,
  available_seats bigint,
  weekdays integer[],
  next_lesson_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with eligible_group as (
    select g.id, g.teacher_id, g.offering_id, g.name, g.description,
      g.capacity, g.status, g.location, g.created_at,
      p.full_name as teacher_name, s.name_ar as subject_name_ar,
      s.name_en as subject_name_en, n.name_ar as node_name_ar,
      n.name_en as node_name_en
    from public.groups g
    join public.profiles p on p.id = g.teacher_id
      and p.role = 'teacher' and p.status = 'active'
    join public.teacher_profiles tp on tp.id = p.id and tp.approved = true
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
$$;

revoke all on function public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.public_group_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer) to anon, authenticated;
grant execute on function public.public_group_detail(uuid) to anon, authenticated;

commit;
