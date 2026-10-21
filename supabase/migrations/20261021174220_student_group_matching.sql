begin;

create or replace function public.student_matching_weekdays_valid(p_weekdays integer[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_weekdays is not null
    and coalesce(array_ndims(p_weekdays), 1) <= 1
    and cardinality(p_weekdays) <= 7
    and array_position(p_weekdays, null) is null
    and 0 <= all(p_weekdays)
    and 6 >= all(p_weekdays)
    and cardinality(p_weekdays) = (
      select count(distinct day) from unnest(p_weekdays) as weekdays(day)
    );
$$;
revoke all on function public.student_matching_weekdays_valid(integer[]) from public, anon;
grant execute on function public.student_matching_weekdays_valid(integer[]) to authenticated, service_role;

alter table public.student_profiles
  add column preferred_weekdays integer[] not null default '{}'::integer[],
  add constraint student_profiles_preferred_weekdays_check
    check (public.student_matching_weekdays_valid(preferred_weekdays));

create or replace function dars_private.normalize_matching_text(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function dars_private.normalize_matching_text(text) from public, anon, authenticated, service_role;

create or replace function dars_private.matching_phrase_in_text(p_phrase text, p_text text)
returns boolean
language sql
immutable
set search_path = pg_catalog, dars_private
as $$
  with tokenized as (
    select
      btrim(regexp_replace(
        regexp_replace(dars_private.normalize_matching_text(p_phrase), '[^[:alnum:]#+]+', ' ', 'g'),
        '[[:space:]]+', ' ', 'g'
      )) as phrase,
      btrim(regexp_replace(
        regexp_replace(dars_private.normalize_matching_text(p_text), '[^[:alnum:]#+]+', ' ', 'g'),
        '[[:space:]]+', ' ', 'g'
      )) as text
  )
  select phrase <> '' and position(' ' || phrase || ' ' in ' ' || text || ' ') > 0
  from tokenized;
$$;
revoke all on function dars_private.matching_phrase_in_text(text, text) from public, anon, authenticated, service_role;

create or replace function public.save_student_matching_preferences(
  p_preferred_weekdays integer[],
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.student_profiles%rowtype;
  v_weekdays integer[];
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'student' and p.status = 'active'
  ) then
    raise exception 'active student required' using errcode = '42501';
  end if;

  if not public.student_matching_weekdays_valid(p_preferred_weekdays) then
    raise exception 'invalid preferred weekdays' using errcode = '22023';
  end if;

  select * into v_profile
  from public.student_profiles
  where id = v_user_id
  for update;
  if not found then
    raise exception 'student profile not found' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or v_profile.updated_at is distinct from p_expected_updated_at then
    raise exception 'student profile changed' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(day order by day), '{}'::integer[])
  into v_weekdays
  from unnest(p_preferred_weekdays) as weekdays(day);

  update public.student_profiles
  set preferred_weekdays = v_weekdays,
      updated_at = clock_timestamp()
  where id = v_user_id
  returning * into v_profile;

  return jsonb_build_object(
    'preferred_weekdays', v_profile.preferred_weekdays,
    'updated_at', v_profile.updated_at
  );
end
$$;

create or replace function public.student_group_recommendations(
  p_offset integer default 0,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.student_profiles%rowtype;
  v_has_profile_signals boolean;
  v_total bigint;
  v_rows jsonb;
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000
     or p_limit is null or p_limit < 1 or p_limit > 12 then
    raise exception 'invalid page' using errcode = '22023';
  end if;
  if v_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'student' and p.status = 'active'
  ) then
    raise exception 'active student required' using errcode = '42501';
  end if;

  select * into v_profile
  from public.student_profiles
  where id = v_user_id;
  if not found then
    raise exception 'student profile not found' using errcode = '42501';
  end if;
  v_has_profile_signals := cardinality(v_profile.interests) > 0
    or dars_private.normalize_matching_text(v_profile.education_year) <> ''
    or dars_private.normalize_matching_text(v_profile.learning_goal) <> ''
    or cardinality(v_profile.preferred_weekdays) > 0;

  with recursive visible_groups as (
    select pg.*, o.node_id
    from public.public_groups() pg
    join public.offerings o on o.id = pg.offering_id
    where pg.available_seats > 0
      and not exists (
        select 1 from public.enrollments e
        where e.group_id = pg.id
          and e.student_id = v_user_id
          and e.status in ('pending', 'accepted')
      )
  ), node_ancestors(group_id, node_id, parent_id, name_ar, name_en) as (
    select vg.id, n.id, n.parent_id, n.name_ar, n.name_en
    from visible_groups vg
    join public.education_nodes n on n.id = vg.node_id
    union
    select na.group_id, parent.id, parent.parent_id, parent.name_ar, parent.name_en
    from node_ancestors na
    join public.education_nodes parent on parent.id = na.parent_id
  ), group_schedule as (
    select s.group_id,
           array_agg(distinct s.weekday order by s.weekday)::integer[] as weekdays
    from public.group_schedule_slots s
    join visible_groups vg on vg.id = s.group_id
    group by s.group_id
  ), upcoming_lessons as (
    select l.group_id, min(l.starts_at) as next_lesson_at
    from public.lessons l
    join visible_groups vg on vg.id = l.group_id
    where l.status = 'scheduled'
      and l.starts_at > statement_timestamp()
    group by l.group_id
  ), matched as (
    select
      vg.*,
      coalesce(gs.weekdays, '{}'::integer[]) as weekdays,
      ul.next_lesson_at,
      exists (
        select 1
        from unnest(v_profile.interests) as interest(phrase)
        cross join lateral (values (vg.subject_name_ar), (vg.subject_name_en)) as labels(label)
        where dars_private.normalize_matching_text(interest.phrase) <> ''
          and dars_private.normalize_matching_text(labels.label) <> ''
          and dars_private.matching_phrase_in_text(interest.phrase, labels.label)
      ) as interest_match,
      exists (
        select 1
        from node_ancestors na
        cross join lateral (values (na.name_ar), (na.name_en)) as labels(label)
        where na.group_id = vg.id
          and dars_private.normalize_matching_text(labels.label) <> ''
          and dars_private.normalize_matching_text(v_profile.education_year)
            = dars_private.normalize_matching_text(labels.label)
      ) as education_match,
      exists (
        select 1
        from lateral (values (vg.subject_name_ar), (vg.subject_name_en)) as labels(label)
        where dars_private.normalize_matching_text(labels.label) <> ''
          and dars_private.normalize_matching_text(v_profile.learning_goal) <> ''
          and dars_private.matching_phrase_in_text(labels.label, v_profile.learning_goal)
      ) as goal_match,
      coalesce(gs.weekdays, '{}'::integer[]) && v_profile.preferred_weekdays as weekday_match
    from visible_groups vg
    left join group_schedule gs on gs.group_id = vg.id
    left join upcoming_lessons ul on ul.group_id = vg.id
  ), scored as (
    select m.*,
      (case when interest_match then 4 else 0 end
       + case when education_match then 3 else 0 end
       + case when goal_match then 2 else 0 end
       + case when weekday_match then 1 else 0 end) as score,
      array_remove(array[
        case when interest_match then 'interest_subject_text' end,
        case when education_match then 'education_label_text' end,
        case when goal_match then 'goal_subject_text' end,
        case when weekday_match then 'preferred_weekday' end
      ]::text[], null) as reason_codes
    from matched m
  ), candidates as (
    select * from scored where score > 0
  ), page_rows as (
    select * from candidates
    order by score desc, id asc
    offset p_offset limit p_limit
  ), page_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'teacher_id', q.teacher_id,
    'offering_id', q.offering_id,
    'name', q.name,
    'description', q.description,
    'capacity', q.capacity,
    'status', q.status,
    'location', q.location,
    'created_at', q.created_at,
    'teacher_name', q.teacher_name,
    'subject_name_ar', q.subject_name_ar,
    'subject_name_en', q.subject_name_en,
    'node_name_ar', q.node_name_ar,
    'node_name_en', q.node_name_en,
    'accepted_count', q.accepted_count,
    'available_seats', q.available_seats,
    'weekdays', q.weekdays,
    'next_lesson_at', q.next_lesson_at,
    'reason_codes', q.reason_codes
  ) order by q.score desc, q.id asc), '[]'::jsonb) as rows
    from page_rows q
  )
  select (select count(*) from candidates), page_json.rows
  into v_total, v_rows
  from page_json;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'has_profile_signals', v_has_profile_signals,
    'preferred_weekdays', v_profile.preferred_weekdays,
    'profile_updated_at', v_profile.updated_at
  );
end
$$;

revoke all on function public.save_student_matching_preferences(integer[],timestamptz) from public, anon, service_role;
grant execute on function public.save_student_matching_preferences(integer[],timestamptz) to authenticated;
revoke all on function public.student_group_recommendations(integer,integer) from public, anon, service_role;
grant execute on function public.student_group_recommendations(integer,integer) to authenticated;

commit;
