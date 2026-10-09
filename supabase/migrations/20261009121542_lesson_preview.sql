create schema if not exists dars_private;
revoke all on schema dars_private from public, anon, authenticated;

create table public.group_lesson_exclusions (
  group_id uuid not null references public.groups(id) on delete cascade,
  local_date date not null,
  primary key (group_id, local_date)
);
alter table public.group_lesson_exclusions enable row level security;
revoke all on table public.group_lesson_exclusions from public, anon, authenticated;
grant select on table public.group_lesson_exclusions to authenticated;
create policy group_lesson_exclusions_owner_read
  on public.group_lesson_exclusions for select to authenticated
  using (public.is_group_owner(group_id) or public.current_role() = 'admin'::public.user_role);

create or replace function dars_private.cairo_local_instant(p_local_date date, p_local_time time)
returns timestamptz
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_wall timestamp without time zone;
  v_wall_utc timestamptz;
  v_offset interval;
  v_candidate timestamptz;
  v_match timestamptz;
  v_match_count integer := 0;
begin
  if p_local_date is null or p_local_time is null or p_local_time = time '24:00' then
    raise exception 'invalid Cairo local date/time: % %', p_local_date, p_local_time using errcode = '22007';
  end if;

  v_wall := p_local_date + p_local_time;
  v_wall_utc := v_wall at time zone 'UTC';
  for v_offset in
    select distinct ((v_wall + sample.delta) at time zone 'Africa/Cairo')
                    - ((v_wall + sample.delta) at time zone 'UTC')
    from (values (interval '-1 day'), (interval '0 day'), (interval '1 day')) as sample(delta)
  loop
    v_candidate := v_wall_utc + v_offset;
    if (v_candidate at time zone 'Africa/Cairo') = v_wall then
      v_match_count := v_match_count + 1;
      v_match := v_candidate;
    end if;
  end loop;

  if v_match_count <> 1 then
    raise exception 'Cairo local time is missing or ambiguous on % at %', p_local_date, p_local_time using errcode = '22007';
  end if;
  return v_match;
end;
$$;

create or replace function dars_private.lesson_generation_candidates(p_group_id uuid, p_from date, p_until date)
returns table (
  slot_id uuid,
  local_date date,
  start_time time,
  end_time time,
  starts_at timestamptz,
  ends_at timestamptz,
  state text,
  conflict_lesson_id uuid,
  conflict_group_id uuid,
  conflict_title text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dars_private
as $$
declare
  v_teacher_id uuid;
  v_day date;
  v_slot record;
  v_existing record;
  v_conflict record;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_from is null or p_until is null then
    raise exception 'generation range dates are required' using errcode = '22023';
  end if;
  if p_until < p_from or p_until - p_from > 90 then
    raise exception 'generation range must be 0 to 90 days inclusive' using errcode = '22023';
  end if;

  select g.teacher_id into v_teacher_id from public.groups as g where g.id = p_group_id;
  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;

  for v_day in select p_from + series.day_offset from generate_series(0, p_until - p_from) as series(day_offset)
  loop
    for v_slot in
      select s.id, s.start_time, s.end_time
      from public.group_schedule_slots as s
      where s.group_id = p_group_id and s.weekday = extract(dow from v_day)::integer
      order by s.id
    loop
      slot_id := v_slot.id;
      local_date := v_day;
      start_time := v_slot.start_time;
      end_time := v_slot.end_time;
      conflict_lesson_id := null;
      conflict_group_id := null;
      conflict_title := null;

      select l.starts_at, l.ends_at into v_existing
      from public.lessons as l
      where l.group_id = p_group_id and l.slot_id = v_slot.id and l.local_date = v_day;
      if found then
        starts_at := v_existing.starts_at;
        ends_at := v_existing.ends_at;
        state := 'already_generated';
        return next;
        continue;
      end if;

      if exists (select 1 from public.group_lesson_exclusions as e where e.group_id = p_group_id and e.local_date = v_day) then
        starts_at := null;
        ends_at := null;
        state := 'excluded';
        return next;
        continue;
      end if;

      starts_at := dars_private.cairo_local_instant(v_day, v_slot.start_time);
      ends_at := dars_private.cairo_local_instant(v_day, v_slot.end_time);
      v_start := starts_at;
      v_end := ends_at;
      select l.id, l.group_id, l.title into v_conflict
      from public.lessons as l
      join public.groups as conflict_group on conflict_group.id = l.group_id
      where conflict_group.teacher_id = v_teacher_id
        and l.status in ('scheduled'::public.lesson_status, 'completed'::public.lesson_status)
        and l.starts_at < v_end and l.ends_at > v_start
        and not (l.group_id = p_group_id
                 and l.slot_id is not distinct from v_slot.id
                 and l.local_date is not distinct from v_day)
      order by l.starts_at, l.ends_at, l.id
      limit 1;
      if found then
        state := 'conflicting';
        conflict_lesson_id := v_conflict.id;
        conflict_group_id := v_conflict.group_id;
        conflict_title := v_conflict.title;
      else
        state := 'ready';
      end if;
      return next;
    end loop;
  end loop;
end;
$$;

revoke all on function dars_private.cairo_local_instant(date, time) from public, anon, authenticated;
revoke all on function dars_private.lesson_generation_candidates(uuid, date, date) from public, anon, authenticated;

create or replace function public.preview_lesson_generation(p_group_id uuid, p_from date, p_until date)
returns table (
  slot_id uuid,
  local_date date,
  start_time time,
  end_time time,
  starts_at timestamptz,
  ends_at timestamptz,
  state text,
  conflict_lesson_id uuid,
  conflict_group_id uuid,
  conflict_title text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
begin
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
$$;
revoke all on function public.preview_lesson_generation(uuid, date, date) from public, anon;
grant execute on function public.preview_lesson_generation(uuid, date, date) to authenticated;
