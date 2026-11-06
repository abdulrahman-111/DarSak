begin;

create schema if not exists dars_private;

-- The original Meet pilot table is intentionally kept at its full shape. In
-- staging this statement is a no-op, so existing triggers/provider metadata
-- remain installed and untouched.
create table if not exists dars_private.lesson_meetings (
  lesson_id uuid primary key,
  teacher_id uuid not null,
  connection_id uuid,
  desired_revision bigint not null default 1 check (desired_revision > 0),
  event_generation integer not null default 1 check (event_generation > 0),
  mode text not null default 'automatic' check (mode in ('automatic','manual')),
  status text not null default 'unprepared' check (status in ('unprepared','pending','ready','failed','reconnect_required','cancelled','disconnected')),
  manual_url text,
  join_url text check (join_url is null or join_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  error_code text check (error_code is null or error_code in ('google_reconnect_required','google_permission_denied','google_conference_failed','google_rate_limited','google_unavailable','meeting_queue_full','meeting_unsupported','meeting_invalid_url')),
  provider_event_id text check (provider_event_id is null or (length(provider_event_id) between 5 and 1024 and provider_event_id ~ '^[a-z0-9_-]{5,255}[a-z0-9_-]*$')),
  conference_request_id text check (conference_request_id is null or length(conference_request_id) between 1 and 128),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function dars_private.meeting_url_is_safe(p_url text)
returns boolean language sql immutable strict
set search_path=pg_catalog
as $$
  select length(p_url) <= 500
    and p_url ~ '^https://[^/@:[:space:][:cntrl:]\\]+(:443)?(/[^[:space:][:cntrl:]\\]*)?$'
$$;
revoke all on function dars_private.meeting_url_is_safe(text) from public,anon,authenticated,service_role;

-- Report incompatible pilot values before adding the stricter check. Do not
-- rewrite or discard a value during rollout.
do $$
declare v_bad bigint;
begin
  select count(*) into v_bad from dars_private.lesson_meetings
  where manual_url is not null and not dars_private.meeting_url_is_safe(manual_url);
  if v_bad > 0 then
    raise exception 'meeting rollout blocked: % incompatible existing manual_url row(s)',v_bad;
  end if;
end $$;
alter table dars_private.lesson_meetings
  add constraint lesson_meetings_manual_url_safe
  check (manual_url is null or dars_private.meeting_url_is_safe(manual_url));

create table if not exists dars_private.group_meeting_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  teacher_id uuid not null,
  meeting_url text,
  updated_at timestamptz not null default now(),
  constraint group_meeting_settings_url_safe
    check (meeting_url is null or dars_private.meeting_url_is_safe(meeting_url))
);
alter table dars_private.lesson_meetings enable row level security;
alter table dars_private.group_meeting_settings enable row level security;
revoke all on dars_private.lesson_meetings,dars_private.group_meeting_settings
  from public,anon,authenticated,service_role;

create or replace function dars_private.meeting_teacher_available(p_teacher_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,dars_private
as $$
  select exists (
    select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=p_teacher_id and p.role='teacher' and p.status='active' and t.approved
  ) and dars_private.teacher_has_access(p_teacher_id)
$$;
revoke all on function dars_private.meeting_teacher_available(uuid) from public,anon,authenticated,service_role;

-- Returns a URL only when the lesson and group are currently eligible and the
-- private record belongs to the current owner. Authorization is performed by
-- each public wrapper, never by this scalar helper.
create or replace function dars_private.effective_meeting_url(p_lesson_id uuid)
returns text language sql stable security definer
set search_path=pg_catalog,public,dars_private
as $$
  select coalesce(
    case when m.mode='manual' then m.manual_url end,
    case when m.mode='automatic' and m.status='ready' then m.join_url end,
    s.meeting_url
  )
  from public.lessons l
  join public.groups g on g.id=l.group_id
  left join dars_private.lesson_meetings m on m.lesson_id=l.id and m.teacher_id=g.teacher_id
  left join dars_private.group_meeting_settings s on s.group_id=g.id and s.teacher_id=g.teacher_id
  where l.id=p_lesson_id and l.status='scheduled' and g.status<>'archived'
    and dars_private.meeting_teacher_available(g.teacher_id)
$$;
revoke all on function dars_private.effective_meeting_url(uuid) from public,anon,authenticated,service_role;

-- lesson_meetings deliberately has no lesson/profile FK so provider cleanup
-- tombstones survive deletion. Scrub user URLs when the owner profile itself
-- is deleted, without importing the pilot's OAuth/job cleanup subsystem.
create or replace function dars_private.scrub_meetings_after_profile_delete()
returns trigger language plpgsql security definer
set search_path=pg_catalog,dars_private
as $$
begin
  update dars_private.lesson_meetings set manual_url=null,join_url=null,status='disconnected',
    desired_revision=desired_revision+1,updated_at=now()
  where teacher_id=old.id and (manual_url is not null or join_url is not null or status<>'disconnected');
  return old;
end $$;
revoke all on function dars_private.scrub_meetings_after_profile_delete() from public,anon,authenticated,service_role;
create trigger profiles_meeting_url_scrub_after_delete
  after delete on public.profiles
  for each row execute function dars_private.scrub_meetings_after_profile_delete();

create or replace function public.meeting_links(p_lesson_ids uuid[])
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_actor uuid:=auth.uid(); v_role public.user_role; v_ids uuid[]; v_result jsonb;
begin
  if p_lesson_ids is null then return '[]'::jsonb; end if;
  if cardinality(p_lesson_ids)>100 then raise exception 'at most 100 lesson ids are allowed' using errcode='22023'; end if;
  select coalesce(array_agg(distinct id),array[]::uuid[]) into v_ids from unnest(p_lesson_ids) id where id is not null;
  select public.current_role() into v_role;
  if v_actor is null or v_role is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('lesson_id',l.id,'meeting_url',dars_private.effective_meeting_url(l.id)) order by l.id),'[]'::jsonb)
    into v_result
  from public.lessons l join public.groups g on g.id=l.group_id
  where l.id=any(v_ids) and l.status='scheduled' and g.status<>'archived'
    and (
      (v_role='admin'::public.user_role)
      or (v_role='teacher'::public.user_role and g.teacher_id=v_actor and public.is_group_owner(g.id))
      or (v_role='student'::public.user_role and public.is_active_user(v_actor)
        and exists(select 1 from public.enrollments e where e.group_id=g.id and e.student_id=v_actor and e.status='accepted')
        and dars_private.meeting_teacher_available(g.teacher_id))
    );
  return v_result;
