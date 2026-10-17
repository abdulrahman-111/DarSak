begin;

-- Preserve surviving attendance when its recorder deletes their account.
alter table public.lesson_attendance
  alter column recorded_by drop not null;
alter table public.lesson_attendance
  drop constraint lesson_attendance_recorded_by_fkey;
alter table public.lesson_attendance
  add constraint lesson_attendance_recorded_by_fkey
  foreign key (recorded_by) references public.profiles(id) on delete set null;

-- Serialize every removal of active administrator authority. The trigger also
-- covers existing admin_update_user suspension/demotion paths.
create or replace function dars_private.guard_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_active_admin boolean;
  v_new_active_admin boolean := false;
begin
  v_old_active_admin := old.role = 'admin'::public.user_role
    and old.status = 'active'::public.user_status;
  if tg_op = 'UPDATE' then
    v_new_active_admin := new.role = 'admin'::public.user_role
      and new.status = 'active'::public.user_status;
  end if;

  if v_old_active_admin and not v_new_active_admin then
    -- A single global transaction lock prevents two concurrent demotions or
    -- deletes from each observing the other administrator as still active.
    perform pg_advisory_xact_lock(1976882461, 1101);
    if not exists (
      select 1 from public.profiles p
      where p.role = 'admin'::public.user_role
        and p.status = 'active'::public.user_status
        and p.id <> old.id
    ) then
      raise exception 'last_active_admin' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
revoke all on function dars_private.guard_last_active_admin() from public, anon, authenticated, service_role;
drop trigger if exists profiles_last_active_admin_guard on public.profiles;
create trigger profiles_last_active_admin_guard
before delete or update of role, status on public.profiles
for each row execute function dars_private.guard_last_active_admin();

create table dars_private.account_deletion_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  nonce_hash text not null check (nonce_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  oauth_amr_at timestamptz,
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index account_deletion_intents_user_expiry_idx
  on dars_private.account_deletion_intents(user_id, expires_at desc);
alter table dars_private.account_deletion_intents enable row level security;
revoke all on dars_private.account_deletion_intents from public, anon, authenticated, service_role;

create table dars_private.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  state text not null default 'queued'
    check (state in ('queued','storage_pending','auth_pending','completed')),
  manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(manifest) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  safe_error text check (safe_error is null or safe_error ~ '^[a-z0-9_]{1,80}$'),
  check ((lease_token is null) = (lease_expires_at is null))
);
create index account_deletion_requests_claim_idx
  on dars_private.account_deletion_requests(state, lease_expires_at, created_at, id)
  where state <> 'completed';
create unique index account_deletion_one_open_request_idx
  on dars_private.account_deletion_requests(user_id) where state <> 'completed';
alter table dars_private.account_deletion_requests enable row level security;
revoke all on dars_private.account_deletion_requests from public, anon, authenticated, service_role;

-- Material and Storage writes take the same per-owner advisory lock as prepare.
-- A writer that started first commits before preflight; a writer that starts
-- after prepare sees the durable request and cannot attach/create more data.
create or replace function dars_private.guard_account_deletion_material_write()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, storage
as $$
declare
  v_owner_id text;
  v_owner_ids text[] := array[new.uploaded_by::text];
