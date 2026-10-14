begin;

create table dars_private.teacher_access_grants (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null check (source in ('signup','backfill','free_renewal','admin_approved')),
  actor_id uuid,
  request_id uuid,
  fee_policy_enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  check (expires_at > starts_at),
  unique(request_id)
);
create index teacher_access_grants_history_idx on dars_private.teacher_access_grants(teacher_id,created_at desc,id desc);

create table dars_private.teacher_access_state (
  teacher_id uuid primary key references public.teacher_profiles(id) on delete cascade,
  current_grant_id uuid not null references dars_private.teacher_access_grants(id),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  check (expires_at > starts_at)
);
create index teacher_access_state_expiry_idx on dars_private.teacher_access_state(expires_at,teacher_id);

create table dars_private.teacher_access_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  unique(id,teacher_id),
  check ((status='pending' and decided_at is null) or (status<>'pending' and decided_at is not null))
);
create unique index teacher_access_one_pending_request_idx on dars_private.teacher_access_requests(teacher_id) where status='pending';
create index teacher_access_requests_history_idx on dars_private.teacher_access_requests(teacher_id,created_at desc,id desc);
alter table dars_private.teacher_access_grants add constraint teacher_access_grant_request_fk
  foreign key(request_id,teacher_id) references dars_private.teacher_access_requests(id,teacher_id);

create table dars_private.teacher_access_fee_policy (
  singleton boolean primary key default true check(singleton),
  fees_enabled boolean not null default false,
  effective_at timestamptz,
  announcement_en text,
  announcement_ar text,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (not fees_enabled or (effective_at is not null and announcement_en is not null and announcement_ar is not null))
);
insert into dars_private.teacher_access_fee_policy(singleton) values(true);

create table dars_private.teacher_access_announcements (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  effective_at timestamptz not null,
  announcement_en text not null check(length(btrim(announcement_en)) between 1 and 1000),
  announcement_ar text not null check(length(btrim(announcement_ar)) between 1 and 1000),
  created_at timestamptz not null default statement_timestamp()
);

do $$
declare v_constraint text;
begin
  select conname into v_constraint from pg_constraint where conrelid='public.user_notifications'::regclass and contype='c'
    and pg_get_constraintdef(oid) ilike '%kind%';
  if v_constraint is null then raise exception 'user_notifications kind constraint not found'; end if;
  execute format('alter table public.user_notifications drop constraint %I',v_constraint);
  alter table public.user_notifications add constraint user_notifications_kind_check check(kind in (
    'lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed','enrollment_requested',
    'teacher_review_requested','teacher_review_decision','teacher_fee_announcement'));
end $$;

alter table dars_private.teacher_access_grants enable row level security;
alter table dars_private.teacher_access_state enable row level security;
alter table dars_private.teacher_access_requests enable row level security;
alter table dars_private.teacher_access_fee_policy enable row level security;
alter table dars_private.teacher_access_announcements enable row level security;
revoke all on dars_private.teacher_access_grants,dars_private.teacher_access_state,dars_private.teacher_access_requests,
  dars_private.teacher_access_fee_policy,dars_private.teacher_access_announcements from public,anon,authenticated,service_role;

create or replace function dars_private.reject_teacher_access_mutation()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin raise exception 'teacher access history is immutable'; end $$;
revoke all on function dars_private.reject_teacher_access_mutation() from public,anon,authenticated,service_role;
create trigger teacher_access_grants_immutable before update or delete on dars_private.teacher_access_grants
  for each row execute function dars_private.reject_teacher_access_mutation();
create trigger teacher_access_announcements_immutable before update or delete on dars_private.teacher_access_announcements
  for each row execute function dars_private.reject_teacher_access_mutation();