end $$;

create or replace function public.group_meeting_settings(p_group_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_teacher uuid; v_url text;
begin
  select g.teacher_id into v_teacher from public.groups g where g.id=p_group_id and g.status<>'archived';
  if v_teacher is null then return null; end if;
  if not coalesce(public.is_group_owner(p_group_id) or public.current_role()='admin'::public.user_role,false) then return null; end if;
  select s.meeting_url into v_url from dars_private.group_meeting_settings s
  where s.group_id=p_group_id and s.teacher_id=v_teacher;
  return jsonb_build_object('meeting_url',v_url);
end $$;

create or replace function public.lesson_meeting_settings(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_group uuid; v_teacher uuid; v_url text;
begin
  select l.group_id,g.teacher_id into v_group,v_teacher
  from public.lessons l join public.groups g on g.id=l.group_id
  where l.id=p_lesson_id and g.status<>'archived';
  if v_group is null then return null; end if;
  if not coalesce(public.is_group_owner(v_group) or public.current_role()='admin'::public.user_role,false) then return null; end if;
  select m.manual_url into v_url from dars_private.lesson_meetings m
  where m.lesson_id=p_lesson_id and m.teacher_id=v_teacher and m.mode='manual';
  return jsonb_build_object('meeting_url',v_url);
end $$;

create or replace function public.save_group_meeting_url(p_group_id uuid,p_meeting_url text)
returns void language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_actor uuid:=auth.uid(); v_teacher uuid; v_locked_teacher uuid; v_url text:=nullif(p_meeting_url,'');
begin
  if public.current_role() is distinct from 'teacher'::public.user_role or not public.is_group_owner(p_group_id)
    or not dars_private.meeting_teacher_available(v_actor) then raise exception 'active group owner required' using errcode='42501'; end if;
  if v_url is not null and not dars_private.meeting_url_is_safe(v_url) then raise exception 'invalid meeting URL' using errcode='22023'; end if;
  select g.teacher_id into v_teacher from public.groups g where g.id=p_group_id and g.status<>'archived';
  if v_teacher is null or v_teacher<>v_actor then raise exception 'active group owner required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select g.teacher_id into v_locked_teacher from public.groups g where g.id=p_group_id and g.status<>'archived' for update;
  if v_locked_teacher is null or v_locked_teacher<>v_actor or not public.is_group_owner(p_group_id)
    or not dars_private.meeting_teacher_available(v_actor) then raise exception 'group owner changed' using errcode='42501'; end if;
  if v_url is null then
    delete from dars_private.group_meeting_settings where group_id=p_group_id;
  else
    insert into dars_private.group_meeting_settings(group_id,teacher_id,meeting_url)
    values(p_group_id,v_actor,v_url)
    on conflict(group_id) do update set teacher_id=excluded.teacher_id,meeting_url=excluded.meeting_url,updated_at=now();
  end if;
end $$;

create or replace function public.save_lesson_with_meeting(
  p_group_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,
  p_notes text default '',p_lesson_id uuid default null,p_meeting_url text default null
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_actor uuid:=auth.uid(); v_teacher uuid; v_lesson uuid; v_url text:=nullif(p_meeting_url,''); v_old dars_private.lesson_meetings%rowtype;
begin
  if public.current_role() is distinct from 'teacher'::public.user_role or not public.is_group_owner(p_group_id)
    or not dars_private.meeting_teacher_available(v_actor) then raise exception 'active group owner required' using errcode='42501'; end if;
  if v_url is not null and not dars_private.meeting_url_is_safe(v_url) then raise exception 'invalid meeting URL' using errcode='22023'; end if;
  select teacher_id into v_teacher from public.groups where id=p_group_id and status<>'archived';
  if v_teacher is null or v_teacher<>v_actor then raise exception 'active group owner required' using errcode='42501'; end if;
  v_lesson:=public.create_lesson(p_group_id,p_title,p_starts_at,p_ends_at,coalesce(p_notes,''),p_lesson_id);
  select teacher_id into v_teacher from public.groups where id=p_group_id and status<>'archived' for update;
  if v_teacher is null or v_teacher<>v_actor or not public.is_group_owner(p_group_id)
    or not dars_private.meeting_teacher_available(v_actor) then raise exception 'group owner changed' using errcode='42501'; end if;
  if v_url is not null then
    insert into dars_private.lesson_meetings as current_meeting(lesson_id,teacher_id,mode,status,manual_url,join_url,desired_revision)
    values(v_lesson,v_actor,'manual','ready',v_url,null,1)
    on conflict(lesson_id) do update set
      teacher_id=excluded.teacher_id,
      connection_id=case when current_meeting.teacher_id<>excluded.teacher_id then null else current_meeting.connection_id end,
      event_generation=case when current_meeting.teacher_id<>excluded.teacher_id then current_meeting.event_generation+1 else current_meeting.event_generation end,
      provider_event_id=case when current_meeting.teacher_id<>excluded.teacher_id then null else current_meeting.provider_event_id end,
      conference_request_id=case when current_meeting.teacher_id<>excluded.teacher_id then null else current_meeting.conference_request_id end,
      attempts=case when current_meeting.teacher_id<>excluded.teacher_id then 0 else current_meeting.attempts end,
      mode='manual',status='ready',manual_url=excluded.manual_url,
      join_url=case when current_meeting.teacher_id<>excluded.teacher_id or current_meeting.status<>'ready'
        then null else current_meeting.join_url end,
      error_code=null,desired_revision=current_meeting.desired_revision+1,updated_at=now();
  else
    select * into v_old from dars_private.lesson_meetings where lesson_id=v_lesson for update;
    if found then
      if v_old.teacher_id<>v_actor then
        update dars_private.lesson_meetings set teacher_id=v_actor,connection_id=null,desired_revision=desired_revision+1,
          event_generation=event_generation+1,mode='automatic',status='unprepared',manual_url=null,join_url=null,
          error_code=null,provider_event_id=null,conference_request_id=null,attempts=0,updated_at=now()
        where lesson_id=v_lesson;
      elsif v_old.mode='manual' or v_old.status in ('cancelled','disconnected') then
        update dars_private.lesson_meetings set desired_revision=desired_revision+1,mode='automatic',
          status=case when status in ('cancelled','disconnected') then status when join_url is not null then 'ready' else 'unprepared' end,
          manual_url=null,updated_at=now() where lesson_id=v_lesson;
      elsif v_old.manual_url is not null then
        update dars_private.lesson_meetings set desired_revision=desired_revision+1,manual_url=null,updated_at=now() where lesson_id=v_lesson;
      end if;
    end if;
  end if;
  return v_lesson;
end $$;

revoke all on function public.meeting_links(uuid[]) from public,anon,service_role;
revoke all on function public.group_meeting_settings(uuid) from public,anon,service_role;
revoke all on function public.lesson_meeting_settings(uuid) from public,anon,service_role;
revoke all on function public.save_group_meeting_url(uuid,text) from public,anon,service_role;
revoke all on function public.save_lesson_with_meeting(uuid,text,timestamptz,timestamptz,text,uuid,text) from public,anon,service_role;
grant execute on function public.meeting_links(uuid[]) to authenticated;
grant execute on function public.group_meeting_settings(uuid) to authenticated;
grant execute on function public.lesson_meeting_settings(uuid) to authenticated;
grant execute on function public.save_group_meeting_url(uuid,text) to authenticated;
grant execute on function public.save_lesson_with_meeting(uuid,text,timestamptz,timestamptz,text,uuid,text) to authenticated;

commit;
