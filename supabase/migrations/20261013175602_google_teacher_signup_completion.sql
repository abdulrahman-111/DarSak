begin;

create table dars_private.pending_google_signups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table dars_private.pending_google_signups enable row level security;
revoke all on dars_private.pending_google_signups from public, anon, authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, dars_private
as $$
declare
  requested text := new.raw_user_meta_data->>'requested_role';
begin
  if new.raw_app_meta_data->>'provider' = 'google' then
    insert into dars_private.pending_google_signups(user_id) values(new.id);
    return new;
  end if;

  if requested is null or requested not in ('student','teacher') then requested := 'student'; end if;
  insert into public.profiles(id,full_name,role)
  values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'New user'),requested::public.user_role);
  if requested='teacher' then
    insert into public.teacher_profiles(id) values(new.id);
  else
    insert into public.student_profiles(id) values(new.id);
  end if;
  return new;
end
$$;

create or replace function public.complete_google_signup(p_role text)
returns public.user_role
language plpgsql
security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_role public.user_role;
  v_full_name text;
begin
  if v_user_id is null then
    raise exception 'authenticated user required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('student','teacher') then
    raise exception 'role must be student or teacher' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('google-signup-completion:' || v_user_id::text, 0));

  perform 1 from dars_private.pending_google_signups
  where user_id = v_user_id
  for update;
  if not found then
    select role into v_existing_role from public.profiles where id = v_user_id;
    if v_existing_role is not null then return v_existing_role; end if;
    raise exception 'pending Google signup not found' using errcode = '42501';
  end if;

  select role into v_existing_role from public.profiles where id = v_user_id;
  if v_existing_role is not null then
    delete from dars_private.pending_google_signups where user_id = v_user_id;
    return v_existing_role;
  end if;

  select coalesce(
    nullif(btrim(raw_user_meta_data->>'full_name'),''),
    nullif(btrim(raw_user_meta_data->>'name'),''),
    'New user'
  ) into v_full_name
  from auth.users where id = v_user_id;
  if not found then
    raise exception 'Google signup user not found' using errcode = '42501';
  end if;

  insert into public.profiles(id,full_name,role)
  values(v_user_id,v_full_name,p_role::public.user_role);
  if p_role = 'teacher' then
    insert into public.teacher_profiles(id) values(v_user_id);
  else
    insert into public.student_profiles(id) values(v_user_id);
  end if;

  delete from dars_private.pending_google_signups where user_id = v_user_id;
  return p_role::public.user_role;
end
$$;

revoke all on function public.complete_google_signup(text) from public, anon, authenticated, service_role;
grant execute on function public.complete_google_signup(text) to authenticated;

commit;