create or replace function dars_private.teacher_has_access(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,dars_private
as $$ select exists(select 1 from dars_private.teacher_access_state s where s.teacher_id=p_teacher_id
  and s.starts_at<=statement_timestamp() and s.expires_at>statement_timestamp()) $$;
revoke all on function dars_private.teacher_has_access(uuid) from public,anon,authenticated,service_role;
grant execute on function dars_private.teacher_has_access(uuid) to authenticated;

create or replace function dars_private.issue_teacher_access_grant(
  p_teacher_id uuid,p_source text,p_actor uuid,p_request_id uuid,p_start timestamptz,p_fee_policy_enabled boolean
) returns uuid language plpgsql security definer set search_path=pg_catalog,dars_private
as $$
declare v_id uuid; v_end timestamptz;
begin
  v_end:=((p_start at time zone 'Africa/Cairo')+interval '1 month') at time zone 'Africa/Cairo';
  insert into dars_private.teacher_access_grants(teacher_id,starts_at,expires_at,source,actor_id,request_id,fee_policy_enabled)
    values(p_teacher_id,p_start,v_end,p_source,p_actor,p_request_id,p_fee_policy_enabled) returning id into v_id;
  insert into dars_private.teacher_access_state(teacher_id,current_grant_id,starts_at,expires_at)
    values(p_teacher_id,v_id,p_start,v_end)
    on conflict(teacher_id) do update set current_grant_id=excluded.current_grant_id,
      starts_at=case when dars_private.teacher_access_state.expires_at>=p_start then dars_private.teacher_access_state.starts_at else excluded.starts_at end,
      expires_at=excluded.expires_at;
  return v_id;
end $$;
revoke all on function dars_private.issue_teacher_access_grant(uuid,text,uuid,uuid,timestamptz,boolean) from public,anon,authenticated,service_role;

create or replace function dars_private.initialize_teacher_access()
returns trigger language plpgsql security definer set search_path=pg_catalog,dars_private
as $$ declare v_now timestamptz:=statement_timestamp(); begin
  perform dars_private.issue_teacher_access_grant(new.id,'signup',null,null,v_now,false);
  return new;
end $$;
revoke all on function dars_private.initialize_teacher_access() from public,anon,authenticated,service_role;
create trigger teacher_access_initialize_after_insert after insert on public.teacher_profiles
  for each row execute function dars_private.initialize_teacher_access();

do $$ declare v_now timestamptz:=statement_timestamp(); v_teacher record; begin
  for v_teacher in select t.id from public.teacher_profiles t
    left join dars_private.teacher_access_state s on s.teacher_id=t.id where s.teacher_id is null
  loop
    perform dars_private.issue_teacher_access_grant(v_teacher.id,'backfill',null,null,v_now,false);
  end loop;
end $$;

create or replace function public.teacher_access_status()
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_uid uuid:=auth.uid(); v_expires timestamptz; v_starts timestamptz; v_enabled boolean; v_effective timestamptz;
  v_en text; v_ar text; v_pending uuid; v_now timestamptz:=clock_timestamp(); v_can boolean;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='teacher' and p.status='active')
    then raise exception 'active teacher only' using errcode='42501'; end if;
  select starts_at,expires_at into v_starts,v_expires from dars_private.teacher_access_state where teacher_id=v_uid;
  select fees_enabled,effective_at,announcement_en,announcement_ar into v_enabled,v_effective,v_en,v_ar
    from dars_private.teacher_access_fee_policy where singleton;
  select id into v_pending from dars_private.teacher_access_requests where teacher_id=v_uid and status='pending';
  v_can:=v_expires is null or v_now>=(((v_expires at time zone 'Africa/Cairo')-interval '7 days') at time zone 'Africa/Cairo');
  return jsonb_build_object('has_access',coalesce(v_starts<=v_now and v_expires>v_now,false),'starts_at',v_starts,'expires_at',v_expires,
    'renewal_opens_at',case when v_expires is null then null else (((v_expires at time zone 'Africa/Cairo')-interval '7 days') at time zone 'Africa/Cairo') end,
    'can_renew',v_can,'fees_enabled',coalesce(v_enabled,false),'fee_effective_at',v_effective,'announcement_en',v_en,'announcement_ar',v_ar,'pending_request_id',v_pending);
end $$;

create or replace function public.renew_teacher_access()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_uid uuid:=auth.uid(); v_role public.user_role; v_account_status public.user_status; v_starts timestamptz; v_expires timestamptz;
  v_now timestamptz; v_enabled boolean; v_effective timestamptz; v_request uuid; v_outcome text; v_had_pending boolean;