begin
  if tg_op='UPDATE' then
    v_owner_ids := array_append(v_owner_ids,old.uploaded_by::text);
  end if;
  if new.storage_path is not null and split_part(new.storage_path,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_owner_ids := array_append(v_owner_ids,lower(split_part(new.storage_path,'/',1)));
  end if;
  if tg_op='UPDATE' and old.storage_path is not null
     and split_part(old.storage_path,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_owner_ids := array_append(v_owner_ids,lower(split_part(old.storage_path,'/',1)));
  end if;
  for v_owner_id in
    select distinct owner_uid from (
      select unnest(v_owner_ids) as owner_uid
      union
      select o.owner_id from storage.objects o
        where o.bucket_id='lesson-materials' and o.name=new.storage_path and new.storage_path is not null
      union
      select o.owner::text from storage.objects o
        where o.bucket_id='lesson-materials' and o.name=new.storage_path and new.storage_path is not null
      union
      select o.owner_id from storage.objects o
        where tg_op='UPDATE' and o.bucket_id='lesson-materials' and o.name=old.storage_path and old.storage_path is not null
      union
      select o.owner::text from storage.objects o
        where tg_op='UPDATE' and o.bucket_id='lesson-materials' and o.name=old.storage_path and old.storage_path is not null
    ) owners where owner_uid is not null order by owner_uid
  loop
    perform pg_advisory_xact_lock(hashtextextended('account-deletion-owner:'||v_owner_id,0));
    if exists(select 1 from dars_private.account_deletion_requests r
      where r.user_id::text=v_owner_id and r.state<>'completed') then
      raise exception 'account_deletion_in_progress' using errcode='23514';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function dars_private.guard_account_deletion_material_write() from public, anon, authenticated, service_role;
create trigger lesson_materials_account_deletion_guard
before insert or update of lesson_id, uploaded_by, storage_path on public.lesson_materials
for each row execute function dars_private.guard_account_deletion_material_write();

create or replace function dars_private.guard_account_deletion_storage_write()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, dars_private
as $$
declare v_owner_id text;
begin
  for v_owner_id in
    select distinct owner_uid from (
      select new.owner::text as owner_uid
      union select new.owner_id
      union select split_part(new.name,'/',1)
    ) owners
    where owner_uid is not null
      and owner_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by owner_uid
  loop
    perform pg_advisory_xact_lock(hashtextextended('account-deletion-owner:'||lower(v_owner_id),0));
    if exists(select 1 from dars_private.account_deletion_requests r
      where r.user_id::text=lower(v_owner_id) and r.state<>'completed') then
      raise exception 'account_deletion_in_progress' using errcode='23514';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function dars_private.guard_account_deletion_storage_write() from public, anon, authenticated, service_role;
create trigger storage_objects_account_deletion_guard
before insert or update on storage.objects
for each row execute function dars_private.guard_account_deletion_storage_write();

create or replace function dars_private.guard_account_deletion_group_reassignment()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, storage
as $$
declare v_owner_id text;
begin
  if new.teacher_id is not distinct from old.teacher_id then return new; end if;
  for v_owner_id in
    select distinct owner_uid from (
      select old.teacher_id::text as owner_uid
      union select new.teacher_id::text
      union select m.uploaded_by::text from public.lessons l
        join public.lesson_materials m on m.lesson_id=l.id where l.group_id=old.id
      union select split_part(m.storage_path,'/',1) from public.lessons l
        join public.lesson_materials m on m.lesson_id=l.id where l.group_id=old.id and m.storage_path is not null
      union select o.owner_id from public.lessons l
        join public.lesson_materials m on m.lesson_id=l.id
        join storage.objects o on o.bucket_id='lesson-materials' and o.name=m.storage_path where l.group_id=old.id
      union select o.owner::text from public.lessons l
        join public.lesson_materials m on m.lesson_id=l.id
        join storage.objects o on o.bucket_id='lesson-materials' and o.name=m.storage_path where l.group_id=old.id
    ) owners
    where owner_uid is not null
      and owner_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by owner_uid
  loop
    perform pg_advisory_xact_lock(hashtextextended('account-deletion-owner:'||lower(v_owner_id),0));
    if exists(select 1 from dars_private.account_deletion_requests r
      where r.user_id::text=lower(v_owner_id) and r.state<>'completed') then
      raise exception 'account_deletion_in_progress' using errcode='23514';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function dars_private.guard_account_deletion_group_reassignment() from public, anon, authenticated, service_role;
create trigger groups_account_deletion_reassignment_guard
before update of teacher_id on public.groups
for each row execute function dars_private.guard_account_deletion_group_reassignment();

create or replace function dars_private.guard_account_deletion_lesson_reassignment()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, storage
as $$
declare v_owner_id text;
begin
  if new.group_id is not distinct from old.group_id then return new; end if;
  for v_owner_id in
    select distinct owner_uid from (
      select g.teacher_id::text as owner_uid from public.groups g where g.id in (old.group_id,new.group_id)
      union select m.uploaded_by::text from public.lesson_materials m where m.lesson_id=old.id
      union select split_part(m.storage_path,'/',1) from public.lesson_materials m
        where m.lesson_id=old.id and m.storage_path is not null
      union select o.owner_id from public.lesson_materials m
        join storage.objects o on o.bucket_id='lesson-materials' and o.name=m.storage_path where m.lesson_id=old.id
      union select o.owner::text from public.lesson_materials m
        join storage.objects o on o.bucket_id='lesson-materials' and o.name=m.storage_path where m.lesson_id=old.id
    ) owners
    where owner_uid is not null
      and owner_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by owner_uid
  loop
    perform pg_advisory_xact_lock(hashtextextended('account-deletion-owner:'||lower(v_owner_id),0));
    if exists(select 1 from dars_private.account_deletion_requests r
      where r.user_id::text=lower(v_owner_id) and r.state<>'completed') then
      raise exception 'account_deletion_in_progress' using errcode='23514';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function dars_private.guard_account_deletion_lesson_reassignment() from public, anon, authenticated, service_role;
create trigger lessons_account_deletion_reassignment_guard
before update of group_id on public.lessons
for each row execute function dars_private.guard_account_deletion_lesson_reassignment();

create table dars_private.account_deletion_worker_config (
  singleton boolean primary key default true check (singleton),
  key_hash text check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default clock_timestamp()
);
insert into dars_private.account_deletion_worker_config(singleton, key_hash) values (true, null);
alter table dars_private.account_deletion_worker_config enable row level security;
revoke all on dars_private.account_deletion_worker_config from public, anon, authenticated, service_role;

create or replace function public.account_deletion_status(p_user_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private
as $$
declare
  v_role public.user_role;
  v_status public.user_status;
  v_request dars_private.account_deletion_requests%rowtype;
  v_pending boolean;
begin
  select p.role, p.status into v_role, v_status from public.profiles p where p.id = p_user_id;
  select r.* into v_request from dars_private.account_deletion_requests r
    where r.user_id = p_user_id order by r.created_at desc limit 1;
  if found then
    return jsonb_build_object('state', case when v_request.state = 'completed' then 'completed' else 'pending' end,
      'role', v_role, 'request_id', v_request.id, 'request_state', v_request.state);
  end if;
  select exists(select 1 from dars_private.pending_google_signups s where s.user_id = p_user_id) into v_pending;
  if v_status = 'active' then
    return jsonb_build_object('state','available','role',v_role,'request_id',null,'request_state',null);
  elsif v_pending then
    return jsonb_build_object('state','available','role',null,'request_id',null,'request_state',null);
  elsif v_status is not null then
    return jsonb_build_object('state','unavailable','role',v_role,'request_id',null,'request_state',null);
  end if;
  return jsonb_build_object('state','unavailable','role',null,'request_id',null,'request_state',null);
end
$$;

create or replace function public.account_deletion_create_intent(
  p_user_id uuid, p_nonce_hash text, p_expires_at timestamptz
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, dars_private
as $$
declare v_intent dars_private.account_deletion_intents%rowtype;
begin
  if p_user_id is null or p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null or p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'invalid_intent' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id=p_user_id and p.status='active')
     and not exists (select 1 from dars_private.pending_google_signups s where s.user_id=p_user_id) then
    raise exception 'inactive_owner' using errcode = '42501';
  end if;
  delete from dars_private.account_deletion_intents where user_id=p_user_id and expires_at <= clock_timestamp();
  insert into dars_private.account_deletion_intents(user_id,nonce_hash,expires_at)
    values(p_user_id,p_nonce_hash,p_expires_at) returning * into v_intent;
  return jsonb_build_object('intent_id',v_intent.id,'created_at',v_intent.created_at,'expires_at',v_intent.expires_at);
end
$$;

create or replace function public.account_deletion_complete_intent(
  p_user_id uuid, p_intent_id uuid, p_nonce_hash text, p_oauth_amr_at timestamptz
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, dars_private
as $$
declare v_intent dars_private.account_deletion_intents%rowtype; v_now timestamptz := clock_timestamp();
begin
  select i.* into v_intent from dars_private.account_deletion_intents i
    where i.id=p_intent_id and i.user_id=p_user_id for update;
  if not found or v_intent.consumed_at is not null or v_intent.oauth_amr_at is not null
     or v_intent.expires_at <= v_now
     or v_intent.nonce_hash is distinct from p_nonce_hash
     or p_oauth_amr_at is null or p_oauth_amr_at < v_now - interval '5 minutes'
     or p_oauth_amr_at > v_now + interval '1 second'
     or p_oauth_amr_at < v_intent.created_at - interval '1 second' then
    raise exception 'invalid_intent' using errcode = '42501';
  end if;
  update dars_private.account_deletion_intents set oauth_amr_at=p_oauth_amr_at where id=v_intent.id;
end
$$;

create or replace function public.account_deletion_prepare(
  p_user_id uuid, p_intent_id uuid, p_nonce_hash text, p_method text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, storage
as $$
declare
  v_profile public.profiles%rowtype;
  v_request dars_private.account_deletion_requests%rowtype;
  v_intent dars_private.account_deletion_intents%rowtype;
  v_manifest jsonb;
  v_now timestamptz := clock_timestamp();
  v_foreign boolean;
begin
  if p_user_id is null or p_method is null or p_method not in ('password','google') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  -- Coordinate with complete_google_signup so a pending identity cannot
  -- recreate its domain profile after deletion has been prepared.
  perform pg_advisory_xact_lock(hashtextextended('google-signup-completion:'||p_user_id::text,0));
  -- Permit idempotent cleanup retry for an already prepared identity only.
  select r.* into v_request from dars_private.account_deletion_requests r
    where r.user_id=p_user_id and r.state <> 'completed' for update;
  if found then
    return jsonb_build_object('request_id',v_request.id,'state',v_request.state);
  end if;
  select r.* into v_request from dars_private.account_deletion_requests r
    where r.user_id=p_user_id and r.state='completed' order by r.created_at desc limit 1;
  if found then return jsonb_build_object('request_id',v_request.id,'state','completed'); end if;

  select p.* into v_profile from public.profiles p where p.id=p_user_id for update;
  if found then
    if v_profile.status <> 'active' then raise exception 'inactive_owner' using errcode='42501'; end if;
  elsif not exists(select 1 from dars_private.pending_google_signups s where s.user_id=p_user_id) then
    raise exception 'inactive_owner' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-deletion-owner:'||p_user_id::text,0));

  if v_profile.role='admin' and v_profile.status='active' then
    perform pg_advisory_xact_lock(1976882461, 1101);
    if not exists(select 1 from public.profiles p where p.role='admin' and p.status='active' and p.id<>p_user_id) then
      raise exception 'last_active_admin' using errcode='23514';
    end if;
  end if;

  -- Foreign-group references must be dealt with by an administrator first.
  -- The profile row lock above serializes with FK-backed new uploader writes.
  select exists (
    select 1 from public.lesson_materials m
    join public.lessons l on l.id=m.lesson_id
    join public.groups g on g.id=l.group_id
    where m.uploaded_by=p_user_id and g.teacher_id<>p_user_id
  ) or exists (
    select 1 from storage.objects o
    join public.lesson_materials m on m.storage_path=o.name
    join public.lessons l on l.id=m.lesson_id
    join public.groups g on g.id=l.group_id
    where (o.owner_id=p_user_id::text or o.owner::text=p_user_id::text
       or split_part(o.name,'/',1)=p_user_id::text)
      and o.bucket_id='lesson-materials'
      and g.teacher_id<>p_user_id
  ) into v_foreign;
  if v_foreign then
    raise exception 'foreign_group_material' using errcode='23514';
  end if;

  if p_method='google' then
    select i.* into v_intent from dars_private.account_deletion_intents i
      where i.id=p_intent_id and i.user_id=p_user_id for update;
    if not found or v_intent.consumed_at is not null or v_intent.expires_at<=v_now
      or v_intent.nonce_hash is distinct from p_nonce_hash
      or v_intent.oauth_amr_at is null or v_intent.oauth_amr_at < v_now-interval '5 minutes'
      or v_intent.oauth_amr_at > v_now+interval '1 second'
      or v_intent.oauth_amr_at < v_intent.created_at-interval '1 second' then
      raise exception 'invalid_intent' using errcode='42501';
    end if;
  elsif p_intent_id is not null or p_nonce_hash is not null then
    raise exception 'invalid_request' using errcode='22023';
  end if;

  -- Snapshot every object owned by this UID, regardless of path, plus every
  -- file attached to groups the owner controls (including admin uploads).
  -- Any owned object referenced from a retained foreign group was rejected above.
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id',q.bucket_id,'name',q.name)
                            order by q.bucket_id,q.name),'[]'::jsonb)
    into v_manifest
  from (
    select distinct o.bucket_id,o.name
    from storage.objects o
    where o.owner_id=p_user_id::text or o.owner::text=p_user_id::text
       or split_part(o.name,'/',1)=p_user_id::text
       or exists (
         select 1 from public.lesson_materials m
         join public.lessons l on l.id=m.lesson_id
         join public.groups g on g.id=l.group_id
         where g.teacher_id=p_user_id and m.storage_path=o.name and o.bucket_id='lesson-materials'
       )
  ) q;

  insert into dars_private.account_deletion_requests(user_id,state,manifest)
    values(p_user_id,'queued',v_manifest) returning * into v_request;
  delete from dars_private.pending_google_signups where user_id=p_user_id;
  if p_method='google' then
    update dars_private.account_deletion_intents set consumed_at=v_now where id=v_intent.id;
  end if;
  delete from dars_private.email_outbox o
    where o.recipient_user_id=p_user_id
       or o.payload->>'teacher_id'=p_user_id::text
       or o.payload->>'student_id'=p_user_id::text
       or exists (
         select 1 from public.enrollments e
         where e.student_id=p_user_id
           and (o.payload->>'enrollment_id'=e.id::text
             or o.event_key like 'enrollment-request:'||e.id::text||':%')
       );
  delete from public.user_notifications n
    where n.payload->>'teacher_id'=p_user_id::text
       or exists (
         select 1 from public.enrollments e
         where e.student_id=p_user_id and n.kind='enrollment_requested'
           and n.event_key like 'enrollment:'||e.id::text||':%'
       )
       or exists (
         select 1 from public.teacher_review_events e
         where e.teacher_id=p_user_id and n.event_key='teacher-review-request:'||e.id::text
       );
  delete from public.profiles where id=p_user_id;
  return jsonb_build_object('request_id',v_request.id,'state',v_request.state);
end
$$;

create or replace function public.account_deletion_claim(p_limit integer,p_request_id uuid default null)
returns table(request_id uuid,user_id uuid,manifest jsonb,state text,lease_token uuid)
language plpgsql security definer
set search_path = pg_catalog, dars_private
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid_limit' using errcode='22023';
  end if;
  return query
  with candidates as (
    select r.id from dars_private.account_deletion_requests r
    where r.state <> 'completed' and (p_request_id is null or r.id=p_request_id)
      and (r.lease_expires_at is null or r.lease_expires_at <= clock_timestamp())
    order by r.created_at,r.id for update skip locked limit p_limit
  ), claimed as (
    update dars_private.account_deletion_requests r
      set state=case when r.state='queued' then 'storage_pending' else r.state end,
          lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes',
          updated_at=clock_timestamp(),safe_error=null
    from candidates c where r.id=c.id
    returning r.id,r.user_id,r.manifest,r.state,r.lease_token
  ) select c.id,c.user_id,c.manifest,c.state,c.lease_token from claimed c;
end
$$;

create or replace function public.account_deletion_files(p_request_id uuid,p_lease_token uuid)
returns table(bucket_id text,name text)
language plpgsql security definer
set search_path = pg_catalog, dars_private, storage
as $$
declare v_manifest jsonb;
begin
  select r.manifest into v_manifest from dars_private.account_deletion_requests r
    where r.id=p_request_id and r.lease_token=p_lease_token
      and r.lease_expires_at>clock_timestamp() and r.state<>'completed';
  if not found then raise exception 'invalid_lease' using errcode='42501'; end if;
  return query
  select distinct o.bucket_id,o.name from storage.objects o
  where exists (select 1 from jsonb_array_elements(v_manifest) e
    where e->>'bucket_id'=o.bucket_id and e->>'name'=o.name)
     or split_part(o.name,'/',1)=(select r.user_id::text from dars_private.account_deletion_requests r where r.id=p_request_id)
     or o.owner_id=(select r.user_id::text from dars_private.account_deletion_requests r where r.id=p_request_id)
     or o.owner::text=(select r.user_id::text from dars_private.account_deletion_requests r where r.id=p_request_id)
  order by o.bucket_id,o.name;
end
$$;

create or replace function public.account_deletion_progress(
  p_request_id uuid,p_lease_token uuid,p_state text,p_safe_error text default null
)
returns void
language plpgsql security definer
set search_path = pg_catalog, dars_private
as $$
begin
  if p_state not in ('storage_pending','auth_pending','completed')
    or (p_safe_error is not null and p_safe_error !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'invalid_state' using errcode='22023';
  end if;
  update dars_private.account_deletion_requests r
    set state=p_state,updated_at=clock_timestamp(),safe_error=p_safe_error,
        lease_token=case when p_state='completed' then null else r.lease_token end,
        lease_expires_at=case when p_state='completed' then null else r.lease_expires_at end,
        manifest=case when p_state='completed' then '[]'::jsonb else r.manifest end
    where r.id=p_request_id and r.lease_token=p_lease_token
      and r.lease_expires_at>clock_timestamp() and r.state<>'completed';
  if not found then raise exception 'invalid_lease' using errcode='42501'; end if;
  if p_state='completed' then
    delete from dars_private.account_deletion_intents i
      where i.user_id=(select r.user_id from dars_private.account_deletion_requests r where r.id=p_request_id);
  end if;
end
$$;

create or replace function public.account_deletion_worker_authorized(p_key_hash text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, dars_private
as $$
  select p_key_hash ~ '^[0-9a-f]{64}$' and c.key_hash is not null and c.key_hash=p_key_hash
  from dars_private.account_deletion_worker_config c where c.singleton
$$;

revoke all on function public.account_deletion_status(uuid) from public,anon,authenticated;
revoke all on function public.account_deletion_create_intent(uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.account_deletion_complete_intent(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.account_deletion_prepare(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.account_deletion_claim(integer,uuid) from public,anon,authenticated;
revoke all on function public.account_deletion_files(uuid,uuid) from public,anon,authenticated;
revoke all on function public.account_deletion_progress(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.account_deletion_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.account_deletion_status(uuid) to service_role;
grant execute on function public.account_deletion_create_intent(uuid,text,timestamptz) to service_role;
grant execute on function public.account_deletion_complete_intent(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.account_deletion_prepare(uuid,uuid,text,text) to service_role;
grant execute on function public.account_deletion_claim(integer,uuid) to service_role;
grant execute on function public.account_deletion_files(uuid,uuid) to service_role;
grant execute on function public.account_deletion_progress(uuid,uuid,text,text) to service_role;
grant execute on function public.account_deletion_worker_authorized(text) to service_role;

commit;
