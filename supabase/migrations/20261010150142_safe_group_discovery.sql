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
    select n.id
    from public.education_nodes n
    where n.id = p_node_id
    union
    select child.id
    from public.education_nodes child
    join descendant_nodes parent on child.parent_id = parent.id
  ), visible_groups as (
    -- Keep the existing public projection as the authority for publication,
    -- teacher approval and live account status.
    select pg.*
    from public.public_groups() pg
    join public.groups g on g.id = pg.id
    join public.offerings o on o.id = g.offering_id
    where (p_subject_id is null or o.subject_id = p_subject_id)
      and (p_node_id is null or o.node_id in (select dn.id from descendant_nodes dn))
      and (p_teacher_id is null or g.teacher_id = p_teacher_id)
      and (p_weekday is null or exists (
        select 1 from public.group_schedule_slots s
        where s.group_id = g.id and s.weekday = p_weekday
      ))
      and (p_has_seats is distinct from true or pg.available_seats > 0)
      and (v_query = '' or position(v_query in lower(concat_ws(' ',
        pg.name, pg.description, pg.location, pg.teacher_name,
        pg.subject_name_ar, pg.subject_name_en, pg.node_name_ar, pg.node_name_en
      ))) > 0)
  )
  select
    vg.id, vg.teacher_id, vg.offering_id, vg.name, vg.description,
    vg.capacity, vg.status, vg.location, vg.created_at, vg.teacher_name,
    vg.subject_name_ar, vg.subject_name_en, vg.node_name_ar, vg.node_name_en,
    vg.accepted_count, vg.available_seats,
    coalesce(schedule.weekdays, array[]::integer[]), upcoming.next_lesson_at
  from visible_groups vg
  left join lateral (
    select array_agg(distinct s.weekday order by s.weekday)::integer[] as weekdays
    from public.group_schedule_slots s
    where s.group_id = vg.id
  ) schedule on true
  left join lateral (
    select min(l.starts_at) as next_lesson_at
    from public.lessons l
    where l.group_id = vg.id
      and l.status = 'scheduled'
      and l.starts_at > statement_timestamp()
  ) upcoming on true
  order by vg.id
  offset p_offset
  limit p_limit;
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
  select
    pg.id, pg.teacher_id, pg.offering_id, pg.name, pg.description,
    pg.capacity, pg.status, pg.location, pg.created_at, pg.teacher_name,
    pg.subject_name_ar, pg.subject_name_en, pg.node_name_ar, pg.node_name_en,
    pg.accepted_count, pg.available_seats,
    coalesce(schedule.weekdays, array[]::integer[]), upcoming.next_lesson_at
  from public.public_groups() pg
  left join lateral (
    select array_agg(distinct s.weekday order by s.weekday)::integer[] as weekdays
    from public.group_schedule_slots s
    where s.group_id = pg.id
  ) schedule on true
  left join lateral (
    select min(l.starts_at) as next_lesson_at
    from public.lessons l
    where l.group_id = pg.id
      and l.status = 'scheduled'
      and l.starts_at > statement_timestamp()
  ) upcoming on true
  where pg.id = p_group_id
$$;

revoke all on function public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.public_group_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.discover_groups(uuid,uuid,uuid,integer,boolean,text,integer,integer) to anon, authenticated;
grant execute on function public.public_group_detail(uuid) to anon, authenticated;

commit;