begin
  perform 1 from dars_private.teacher_access_state where teacher_id=v_uid for update;
  if not found then
    perform 1 from public.teacher_profiles where id=v_uid for update;
    if not found then raise exception 'teacher profile missing' using errcode='42501'; end if;
    perform 1 from dars_private.teacher_access_state where teacher_id=v_uid for update;
  end if;
  select role,status into v_role,v_account_status from public.profiles where id=v_uid;
  if v_uid is null or v_role is distinct from 'teacher'::public.user_role or v_account_status is distinct from 'active'::public.user_status
    then raise exception 'active teacher only' using errcode='42501'; end if;
  select starts_at,expires_at into v_starts,v_expires from dars_private.teacher_access_state where teacher_id=v_uid;
  select fees_enabled,effective_at into v_enabled,v_effective from dars_private.teacher_access_fee_policy where singleton for share;
  v_now:=clock_timestamp();
  if v_expires is not null and v_now<(((v_expires at time zone 'Africa/Cairo')-interval '7 days') at time zone 'Africa/Cairo') then
    v_outcome:='too_early';
  elsif coalesce(v_enabled,false) and (v_effective is null or v_now>=v_effective) then
    select id into v_request from dars_private.teacher_access_requests where teacher_id=v_uid and status='pending';
    v_had_pending:=v_request is not null;
    if not v_had_pending then insert into dars_private.teacher_access_requests(teacher_id) values(v_uid) returning id into v_request; end if;
    v_outcome:=case when v_had_pending then 'pending' else 'requested' end;
  else
    v_starts:=case when v_expires>v_now then v_expires else v_now end;
    select id into v_request from dars_private.teacher_access_requests where teacher_id=v_uid and status='pending';
    if v_request is not null then
      update dars_private.teacher_access_requests set status='approved',decided_at=v_now,decided_by=v_uid where id=v_request;
    end if;
    perform dars_private.issue_teacher_access_grant(v_uid,'free_renewal',v_uid,v_request,v_starts,coalesce(v_enabled,false));
    v_outcome:='renewed';
  end if;
  return jsonb_build_object('outcome',v_outcome,'access',public.teacher_access_status(),'request_id',v_request);
end $$;

create or replace function public.admin_teacher_access_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_rows jsonb; v_total bigint; v_policy jsonb; begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='admin' and status='active') then raise exception 'active admin only' using errcode='42501'; end if;
  select count(*) into v_total from public.teacher_profiles;
  select coalesce(jsonb_agg(jsonb_build_object('teacher_id',q.id,'full_name',q.full_name,'approved',q.approved,
    'has_access',dars_private.teacher_has_access(q.id),'expires_at',q.expires_at,'pending_request_id',q.pending_request_id)
    order by q.full_name,q.id),'[]'::jsonb) into v_rows from (
      select t.id,p.full_name,t.approved,s.expires_at,(select r.id from dars_private.teacher_access_requests r where r.teacher_id=t.id and r.status='pending') pending_request_id
      from public.teacher_profiles t join public.profiles p on p.id=t.id left join dars_private.teacher_access_state s on s.teacher_id=t.id
      order by p.full_name,t.id offset p_offset limit p_limit) q;
  select jsonb_build_object('fees_enabled',fees_enabled,'effective_at',effective_at,'announcement_en',announcement_en,'announcement_ar',announcement_ar)
    into v_policy from dars_private.teacher_access_fee_policy where singleton;
  return jsonb_build_object('rows',v_rows,'total',v_total,'policy',v_policy);
end $$;

create or replace function public.admin_teacher_access_history(p_teacher_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_grants jsonb; v_requests jsonb; v_gt bigint; v_rt bigint; begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='admin' and status='active') then raise exception 'active admin only' using errcode='42501'; end if;
  if not exists(select 1 from public.teacher_profiles where id=p_teacher_id) then raise exception 'teacher not found'; end if;
  select count(*) into v_gt from dars_private.teacher_access_grants where teacher_id=p_teacher_id;
  select count(*) into v_rt from dars_private.teacher_access_requests where teacher_id=p_teacher_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_grants from (
    select id,starts_at,expires_at,source,created_at from dars_private.teacher_access_grants where teacher_id=p_teacher_id order by created_at desc,id desc offset p_offset limit p_limit) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_requests from (
    select id,status,created_at,decided_at from dars_private.teacher_access_requests where teacher_id=p_teacher_id order by created_at desc,id desc offset p_offset limit p_limit) q;
  return jsonb_build_object('grants',v_grants,'requests',v_requests,'total_grants',v_gt,'total_requests',v_rt);
end $$;

create or replace function dars_private.notify_teacher_access_announcement()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$ begin
  perform dars_private.add_user_notification(p.id,'teacher_fee_announcement','teacher_fee_announcement:'||new.id::text,
    jsonb_build_object('announcement_id',new.id,'announcement_en',new.announcement_en,'announcement_ar',new.announcement_ar,'effective_at',new.effective_at))
  from public.profiles p where p.role='teacher' and p.status='active';
  return new;
end $$;
revoke all on function dars_private.notify_teacher_access_announcement() from public,anon,authenticated,service_role;
create trigger teacher_access_announcement_notifications after insert on dars_private.teacher_access_announcements
  for each row execute function dars_private.notify_teacher_access_announcement();

