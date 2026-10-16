begin;

-- Existing students keep their current access and may complete this profile later.
alter table public.student_profiles
  add column age_range text,
  add column education_year text not null default '',
  add column interests text[] not null default '{}',
  add column learning_goal text not null default '',
  add column school_name text not null default '',
  add column onboarding_required boolean not null default false,
  add column onboarding_completed_at timestamptz,
  add column updated_at timestamptz not null default clock_timestamp();

create or replace function public.student_learning_interests_valid(p_interests text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_interests is not null
    and cardinality(p_interests) between 0 and 10
    and array_position(p_interests, null) is null
    and not exists (
      select 1 from unnest(p_interests) as entries(item)
      where btrim(item) = '' or char_length(item) > 80
    )
    and (select count(distinct lower(btrim(item))) from unnest(p_interests) as entries(item)) = cardinality(p_interests);
$$;
revoke all on function public.student_learning_interests_valid(text[]) from public, anon;
grant execute on function public.student_learning_interests_valid(text[]) to authenticated;

alter table public.student_profiles
  add constraint student_profiles_age_range_check
    check (age_range is null or age_range in ('under_13','13_15','16_17','18_24','25_plus')),
  add constraint student_profiles_education_year_length_check
    check (char_length(education_year) <= 100),
  add constraint student_profiles_interests_count_check
    check (cardinality(interests) <= 10),
  add constraint student_profiles_interests_values_check
    check (public.student_learning_interests_valid(interests)),
  add constraint student_profiles_learning_goal_length_check
    check (char_length(learning_goal) <= 1000),
  add constraint student_profiles_school_name_length_check
    check (char_length(school_name) <= 160);

-- New students must complete the profile; the default above leaves migrated users optional.
alter table public.student_profiles alter column onboarding_required set default true;

-- Student details are private to the active owner and active administrators.
drop policy if exists student_read on public.student_profiles;
create policy student_read on public.student_profiles for select to authenticated
  using (
    (id = (select auth.uid()) and public.is_active_user())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
    )
  );
drop policy if exists student_update on public.student_profiles;
create policy student_update on public.student_profiles for update to authenticated
  using (id = (select auth.uid()) and public.is_active_user())
  with check (id = (select auth.uid()) and public.is_active_user());
revoke insert, update on public.student_profiles from authenticated;
revoke insert (id, offering_id, created_at, age_range, education_year, interests, learning_goal, school_name, onboarding_required, onboarding_completed_at, updated_at),
  update (id, offering_id, created_at, age_range, education_year, interests, learning_goal, school_name, onboarding_required, onboarding_completed_at, updated_at)
  on public.student_profiles from authenticated;
-- Preserve the existing student catalogue preference API; profile and private learning fields stay RPC-only.
grant update (offering_id) on public.student_profiles to authenticated;

create or replace function public.save_student_learning_profile(
  p_full_name text,
  p_age_range text,
  p_education_year text,
  p_interests text[],
  p_learning_goal text,
  p_school_name text,
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
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_year text := btrim(coalesce(p_education_year, ''));
  v_goal text := btrim(coalesce(p_learning_goal, ''));
  v_school text := btrim(coalesce(p_school_name, ''));
  v_interests text[];
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'active account required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'student' and p.status = 'active'
  ) then
    raise exception 'active student required' using errcode = '42501';
  end if;

  if v_full_name is null or char_length(v_full_name) not between 2 and 100
     or p_age_range is null or p_age_range not in ('under_13','13_15','16_17','18_24','25_plus')
     or v_year is null or char_length(v_year) not between 1 and 100
     or v_goal is null or char_length(v_goal) not between 10 and 1000
     or v_school is null or char_length(v_school) > 160
     or p_interests is null or cardinality(p_interests) not between 1 and 10
     or array_position(p_interests, null) is not null
     or exists (select 1 from unnest(p_interests) as entries(item) where char_length(btrim(item)) not between 1 and 80)
     or (select count(distinct lower(btrim(item))) from unnest(p_interests) as entries(item)) <> cardinality(p_interests)
  then
    raise exception 'invalid student learning profile' using errcode = '22023';
  end if;
  v_interests := array(select btrim(item) from unnest(p_interests) as entries(item));

  select * into v_profile from public.student_profiles where id = v_user_id for update;
  if not found then raise exception 'student profile not found' using errcode = '42501'; end if;
  if p_expected_updated_at is null or v_profile.updated_at is distinct from p_expected_updated_at then
    raise exception 'student profile changed' using errcode = 'PT409';
  end if;

  update public.profiles set full_name = v_full_name where id = v_user_id;
  update public.student_profiles
  set age_range = p_age_range,
      education_year = v_year,
      interests = v_interests,
      learning_goal = v_goal,
      school_name = v_school,
      onboarding_required = false,
      onboarding_completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_user_id
  returning * into v_profile;

  return jsonb_build_object(
    'full_name', v_full_name,
    'age_range', v_profile.age_range,
    'education_year', v_profile.education_year,
    'interests', v_profile.interests,
    'learning_goal', v_profile.learning_goal,
    'school_name', v_profile.school_name,
    'onboarding_required', v_profile.onboarding_required,
    'onboarding_completed_at', v_profile.onboarding_completed_at,
    'updated_at', v_profile.updated_at
  );
end
$$;

revoke all on function public.save_student_learning_profile(text,text,text,text[],text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.save_student_learning_profile(text,text,text,text[],text,text,timestamptz) to authenticated;

commit;
