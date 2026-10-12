create schema if not exists dars_private;
revoke all on schema dars_private from public, anon, authenticated;

create table public.teacher_review_state (
  teacher_id uuid primary key references public.teacher_profiles(id) on delete cascade,
  status text not null check (status in ('pending','approved','declined')),
  request_id uuid,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  decline_reason text,
  constraint teacher_review_pending_token check (status <> 'pending' or request_id is not null),
  constraint teacher_review_reason_bound check (decline_reason is null or length(decline_reason) between 1 and 1000),
  constraint teacher_review_reason_status check (decline_reason is null or status = 'declined')
);
alter table public.teacher_review_state enable row level security;
revoke all on public.teacher_review_state from public, anon, authenticated;
grant select on public.teacher_review_state to authenticated;
create policy teacher_review_state_authorized_read on public.teacher_review_state
  for select to authenticated
  using (
    (teacher_id = auth.uid() and public.is_active_user())
    or (public.current_role() = 'admin'::public.user_role and public.is_active_user())
  );

create table public.teacher_review_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  request_id uuid,
  kind text not null check (kind in ('requested','approved','declined','operator_sync')),
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null check (length(source) between 1 and 40),
  reason text check (reason is null or length(reason) between 1 and 1000),
  created_at timestamptz not null default now()
);
create unique index teacher_review_one_decision_per_request
  on public.teacher_review_events(teacher_id,request_id)
  where kind in ('approved','declined');
create index teacher_review_events_teacher_time on public.teacher_review_events(teacher_id,created_at desc,id desc);
alter table public.teacher_review_events enable row level security;
revoke all on public.teacher_review_events from public, anon, authenticated;
grant select on public.teacher_review_events to authenticated;
create policy teacher_review_events_authorized_read on public.teacher_review_events
  for select to authenticated
  using (
    (teacher_id = auth.uid() and public.is_active_user())
    or (public.current_role() = 'admin'::public.user_role and public.is_active_user())
  );

-- This deliberately happens before producer triggers are installed in Task 2.
-- Existing rows retain their compatibility approval and create no historic events.
insert into public.teacher_review_state(teacher_id,status,request_id,requested_at)
select t.id, case when t.approved then 'approved' else 'pending' end,
       case when t.approved then null else gen_random_uuid() end,
       t.created_at
from public.teacher_profiles t
on conflict (teacher_id) do nothing;

create table dars_private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 1 and 180),
  event_kind text not null check (event_kind in (
    'teacher_review_requested','teacher_review_decided','enrollment_requested',
    'teacher_monthly_renewed','fees_announced'
  )),
  owner_teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  locale text not null check (locale in ('ar','en')),
  payload jsonb not null check (pg_column_size(payload) <= 8192),
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);
alter table dars_private.email_outbox enable row level security;
revoke all on dars_private.email_outbox from public, anon, authenticated;