create or replace function public.set_teacher_access_fee_policy(p_enabled boolean,p_effective_at timestamptz,p_announcement_en text,p_announcement_ar text,p_confirm boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_old dars_private.teacher_access_fee_policy%rowtype; v_changed boolean; v_en text; v_ar text; begin
  if p_enabled is null then raise exception 'fee switch is required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='admin' and status='active') then raise exception 'active admin only' using errcode='42501'; end if;
  select * into v_old from dars_private.teacher_access_fee_policy where singleton for update;
  v_en:=case when p_enabled then nullif(btrim(p_announcement_en),'') else null end;
  v_ar:=case when p_enabled then nullif(btrim(p_announcement_ar),'') else null end;
  v_changed:=v_old.fees_enabled is distinct from p_enabled or v_old.effective_at is distinct from case when p_enabled then p_effective_at else null end
    or v_old.announcement_en is distinct from v_en or v_old.announcement_ar is distinct from v_ar;
  if not v_changed then return; end if;
  if p_enabled and p_confirm is distinct from true then raise exception 'explicit confirmation required' using errcode='22023'; end if;
  if p_enabled and (p_effective_at is null or p_effective_at<=clock_timestamp() or length(coalesce(v_en,'')) not between 1 and 1000
      or length(coalesce(v_ar,'')) not between 1 and 1000) then raise exception 'future fee policy and bounded announcements required' using errcode='22023'; end if;
  update dars_private.teacher_access_fee_policy set fees_enabled=p_enabled,effective_at=case when p_enabled then p_effective_at else null end,
    announcement_en=v_en,announcement_ar=v_ar,
    updated_at=statement_timestamp(),updated_by=v_uid where singleton;
  if p_enabled then insert into dars_private.teacher_access_announcements(actor_id,effective_at,announcement_en,announcement_ar)
    values(v_uid,p_effective_at,v_en,v_ar); end if;
end $$;

create or replace function public.decide_teacher_access_request(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_req dars_private.teacher_access_requests%rowtype; v_teacher_status public.user_status; v_role public.user_role; v_now timestamptz; v_current_expiry timestamptz; begin
  if p_approve is null then raise exception 'decision is required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='admin' and status='active') then raise exception 'active admin only' using errcode='42501'; end if;
  select * into v_req from dars_private.teacher_access_requests where id=p_request_id;
  if not found then raise exception 'request not found'; end if;
  perform 1 from dars_private.teacher_access_state where teacher_id=v_req.teacher_id for update;
  if not found then
    perform 1 from public.teacher_profiles where id=v_req.teacher_id for update;
    if not found then raise exception 'teacher profile missing'; end if;
    perform 1 from dars_private.teacher_access_state where teacher_id=v_req.teacher_id for update;
  end if;
  perform 1 from dars_private.teacher_access_fee_policy where singleton for share;
  select * into v_req from dars_private.teacher_access_requests where id=p_request_id for update;
  if v_req.status<>'pending' then return; end if;
  select p.role,p.status into v_role,v_teacher_status from public.profiles p where p.id=v_req.teacher_id;
  if v_role is distinct from 'teacher'::public.user_role then raise exception 'request owner is not a teacher'; end if;
  if p_approve and v_teacher_status is distinct from 'active'::public.user_status then raise exception 'active teacher required for access approval'; end if;
  update dars_private.teacher_access_requests set status=case when p_approve then 'approved' else 'declined' end,
    decided_at=statement_timestamp(),decided_by=v_uid where id=p_request_id;
  if p_approve then
    v_now:=clock_timestamp();
    select expires_at into v_current_expiry from dars_private.teacher_access_state where teacher_id=v_req.teacher_id;
    perform dars_private.issue_teacher_access_grant(v_req.teacher_id,'admin_approved',v_uid,p_request_id,
      case when v_current_expiry>v_now then v_current_expiry else v_now end,true);
  end if;
end $$;

revoke all on function public.teacher_access_status(),public.renew_teacher_access(),public.admin_teacher_access_page(integer,integer),
  public.admin_teacher_access_history(uuid,integer,integer),public.set_teacher_access_fee_policy(boolean,timestamptz,text,text,boolean),
  public.decide_teacher_access_request(uuid,boolean) from public,anon,service_role;
grant execute on function public.teacher_access_status(),public.renew_teacher_access(),public.admin_teacher_access_page(integer,integer),
  public.admin_teacher_access_history(uuid,integer,integer),public.set_teacher_access_fee_policy(boolean,timestamptz,text,text,boolean),
  public.decide_teacher_access_request(uuid,boolean) to authenticated;

commit;
