begin;

create schema if not exists dars_private;

create table dars_private.google_connections (
  teacher_id uuid primary key,
  connection_id uuid not null unique default gen_random_uuid(),
  google_subject text check (google_subject is null or length(google_subject) between 1 and 255),
  google_email text check (google_email is null or length(google_email) between 3 and 320),
  ciphertext text check (ciphertext is null or length(ciphertext) between 32 and 16384),
  key_version integer not null check (key_version > 0),
  scopes text[] not null check (cardinality(scopes) between 1 and 16),
  state text not null default 'connected' check (state in ('connected','reconnect_required','disconnected')),
  claim_window_started_at timestamptz not null default now(),
  claims_in_window integer not null default 0 check (claims_in_window between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dars_private.google_oauth_flows (
  teacher_id uuid primary key,
  state_hash text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid not null,
  expires_at timestamptz not null,
  window_started_at timestamptz not null,
  starts_in_window integer not null check (starts_in_window between 1 and 5),
  updated_at timestamptz not null default now()
);

create table dars_private.lesson_meetings (
  lesson_id uuid primary key,
  teacher_id uuid not null,
  connection_id uuid,
  desired_revision bigint not null default 1 check (desired_revision > 0),
  event_generation integer not null default 1 check (event_generation > 0),
  mode text not null default 'automatic' check (mode in ('automatic','manual')),
  status text not null default 'unprepared' check (status in ('unprepared','pending','ready','failed','reconnect_required','cancelled','disconnected')),
  manual_url text check (manual_url is null or (length(manual_url) <= 2048 and manual_url ~* '^https://[^/@:]+(:443)?/[^[:space:]]*$')),
  join_url text check (join_url is null or join_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  error_code text check (error_code is null or error_code in ('google_reconnect_required','google_permission_denied','google_conference_failed','google_rate_limited','google_unavailable','meeting_queue_full','meeting_unsupported','meeting_invalid_url')),
  provider_event_id text check (provider_event_id is null or (length(provider_event_id) between 5 and 1024 and provider_event_id ~ '^[a-z0-9_-]{5,255}[a-z0-9_-]*$')),
  conference_request_id text check (conference_request_id is null or length(conference_request_id) between 1 and 128),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dars_private.google_meeting_jobs (
  job_id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique,
  teacher_id uuid not null,
  connection_id uuid,
  operation text not null check (operation in ('upsert','cancel')),
  desired_revision bigint not null check (desired_revision > 0),
  event_generation integer not null check (event_generation > 0),
  attempts integer not null default 0 check (attempts between 0 and 5),
  conference_polls integer not null default 0 check (conference_polls between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_event_id text,
  conference_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_expires_at is null))
);

create index google_meeting_jobs_due_idx on dars_private.google_meeting_jobs(teacher_id,next_attempt_at,created_at);
alter table dars_private.google_connections enable row level security;
alter table dars_private.google_oauth_flows enable row level security;
alter table dars_private.lesson_meetings enable row level security;
alter table dars_private.google_meeting_jobs enable row level security;
revoke all on dars_private.google_connections,dars_private.google_oauth_flows,dars_private.lesson_meetings,dars_private.google_meeting_jobs from public,anon,authenticated,service_role;

create or replace function dars_private.google_meet_teacher_allowed(p_teacher_id uuid, p_require_access boolean default true)
returns boolean language sql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
  select auth.uid() = p_teacher_id
    and public.is_active_user(p_teacher_id)
    and public.current_role() = 'teacher'::public.user_role
    and exists(select 1 from public.teacher_profiles t where t.id=p_teacher_id and t.approved)
    and (not p_require_access or dars_private.teacher_has_access(p_teacher_id))
$$;
revoke all on function dars_private.google_meet_teacher_allowed(uuid,boolean) from public,anon,authenticated,service_role;

create or replace function dars_private.google_meet_teacher_available(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,dars_private as $$
  select exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=p_teacher_id and p.role='teacher' and p.status='active' and t.approved)
    and dars_private.teacher_has_access(p_teacher_id)
$$;
revoke all on function dars_private.google_meet_teacher_available(uuid) from public,anon,authenticated,service_role;

create or replace function public.google_meet_begin_flow(p_state_hash text,p_session_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_session uuid; v_row dars_private.google_oauth_flows%rowtype; v_now timestamptz:=statement_timestamp();
begin
  v_session := nullif(auth.jwt()->>'session_id','')::uuid;
  if v_uid is null or v_session is null or p_session_id is distinct from v_session then raise exception 'session mismatch' using errcode='42501'; end if;
  if not exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=v_uid) then raise exception 'live session required' using errcode='42501'; end if;
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid flow state' using errcode='22023'; end if;
  if not dars_private.google_meet_teacher_allowed(v_uid,false) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-flow:'||v_uid::text,0));
  select * into v_row from dars_private.google_oauth_flows where teacher_id=v_uid for update;
  if found and v_row.window_started_at > v_now - interval '10 minutes' then
    if v_row.starts_in_window >= 5 then raise exception 'flow rate limited' using errcode='P0001'; end if;
    update dars_private.google_oauth_flows set state_hash=p_state_hash,session_id=v_session,expires_at=v_now+interval '10 minutes',starts_in_window=starts_in_window+1,updated_at=v_now where teacher_id=v_uid;
  else
    insert into dars_private.google_oauth_flows(teacher_id,state_hash,session_id,expires_at,window_started_at,starts_in_window)
    values(v_uid,p_state_hash,v_session,v_now+interval '10 minutes',v_now,1)
    on conflict(teacher_id) do update set state_hash=excluded.state_hash,session_id=excluded.session_id,expires_at=excluded.expires_at,window_started_at=excluded.window_started_at,starts_in_window=1,updated_at=v_now;
  end if;
end $$;

create or replace function public.google_meet_consume_flow(p_state_hash text,p_session_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_session uuid; v_deleted integer;
begin
  v_session:=nullif(auth.jwt()->>'session_id','')::uuid;
  if v_uid is null or v_session is null or p_session_id is distinct from v_session then raise exception 'session mismatch' using errcode='42501'; end if;
  if not exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=v_uid) then raise exception 'live session required' using errcode='42501'; end if;
  update dars_private.google_oauth_flows set expires_at=statement_timestamp()-interval '1 microsecond',updated_at=statement_timestamp()
  where teacher_id=v_uid and state_hash=p_state_hash and session_id=v_session and expires_at>statement_timestamp();
  get diagnostics v_deleted=row_count;
  return v_deleted=1;
end $$;

create or replace function public.google_meet_save_connection(p_google_subject text,p_google_email text,p_ciphertext text,p_key_version integer,p_scopes text[])
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_connection uuid; v_old dars_private.google_connections%rowtype;
begin
  if not dars_private.google_meet_teacher_allowed(v_uid,true) then raise exception 'approved teacher access required' using errcode='42501'; end if;
  if p_google_subject is null or length(p_google_subject) not between 1 and 255 or p_google_email is null or p_google_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or p_ciphertext is null or length(p_ciphertext) not between 32 and 16384 or p_key_version is null or p_key_version<1 or cardinality(p_scopes) not between 1 and 16
     or not ('https://www.googleapis.com/auth/calendar.events.owned'=any(p_scopes)) then raise exception 'invalid connection data' using errcode='22023'; end if;
  select * into v_old from dars_private.google_connections where teacher_id=v_uid for update;
  if found and v_old.state<>'disconnected' and v_old.google_subject<>p_google_subject then raise exception 'disconnect current account first' using errcode='P0001'; end if;
  if found and v_old.google_subject=p_google_subject then v_connection:=v_old.connection_id;
  else v_connection:=gen_random_uuid(); end if;
  insert into dars_private.google_connections(teacher_id,connection_id,google_subject,google_email,ciphertext,key_version,scopes,state)
  values(v_uid,v_connection,p_google_subject,p_google_email,p_ciphertext,p_key_version,p_scopes,'connected')
  on conflict(teacher_id) do update set connection_id=excluded.connection_id,google_subject=excluded.google_subject,google_email=excluded.google_email,ciphertext=excluded.ciphertext,key_version=excluded.key_version,scopes=excluded.scopes,state='connected',updated_at=now();
  return v_connection;
end $$;

create or replace function public.google_meet_credentials()
returns jsonb language sql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
 select case when dars_private.google_meet_teacher_allowed(auth.uid(),false) then
   (select jsonb_build_object('connection_id',connection_id,'google_subject',google_subject,'google_email',google_email,'ciphertext',ciphertext,'key_version',key_version,'scopes',scopes,'state',state)
    from dars_private.google_connections where teacher_id=auth.uid() and state<>'disconnected') end
$$;

create or replace function public.google_meet_disconnect()
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid();
begin
  if not dars_private.google_meet_teacher_allowed(v_uid,false) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-queue:'||v_uid::text,0));
  update dars_private.google_connections set state='disconnected',ciphertext=null,updated_at=now() where teacher_id=v_uid;
  delete from dars_private.google_oauth_flows where teacher_id=v_uid;
  update dars_private.lesson_meetings set desired_revision=desired_revision+1,status='disconnected',join_url=null,updated_at=now() where teacher_id=v_uid;
  update dars_private.google_meeting_jobs j set operation='cancel',desired_revision=m.desired_revision,updated_at=now()
    from dars_private.lesson_meetings m where j.teacher_id=v_uid and m.lesson_id=j.lesson_id;
end $$;

create or replace function public.google_meet_status()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_state text; v_email text; v_pending int; v_failed int; v_unprepared int;
begin
  if not dars_private.google_meet_teacher_allowed(auth.uid(),false) then raise exception 'active teacher required' using errcode='42501'; end if;
  select case when state='disconnected' then 'disconnected' else state end,case when state='disconnected' then null else google_email end into v_state,v_email from dars_private.google_connections where teacher_id=auth.uid();
  v_state:=coalesce(v_state,'disconnected');
  select count(*) filter(where status in ('pending','reconnect_required')),count(*) filter(where status='failed'),count(*) filter(where status='unprepared') into v_pending,v_failed,v_unprepared from dars_private.lesson_meetings where teacher_id=auth.uid();
  return jsonb_build_object('state',v_state,'email',v_email,'pending_count',coalesce(v_pending,0),'failed_count',coalesce(v_failed,0),'unprepared_count',coalesce(v_unprepared,0));
end $$;

create or replace function public.lesson_meeting(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_teacher uuid; v_group public.groups%rowtype; v_lesson public.lessons%rowtype; v_m dars_private.lesson_meetings%rowtype; v_role public.user_role;
begin
  select l.* into v_lesson from public.lessons l where l.id=p_lesson_id;
  if not found or v_lesson.status<>'scheduled' or v_lesson.ends_at<=now() then return null; end if;
  select g.* into v_group from public.groups g where g.id=v_lesson.group_id;
  if not found or v_group.status='archived' then return null; end if;
  v_teacher:=v_group.teacher_id;
  select role into v_role from public.profiles where id=auth.uid() and status='active';
  if auth.uid()=v_teacher and dars_private.google_meet_teacher_allowed(v_teacher,false) then
    select * into v_m from dars_private.lesson_meetings where lesson_id=p_lesson_id and teacher_id=v_teacher;
    return jsonb_build_object('mode',coalesce(v_m.mode,'automatic'),'status',coalesce(v_m.status,'unprepared'),'join_url',case when v_m.mode='manual' then v_m.manual_url when v_m.status='ready' then v_m.join_url end,'error_code',v_m.error_code);
  end if;
  if v_role='student' and exists(select 1 from public.enrollments e where e.group_id=v_lesson.group_id and e.student_id=auth.uid() and e.status='accepted')
     and dars_private.google_meet_teacher_available(v_teacher) then
    select * into v_m from dars_private.lesson_meetings where lesson_id=p_lesson_id and teacher_id=v_teacher;
    if v_m.mode='manual' then return jsonb_build_object('status','ready','join_url',v_m.manual_url); end if;
    if v_m.status='ready' then return jsonb_build_object('status','ready','join_url',v_m.join_url); end if;
    return jsonb_build_object('status',coalesce(v_m.status,'unprepared'),'join_url',null);
  end if;
  return null;
end $$;

create or replace function public.manage_lesson_meeting(p_lesson_id uuid,p_operation text,p_manual_url text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_l public.lessons%rowtype; v_group public.groups%rowtype; v_connection dars_private.google_connections%rowtype; v_m dars_private.lesson_meetings%rowtype; v_conf_request text; v_generation integer; v_cleanup boolean;
begin
  select l.* into v_l from public.lessons l where l.id=p_lesson_id;
  if not found then raise exception 'lesson not found' using errcode='P0002'; end if;
  select * into v_group from public.groups where id=v_l.group_id;
  if v_group.teacher_id<>v_uid or not dars_private.google_meet_teacher_allowed(v_uid,true) then raise exception 'approved lesson owner required' using errcode='42501'; end if;
  if p_operation not in ('prepare','retry','manual','clear_manual') then raise exception 'invalid operation' using errcode='22023'; end if;
  if p_operation='manual' and (p_manual_url is null or length(p_manual_url)>2048 or p_manual_url !~* '^https://[^/@:]+(:443)?/[^[:space:]]*$') then raise exception 'meeting_invalid_url' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-queue:'||v_uid::text,0));
  if p_operation in ('prepare','retry') and (v_l.status<>'scheduled' or v_l.starts_at<=now() or v_group.status='archived') then raise exception 'future scheduled lesson required' using errcode='22023'; end if;
  select * into v_connection from dars_private.google_connections where teacher_id=v_uid and state='connected';
  if p_operation in ('prepare','retry') and not found then raise exception 'google_reconnect_required' using errcode='P0001'; end if;
  if p_operation in ('prepare','retry') and exists(select 1 from dars_private.google_meeting_jobs where lesson_id=p_lesson_id and lease_expires_at>now()) then
    raise exception 'meeting job is currently leased' using errcode='55P03';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-lesson:'||p_lesson_id::text,0));
  select * into v_m from dars_private.lesson_meetings where lesson_id=p_lesson_id for update;
  if found and v_m.teacher_id<>v_uid then
    -- A transferred lesson must not inherit the prior owner's private link or
    -- provider identity. Old provider events remain managed by the former owner.
    delete from dars_private.google_meeting_jobs where lesson_id=p_lesson_id;
    update dars_private.lesson_meetings set teacher_id=v_uid,connection_id=null,desired_revision=desired_revision+1,
      event_generation=event_generation+1,mode='automatic',status='unprepared',manual_url=null,join_url=null,
      error_code=null,provider_event_id=null,conference_request_id=null,attempts=0,updated_at=now()
      where lesson_id=p_lesson_id;
    select * into v_m from dars_private.lesson_meetings where lesson_id=p_lesson_id for update;
  end if;
  v_generation:=coalesce(v_m.event_generation,1);
  v_cleanup:=p_operation in ('prepare','retry') and v_m.provider_event_id is not null and (v_m.mode='manual' or v_m.status='cancelled');
  if p_operation in ('prepare','retry') and (v_m.mode='manual' or v_m.status='cancelled') then v_generation:=v_generation+1; end if;
  v_conf_request:=case when p_operation='retry' or v_generation<>coalesce(v_m.event_generation,1) then gen_random_uuid()::text else coalesce(v_m.conference_request_id,gen_random_uuid()::text) end;
  insert into dars_private.lesson_meetings(lesson_id,teacher_id,connection_id,mode,status,manual_url,conference_request_id,event_generation)
  values(p_lesson_id,v_uid,v_connection.connection_id,case when p_operation='manual' then 'manual' else 'automatic' end,case when p_operation='manual' then 'ready' else 'pending' end,case when p_operation='manual' then p_manual_url end,case when p_operation in ('prepare','retry') then v_conf_request else null end,v_generation)
  on conflict(lesson_id) do update set connection_id=case when p_operation in ('prepare','retry') then v_connection.connection_id else dars_private.lesson_meetings.connection_id end,
    desired_revision=dars_private.lesson_meetings.desired_revision+1,mode=case when p_operation='manual' then 'manual' else 'automatic' end,
    status=case when p_operation='manual' then 'ready' when p_operation='clear_manual' then 'unprepared' else 'pending' end,
    manual_url=case when p_operation='manual' then p_manual_url else null end,join_url=null,error_code=null,attempts=0,event_generation=v_generation,conference_request_id=case when p_operation in ('prepare','retry') then v_conf_request else null end,updated_at=now()
  returning * into v_m;
  if p_operation in ('prepare','retry') then
    if not exists(select 1 from dars_private.google_meeting_jobs where lesson_id=p_lesson_id) and (select count(*) from dars_private.google_meeting_jobs where teacher_id=v_uid)>=100 then raise exception 'meeting_queue_full' using errcode='P0001'; end if;
    insert into dars_private.google_meeting_jobs(lesson_id,teacher_id,connection_id,operation,desired_revision,event_generation,attempts,next_attempt_at,conference_request_id,provider_event_id)
    values(p_lesson_id,v_uid,v_connection.connection_id,case when v_cleanup then 'cancel' else 'upsert' end,v_m.desired_revision,case when v_cleanup then v_m.event_generation-1 else v_m.event_generation end,0,now(),v_conf_request,case when v_cleanup then v_m.provider_event_id end)
    on conflict(lesson_id) do update set connection_id=excluded.connection_id,operation=excluded.operation,desired_revision=excluded.desired_revision,event_generation=excluded.event_generation,attempts=0,next_attempt_at=now(),conference_request_id=excluded.conference_request_id,provider_event_id=case when v_cleanup then excluded.provider_event_id else coalesce(dars_private.google_meeting_jobs.provider_event_id,excluded.provider_event_id) end,lease_token=null,lease_expires_at=null,updated_at=now();
  else
    if exists(select 1 from dars_private.google_meeting_jobs where lesson_id=p_lesson_id) then
      update dars_private.google_meeting_jobs set operation='cancel',desired_revision=v_m.desired_revision,updated_at=now() where lesson_id=p_lesson_id;
    elsif v_m.provider_event_id is not null then
      insert into dars_private.google_meeting_jobs(lesson_id,teacher_id,connection_id,operation,desired_revision,event_generation,provider_event_id)
      values(p_lesson_id,v_uid,v_m.connection_id,'cancel',v_m.desired_revision,v_m.event_generation,v_m.provider_event_id);
    end if;
  end if;
  return public.lesson_meeting(p_lesson_id);
end $$;

create or replace function public.claim_google_meeting_jobs(p_limit integer default 1)
returns setof jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_limit int:=least(greatest(coalesce(p_limit,1),1),10); v_j dars_private.google_meeting_jobs%rowtype; v_token uuid; v_conn dars_private.google_connections%rowtype; v_now timestamptz:=statement_timestamp(); v_owned boolean;
begin
  if not dars_private.google_meet_teacher_allowed(v_uid,false) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>10 then raise exception 'limit must be between 1 and 10' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-queue:'||v_uid::text,0));
  select * into v_conn from dars_private.google_connections where teacher_id=v_uid and state='connected' for update;
  if found then
    if v_conn.claim_window_started_at>v_now-interval '1 minute' and v_conn.claims_in_window>=10 then raise exception 'meeting claim rate limited' using errcode='P0001'; end if;
    update dars_private.google_connections set claim_window_started_at=case when v_conn.claim_window_started_at<=v_now-interval '1 minute' then v_now else claim_window_started_at end,
      claims_in_window=case when v_conn.claim_window_started_at<=v_now-interval '1 minute' then 1 else claims_in_window+1 end,updated_at=v_now where teacher_id=v_uid;
  end if;
  for v_j in select * from dars_private.google_meeting_jobs j where j.teacher_id=v_uid and j.next_attempt_at<=now() and (j.lease_expires_at is null or j.lease_expires_at<=now()) order by j.created_at for update skip locked limit v_limit loop
    if not exists(select 1 from dars_private.google_connections c where c.teacher_id=v_uid and c.connection_id=v_j.connection_id and c.state='connected') then continue; end if;
    select exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where l.id=v_j.lesson_id and g.teacher_id=v_uid and g.status<>'archived' and l.status='scheduled' and l.starts_at>v_now) into v_owned;
    if v_j.operation='upsert' and not v_owned then
      if v_j.provider_event_id is null then delete from dars_private.google_meeting_jobs where job_id=v_j.job_id; continue;
      else update dars_private.google_meeting_jobs set operation='cancel',updated_at=v_now where job_id=v_j.job_id; v_j.operation:='cancel'; end if;
    end if;
    if v_j.operation='upsert' and not dars_private.teacher_has_access(v_uid) then continue; end if;
    v_token:=gen_random_uuid();
    update dars_private.google_meeting_jobs set lease_token=v_token,lease_expires_at=now()+interval '60 seconds',updated_at=now() where job_id=v_j.job_id;
    return next jsonb_build_object('job_id',v_j.job_id,'lease_token',v_token,'desired_revision',v_j.desired_revision,'lesson_id',v_j.lesson_id,'connection_id',v_j.connection_id,'operation',v_j.operation,'event_generation',v_j.event_generation,'conference_attempt',v_j.attempts,'provider_event_id',v_j.provider_event_id,'conference_request_id',v_j.conference_request_id,
      'title',case when v_owned and v_j.operation='upsert' then (select l.title from public.lessons l where l.id=v_j.lesson_id) end,
      'starts_at',case when v_owned and v_j.operation='upsert' then (select l.starts_at from public.lessons l where l.id=v_j.lesson_id) end,
      'ends_at',case when v_owned and v_j.operation='upsert' then (select l.ends_at from public.lessons l where l.id=v_j.lesson_id) end);
  end loop;
end $$;

create or replace function public.settle_google_meeting_job(p_job_id uuid,p_lease_token uuid,p_revision bigint,p_outcome text,p_event_id text default null,p_conference_request_id text default null,p_join_url text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_j dars_private.google_meeting_jobs%rowtype; v_m dars_private.lesson_meetings%rowtype; v_stale boolean; v_found_meeting boolean; v_resume boolean; v_lesson_id uuid;
begin
  if not dars_private.google_meet_teacher_allowed(v_uid,false) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-queue:'||v_uid::text,0));
  select lesson_id into v_lesson_id from dars_private.google_meeting_jobs where job_id=p_job_id and teacher_id=v_uid;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-lesson:'||v_lesson_id::text,0));
  if p_outcome not in ('ready','pending','cancelled','retry','failed','reconnect_required') then raise exception 'invalid outcome' using errcode='22023'; end if;
  if p_event_id is not null and (length(p_event_id) not between 5 and 1024 or p_event_id !~ '^[a-z0-9_-]{5,255}[a-z0-9_-]*$') then raise exception 'invalid event id' using errcode='22023'; end if;
  if p_join_url is not null and p_join_url !~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$' then raise exception 'invalid meeting url' using errcode='22023'; end if;
  if p_error_code is not null and p_error_code not in ('google_reconnect_required','google_permission_denied','google_conference_failed','google_rate_limited','google_unavailable','meeting_queue_full','meeting_unsupported','meeting_invalid_url') then raise exception 'invalid error code' using errcode='22023'; end if;
  select * into v_j from dars_private.google_meeting_jobs where job_id=p_job_id and teacher_id=v_uid for update;
  if not found or v_j.lease_token is distinct from p_lease_token or v_j.lease_expires_at<=now() then return false; end if;
  select * into v_m from dars_private.lesson_meetings where lesson_id=v_j.lesson_id and teacher_id=v_uid for update;
  v_found_meeting:=found;
  if p_outcome in ('ready','pending') and not exists(select 1 from dars_private.google_connections c where c.teacher_id=v_uid and c.connection_id=v_j.connection_id and c.state='connected') then
    update dars_private.google_meeting_jobs set provider_event_id=coalesce(p_event_id,provider_event_id),lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now() where job_id=p_job_id;
    if v_found_meeting then update dars_private.lesson_meetings set status='disconnected',join_url=null,provider_event_id=coalesce(p_event_id,provider_event_id),updated_at=now() where lesson_id=v_j.lesson_id; end if;
    return false;
  end if;
  if v_j.operation='upsert' and not exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id
      where l.id=v_j.lesson_id and g.teacher_id=v_uid and g.status<>'archived' and l.status='scheduled' and l.starts_at>now()) then
    update dars_private.google_meeting_jobs set operation='cancel',desired_revision=coalesce(v_m.desired_revision,desired_revision),
      provider_event_id=coalesce(p_event_id,provider_event_id),lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now() where job_id=p_job_id;
    if v_found_meeting then update dars_private.lesson_meetings set status='cancelled',join_url=null,provider_event_id=coalesce(p_event_id,provider_event_id),updated_at=now() where lesson_id=v_j.lesson_id; end if;
    return false;
  end if;
  v_stale:=not v_found_meeting or v_m.desired_revision<>p_revision or v_j.desired_revision<>p_revision;
  v_resume:=v_found_meeting and v_j.operation='cancel' and v_m.mode='automatic' and v_m.status='pending' and v_m.event_generation>v_j.event_generation
    and exists(select 1 from public.lessons l where l.id=v_j.lesson_id and l.status='scheduled' and l.starts_at>now());
  if v_stale then
    update dars_private.google_meeting_jobs set desired_revision=coalesce(v_m.desired_revision,desired_revision),event_generation=coalesce(v_m.event_generation,event_generation),
      operation=case when p_outcome='cancelled' and v_resume then 'upsert' else operation end,
      provider_event_id=case when p_outcome='cancelled' then null else coalesce(p_event_id,provider_event_id) end,
      conference_request_id=coalesce(v_m.conference_request_id,p_conference_request_id,conference_request_id),
      lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now() where job_id=p_job_id;
    if v_found_meeting and p_outcome='cancelled' then update dars_private.lesson_meetings set provider_event_id=null,updated_at=now() where lesson_id=v_j.lesson_id;
    elsif p_event_id is not null and v_found_meeting then update dars_private.lesson_meetings set provider_event_id=p_event_id,updated_at=now() where lesson_id=v_j.lesson_id; end if;
    return false;
  end if;
  if p_outcome='cancelled' and v_resume then
    update dars_private.google_meeting_jobs set operation='upsert',desired_revision=v_m.desired_revision,event_generation=v_m.event_generation,
      provider_event_id=null,conference_request_id=v_m.conference_request_id,lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now()
      where job_id=p_job_id;
    update dars_private.lesson_meetings set provider_event_id=null,status='pending',error_code=null,updated_at=now() where lesson_id=v_j.lesson_id;
    return true;
  end if;
  update dars_private.google_meeting_jobs set provider_event_id=coalesce(p_event_id,provider_event_id),conference_request_id=coalesce(p_conference_request_id,conference_request_id),lease_token=null,lease_expires_at=null,updated_at=now(),attempts=case when p_outcome in ('retry','failed') then least(attempts+1,5) else attempts end,conference_polls=case when p_outcome='pending' then least(conference_polls+1,10) else conference_polls end,next_attempt_at=case when p_outcome in ('retry','pending') and attempts<4 then now()+make_interval(secs=>least(3600,30*power(2,least(attempts,6))::integer)) else now() end where job_id=p_job_id;
  update dars_private.lesson_meetings set
    provider_event_id=case when p_outcome='cancelled' then null else coalesce(p_event_id,provider_event_id) end,
    conference_request_id=case when p_outcome='cancelled' then null else coalesce(p_conference_request_id,conference_request_id) end,
    join_url=case when p_outcome='ready' then p_join_url else null end,
    status=case when p_outcome='cancelled' and mode='manual' then 'ready' when p_outcome='cancelled' and status='unprepared' then 'unprepared'
      when p_outcome='ready' then 'ready' when p_outcome='pending' then 'pending' when p_outcome='cancelled' then 'cancelled'
      when p_outcome='reconnect_required' then 'reconnect_required' when p_outcome='failed' then 'failed' else 'pending' end,
    error_code=case when p_outcome='cancelled' then null else p_error_code end,
    attempts=case when p_outcome in ('retry','failed') then least(attempts+1,5) else attempts end,updated_at=now() where lesson_id=v_j.lesson_id;
  if p_outcome='reconnect_required' then update dars_private.google_connections set state='reconnect_required',updated_at=now() where teacher_id=v_uid and connection_id=v_j.connection_id; end if;
  if p_outcome in ('ready','cancelled','failed','reconnect_required') or (p_outcome='retry' and v_j.attempts>=4) or (p_outcome='pending' and v_j.conference_polls>=9) then
    if p_outcome='retry' and v_j.attempts>=4 then update dars_private.lesson_meetings set status='failed',join_url=null,error_code=coalesce(p_error_code,'google_unavailable'),updated_at=now() where lesson_id=v_j.lesson_id; end if;
    if p_outcome='pending' and v_j.conference_polls>=9 then update dars_private.lesson_meetings set status='failed',join_url=null,error_code='google_conference_failed',updated_at=now() where lesson_id=v_j.lesson_id; end if;
    delete from dars_private.google_meeting_jobs where job_id=p_job_id;
  end if;
  return true;
end $$;

create or replace function dars_private.enqueue_lesson_meeting_job()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_owner uuid; v_conn dars_private.google_connections%rowtype; v_cancel boolean:=tg_op='DELETE'; v_id uuid; v_revision bigint; v_generation integer; v_conf_request text; v_reactivate boolean:=false; v_operation text;
begin
  if tg_op='DELETE' then v_id:=old.id; select teacher_id into v_owner from public.groups where id=old.group_id; if v_owner is null then select teacher_id into v_owner from dars_private.lesson_meetings where lesson_id=v_id; end if; v_generation:=coalesce((select event_generation from dars_private.lesson_meetings where lesson_id=v_id),1); v_revision:=coalesce((select desired_revision+1 from dars_private.lesson_meetings where lesson_id=v_id),1);
  else v_id:=new.id; select teacher_id into v_owner from public.groups where id=new.group_id; v_cancel:=new.status<>'scheduled' or new.starts_at<=statement_timestamp();
    v_generation:=coalesce((select event_generation from dars_private.lesson_meetings where lesson_id=v_id),1);
    v_reactivate:=not v_cancel and old.status<>'scheduled' and exists(select 1 from dars_private.lesson_meetings where lesson_id=v_id and status='cancelled');
    if v_reactivate then v_generation:=v_generation+1; end if;
    v_revision:=coalesce((select desired_revision+1 from dars_private.lesson_meetings where lesson_id=v_id),1);
  end if;
  if v_owner is null then return case when tg_op='DELETE' then old else new end; end if;
  if v_cancel and not exists(select 1 from dars_private.lesson_meetings where lesson_id=v_id) then return case when tg_op='DELETE' then old else new end; end if;
  if not v_cancel and exists(select 1 from dars_private.lesson_meetings where lesson_id=v_id and mode='manual') then return case when tg_op='DELETE' then old else new end; end if;
  select * into v_conn from dars_private.google_connections where teacher_id=v_owner and state='connected';
  if not v_cancel and v_conn.teacher_id is null then return case when tg_op='DELETE' then old else new end; end if;
  perform pg_advisory_xact_lock(hashtextextended('google-meet-queue:'||v_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended('google-meet-lesson:'||v_id::text,0));
  select conference_request_id into v_conf_request from dars_private.lesson_meetings where lesson_id=v_id;
  v_conf_request:=case when v_cancel then v_conf_request when v_reactivate then gen_random_uuid()::text else coalesce(v_conf_request,gen_random_uuid()::text) end;
  if not v_cancel and not exists(select 1 from dars_private.google_meeting_jobs where lesson_id=v_id)
     and (select count(*) from dars_private.google_meeting_jobs where teacher_id=v_owner)>=100 then
    insert into dars_private.lesson_meetings(lesson_id,teacher_id,connection_id,status,error_code) values(v_id,v_owner,v_conn.connection_id,'unprepared','meeting_queue_full')
    on conflict(lesson_id) do update set status='unprepared',join_url=null,error_code='meeting_queue_full',updated_at=now();
    return case when tg_op='DELETE' then old else new end;
  end if;
  insert into dars_private.lesson_meetings(lesson_id,teacher_id,connection_id,desired_revision,status,join_url,conference_request_id)
  values(v_id,v_owner,v_conn.connection_id,v_revision,case when v_cancel then 'cancelled' else 'pending' end,null,v_conf_request)
  on conflict(lesson_id) do update set desired_revision=excluded.desired_revision,connection_id=coalesce(dars_private.lesson_meetings.connection_id,excluded.connection_id),status=excluded.status,join_url=null,event_generation=case when v_reactivate then v_generation else dars_private.lesson_meetings.event_generation end,conference_request_id=case when v_reactivate then excluded.conference_request_id else coalesce(dars_private.lesson_meetings.conference_request_id,excluded.conference_request_id) end,updated_at=now();
  v_operation:=case when v_cancel or (v_reactivate and exists(select 1 from dars_private.lesson_meetings where lesson_id=v_id and provider_event_id is not null)) then 'cancel' else 'upsert' end;
  insert into dars_private.google_meeting_jobs(lesson_id,teacher_id,connection_id,operation,desired_revision,event_generation,provider_event_id,conference_request_id)
  select v_id,v_owner,coalesce(v_conn.connection_id,m.connection_id),v_operation,v_revision,case when v_operation='cancel' and v_reactivate then v_generation-1 else v_generation end,m.provider_event_id,m.conference_request_id from dars_private.lesson_meetings m where m.lesson_id=v_id
  on conflict(lesson_id) do update set operation=excluded.operation,desired_revision=excluded.desired_revision,event_generation=excluded.event_generation,connection_id=coalesce(excluded.connection_id,dars_private.google_meeting_jobs.connection_id),conference_request_id=coalesce(dars_private.google_meeting_jobs.conference_request_id,excluded.conference_request_id),next_attempt_at=now(),updated_at=now();
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger lessons_google_meet_enqueue after insert or update of starts_at,ends_at,status,title or delete on public.lessons for each row execute function dars_private.enqueue_lesson_meeting_job();

create or replace function dars_private.enqueue_group_meeting_cancellations()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare r record; v_revision bigint;
begin
  if new.status='archived' and old.status is distinct from new.status then
    for r in
      select l.id,m.teacher_id,m.connection_id,m.desired_revision,m.event_generation,m.provider_event_id,m.conference_request_id
      from public.lessons l join dars_private.lesson_meetings m on m.lesson_id=l.id
      where l.group_id=new.id and l.status='scheduled' and l.starts_at>statement_timestamp()
        and (m.provider_event_id is not null or exists(select 1 from dars_private.google_meeting_jobs j where j.lesson_id=l.id))
      order by m.teacher_id,l.id
    loop
      perform pg_advisory_xact_lock(hashtextextended('google-meet-queue:'||r.teacher_id::text,0));
      perform pg_advisory_xact_lock(hashtextextended('google-meet-lesson:'||r.id::text,0));
      update dars_private.lesson_meetings set desired_revision=desired_revision+1,
        status=case when mode='manual' then 'ready' else 'cancelled' end,join_url=null,error_code=null,updated_at=now()
        where lesson_id=r.id returning desired_revision into v_revision;
      if exists(select 1 from dars_private.google_meeting_jobs where lesson_id=r.id) then
        update dars_private.google_meeting_jobs set operation='cancel',desired_revision=v_revision,
          connection_id=coalesce(connection_id,r.connection_id),provider_event_id=coalesce(provider_event_id,r.provider_event_id),
          conference_request_id=coalesce(conference_request_id,r.conference_request_id),next_attempt_at=now(),updated_at=now()
          where lesson_id=r.id;
      elsif r.provider_event_id is not null then
        insert into dars_private.google_meeting_jobs(lesson_id,teacher_id,connection_id,operation,desired_revision,event_generation,provider_event_id,conference_request_id)
          values(r.id,r.teacher_id,r.connection_id,'cancel',v_revision,r.event_generation,r.provider_event_id,r.conference_request_id);
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger groups_google_meet_archive after update of status on public.groups for each row execute function dars_private.enqueue_group_meeting_cancellations();

create or replace function dars_private.scrub_google_meet_account()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  update dars_private.google_connections set state='disconnected',google_subject=null,google_email=null,ciphertext=null,updated_at=now() where teacher_id=old.id;
  delete from dars_private.google_oauth_flows where teacher_id=old.id;
  update dars_private.lesson_meetings set status='disconnected',join_url=null,manual_url=null,updated_at=now() where teacher_id=old.id;
  update dars_private.google_meeting_jobs set operation='cancel',updated_at=now() where teacher_id=old.id;
  return old;
end $$;
create trigger profiles_google_meet_scrub after delete on public.profiles for each row execute function dars_private.scrub_google_meet_account();

revoke all on function dars_private.enqueue_lesson_meeting_job() from public,anon,authenticated,service_role;
revoke all on function dars_private.enqueue_group_meeting_cancellations() from public,anon,authenticated,service_role;
revoke all on function dars_private.scrub_google_meet_account() from public,anon,authenticated,service_role;

do $$
declare s text;
begin
 foreach s in array array[
  'public.google_meet_begin_flow(text,uuid)','public.google_meet_consume_flow(text,uuid)','public.google_meet_save_connection(text,text,text,integer,text[])',
  'public.google_meet_credentials()','public.google_meet_disconnect()','public.google_meet_status()','public.lesson_meeting(uuid)',
  'public.manage_lesson_meeting(uuid,text,text)','public.claim_google_meeting_jobs(integer)',
  'public.settle_google_meeting_job(uuid,uuid,bigint,text,text,text,text,text)'
 ] loop execute format('revoke all on function %s from public,anon,service_role',s); execute format('grant execute on function %s to authenticated',s); end loop;
end $$;

commit;