create or replace function dars_private.enqueue_email_event(
  p_event_key text,
  p_event_kind text,
  p_owner_teacher_id uuid,
  p_recipient_user_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_id uuid;
  v_email text;
  v_locale text;
begin
  if p_event_kind not in ('teacher_review_requested','teacher_review_decided','enrollment_requested',
                         'teacher_monthly_renewed','fees_announced') then
    raise exception 'unsupported email event kind';
  end if;
  if p_owner_teacher_id is null or p_payload is null or pg_column_size(p_payload)>8192 then
    raise exception 'invalid email event';
  end if;
  if (p_event_kind='teacher_review_requested') is distinct from (p_recipient_user_id is null) then
    raise exception 'invalid email recipient target';
  end if;
  if p_recipient_user_id is not null then
    select u.email, case when pr.preferred_language='en' then 'en' else 'ar' end
      into v_email,v_locale
    from auth.users u
    join public.profiles pr on pr.id=u.id
    where u.id=p_recipient_user_id and pr.role='teacher';
    if not found or v_email is null then raise exception 'canonical teacher email is unavailable'; end if;
  else
    v_locale := 'en';
  end if;

  insert into dars_private.email_outbox(event_key,event_kind,owner_teacher_id,recipient_user_id,recipient_email,locale,payload)
  values(p_event_key,p_event_kind,p_owner_teacher_id,p_recipient_user_id,v_email,v_locale,p_payload)
  on conflict(event_key) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from dars_private.email_outbox where event_key=p_event_key; end if;
  return v_id;
end $$;
revoke all on function dars_private.enqueue_email_event(text,text,uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.teacher_review_status(p_teacher_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_status public.user_status;
  v_result jsonb;
begin
  select p.role,p.status into v_role,v_status from public.profiles p where p.id=v_uid;
  if v_uid is null or v_status is distinct from 'active'::public.user_status
     or not (p_teacher_id=v_uid and v_role='teacher'::public.user_role or v_role='admin'::public.user_role) then
    raise exception 'not authorized';
  end if;
  select jsonb_build_object(
    'teacher_id',s.teacher_id,'status',s.status,'request_id',s.request_id,
    'requested_at',s.requested_at,'reviewed_at',s.reviewed_at,
    'decline_reason',s.decline_reason,
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'request_id',e.request_id,'kind',e.kind,'reason',e.reason,'created_at',e.created_at,
        'delivery_status',o.status
      ) order by e.created_at,e.id)
      from public.teacher_review_events e
      left join dars_private.email_outbox o on o.event_key =
        case when e.kind='requested' then 'teacher-review-request:'||e.id::text
             else 'teacher-review-decision:'||e.id::text end
      where e.teacher_id=s.teacher_id
    ),'[]'::jsonb)
  ) into v_result
  from public.teacher_review_state s where s.teacher_id=p_teacher_id;
  if v_result is null then raise exception 'teacher review state not found'; end if;
  return v_result;
end $$;
revoke all on function public.teacher_review_status(uuid) from public, anon;
grant execute on function public.teacher_review_status(uuid) to authenticated;

create or replace function public.admin_teacher_reviews(
  p_status text default 'pending', p_query text default '', p_offset integer default 0, p_limit integer default 30
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_total bigint;
  v_rows jsonb;
  v_query text := btrim(coalesce(p_query,''));
begin
  if v_uid is null or not public.is_active_user() or public.current_role() is distinct from 'admin'::public.user_role then
    raise exception 'active admin only';
  end if;
  if p_status not in ('pending','approved','declined','all') then raise exception 'invalid review status'; end if;
  if length(v_query)>120 then raise exception 'search is too long'; end if;
  if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 then raise exception 'invalid pagination'; end if;

  select count(*) into v_total
  from public.teacher_review_state s join public.profiles p on p.id=s.teacher_id
  where (p_status='all' or s.status=p_status) and (v_query='' or p.full_name ilike '%'||v_query||'%');
  select coalesce(jsonb_agg(row_data order by status_rank,requested_at desc,teacher_id), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'teacher_id',s.teacher_id,'full_name',p.full_name,'headline',t.headline,
      'account_status',p.status,'status',s.status,'request_id',s.request_id,
      'requested_at',s.requested_at,'reviewed_at',s.reviewed_at,
      'request_delivery',ro.status,'decision_delivery',doj.status
    ) as row_data,
    case when s.status='pending' then 0 else 1 end as status_rank,
    s.requested_at,p.id as teacher_id
    from public.teacher_review_state s
    join public.profiles p on p.id=s.teacher_id
    join public.teacher_profiles t on t.id=s.teacher_id
    left join lateral (
      select o.status from public.teacher_review_events e
      join dars_private.email_outbox o on o.event_key='teacher-review-request:'||e.id::text
      where e.teacher_id=s.teacher_id and e.request_id=s.request_id and e.kind='requested'
      order by e.created_at desc limit 1
    ) ro on true
    left join lateral (
      select o.status from public.teacher_review_events e
      join dars_private.email_outbox o on o.event_key='teacher-review-decision:'||e.id::text
      where e.teacher_id=s.teacher_id and e.request_id=s.request_id and e.kind in ('approved','declined','operator_sync')
      order by e.created_at desc limit 1
    ) doj on true
    where (p_status='all' or s.status=p_status) and (v_query='' or p.full_name ilike '%'||v_query||'%')
    order by status_rank,s.requested_at desc,s.teacher_id
    offset p_offset limit least(p_limit,100)
  ) q;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;
revoke all on function public.admin_teacher_reviews(text,text,integer,integer) from public, anon;
grant execute on function public.admin_teacher_reviews(text,text,integer,integer) to authenticated;
