-- Lesson reminders (24 h / 1 h before lessons.starts_at) and live notification badge.
--
-- Scheduling: pg_cron is not used anywhere in this project, so the enqueue step is a
-- SECURITY DEFINER function that the existing /api/email/cron route calls right before it
-- drains the outbox. There is no stored schedule to drift out of date.
--
-- Staleness is prevented in three independent layers:
--   1. public.enqueue_lesson_reminders only enqueues for lessons that are 'scheduled' now,
--      inside the reminder window, for accepted students / the owning teacher whose
--      preference selects that offset. Reminders are queued when due (not days ahead).
--   2. A trigger deletes still-queued reminders for a lesson when its starts_at or status
--      changes, which frees the event_key so the next enqueue pass reminds for the new time.
--   3. public.claim_email_jobs re-validates every lesson_reminder when the worker claims
--      it (lesson still scheduled, starts_at identical to the payload, still in the future,
--      enrollment/teacher link and preference unchanged) and skips it as 'stale_event' if not.
begin;

-- 1. Per-user preference ------------------------------------------------------------------
create table public.user_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lesson_reminders text not null default '24h' check (lesson_reminders in ('off','1h','24h','both')),
  updated_at timestamptz not null default now()
);
alter table public.user_notification_preferences enable row level security;
revoke all on public.user_notification_preferences from public,anon,authenticated,service_role;
grant select on public.user_notification_preferences to authenticated;
create policy user_notification_preferences_own_read on public.user_notification_preferences
  for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.get_lesson_reminder_preference()
returns text language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$
declare v_uid uuid:=auth.uid(); v_pref text;
begin
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  select lesson_reminders into v_pref from public.user_notification_preferences where user_id=v_uid;
  return coalesce(v_pref,'24h');
end $$;

create or replace function public.set_lesson_reminder_preference(p_value text)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public,auth
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  if p_value is null or p_value not in ('off','1h','24h','both') then raise exception 'invalid preference' using errcode='22023'; end if;
  insert into public.user_notification_preferences(user_id,lesson_reminders) values(v_uid,p_value)
  on conflict(user_id) do update set lesson_reminders=excluded.lesson_reminders,updated_at=now();
end $$;
revoke all on function public.get_lesson_reminder_preference(),public.set_lesson_reminder_preference(text) from public,anon,service_role;
grant execute on function public.get_lesson_reminder_preference(),public.set_lesson_reminder_preference(text) to authenticated;

-- 2. Outbox: new kind and stale code ----------------------------------------------------------
alter table dars_private.email_outbox drop constraint email_outbox_kind_check;
alter table dars_private.email_outbox add constraint email_outbox_kind_check check (kind in (
  'teacher_review_requested','teacher_review_approved','teacher_review_declined',
  'enrollment_requested','teacher_renewal','teacher_fee_announcement','lesson_reminder'
));
alter table dars_private.email_outbox drop constraint email_outbox_safe_error_code_check;
alter table dars_private.email_outbox add constraint email_outbox_safe_error_code_check check (
  safe_error_code is null or safe_error_code in (
    'smtp_transient','smtp_permanent','connection_timeout','connection_error',
    'invalid_recipient','recipient_unavailable','max_attempts','stale_event'
  ));

-- 3. Enqueue ------------------------------------------------------------------------------------
-- Reminder windows: '24h' is enqueued while 2 h..24 h remain, '1h' while 10 min..1 h remain.
-- A run that is late (daily cron) still reminds when enough notice is left, never after.
create or replace function public.enqueue_lesson_reminders(p_max integer default 1000)
returns integer language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_count integer;
begin
  if p_max is null or p_max<1 or p_max>5000 then raise exception 'invalid limit' using errcode='22023'; end if;
  with windows(label,lead,min_lead) as (
    values ('24h',interval '24 hours',interval '2 hours'),('1h',interval '1 hour',interval '10 minutes')
  ), due as (
    select l.id lesson_id,l.group_id,l.starts_at,l.title,g.name group_name,g.teacher_id,w.label
    from public.lessons l
    join public.groups g on g.id=l.group_id and g.status<>'archived'
    join windows w on l.starts_at>statement_timestamp()+w.min_lead and l.starts_at<=statement_timestamp()+w.lead
    where l.status='scheduled'
    order by l.starts_at,l.id
  ), recipients as (
    select d.*,e.student_id user_id,'student'::text recipient_role
    from due d join public.enrollments e on e.group_id=d.group_id and e.status='accepted'
    union all
    select d.*,d.teacher_id,'teacher'::text from due d
  ), ins as (
    insert into dars_private.email_outbox(event_key,kind,recipient_user_id,fixed_admin_recipient,payload)
    select 'lesson-reminder:'||r.lesson_id::text||':'||r.user_id::text||':'||r.label,
      'lesson_reminder',r.user_id,false,
      jsonb_build_object('lesson_id',r.lesson_id,'group_id',r.group_id,'group_name',left(r.group_name,160),
        'title',left(r.title,160),'starts_at',r.starts_at,'offset',r.label,'role',r.recipient_role)
    from recipients r
    join public.profiles p on p.id=r.user_id and p.status='active' and p.role::text=r.recipient_role
    left join public.user_notification_preferences pr on pr.user_id=r.user_id
    where coalesce(pr.lesson_reminders,'24h') in (r.label,'both')
    limit p_max
    on conflict(event_key) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;
revoke all on function public.enqueue_lesson_reminders(integer) from public,anon,authenticated;
grant execute on function public.enqueue_lesson_reminders(integer) to service_role;

-- 4. Invalidate queued reminders when a lesson moves or is cancelled --------------------------------
create or replace function dars_private.drop_stale_lesson_reminders()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
begin
  if new.starts_at is distinct from old.starts_at or new.status is distinct from old.status then
    delete from dars_private.email_outbox
    where kind='lesson_reminder' and state='queued' and payload->>'lesson_id'=new.id::text;
  end if;
  return new;
end $$;
revoke all on function dars_private.drop_stale_lesson_reminders() from public,anon,authenticated,service_role;
create trigger lesson_reminders_invalidate after update of starts_at,status on public.lessons
  for each row execute function dars_private.drop_stale_lesson_reminders();

-- 5. Claim: students may receive lesson reminders; every reminder is re-validated here -------------
create or replace function public.claim_email_jobs(p_limit integer default 1)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_job record; v_expired record; v_email text; v_jobs jsonb:='[]'::jsonb; v_claimed integer:=0; v_skipped integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>5 then raise exception 'invalid limit' using errcode='22023'; end if;
  for v_expired in
    select o.id from dars_private.email_outbox o where o.state='sending'
      and o.lease_expires_at<=clock_timestamp() and o.attempts>=5
    order by o.lease_expires_at,o.id limit 5 for update skip locked
  loop
    update dars_private.email_outbox set state='failed',safe_error_code='max_attempts',
      next_attempt_at=null,lease_token=null,lease_expires_at=null where id=v_expired.id;
  end loop;

  for v_job in
    select o.* from dars_private.email_outbox o
    where o.attempts<5 and ((o.state='queued' and o.next_attempt_at<=clock_timestamp()) or
      (o.state='sending' and o.lease_expires_at<=clock_timestamp()))
    order by o.created_at,o.id
    limit p_limit*5 for update skip locked
  loop
    if v_job.fixed_admin_recipient then
      if v_job.kind='teacher_review_requested' and not exists(
        select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
        where p.id=(v_job.payload->>'teacher_id')::uuid and p.role='teacher' and p.status='active'
      ) then
        update dars_private.email_outbox set state='skipped',safe_error_code='recipient_unavailable',
          next_attempt_at=null,lease_token=null,lease_expires_at=null where id=v_job.id;
        v_skipped:=v_skipped+1;
        continue;
      end if;
      v_email:='abdulrahman.gomaa.h05@gmail.com';
    else
      if v_job.kind='lesson_reminder' and not exists(
        select 1 from public.lessons l join public.groups g on g.id=l.group_id
        where l.id=(v_job.payload->>'lesson_id')::uuid
          and l.status='scheduled' and g.status<>'archived'
          and l.starts_at=(v_job.payload->>'starts_at')::timestamptz
          and l.starts_at>clock_timestamp()
          and ((v_job.payload->>'role'='teacher' and g.teacher_id=v_job.recipient_user_id)
            or (v_job.payload->>'role'='student' and exists(
              select 1 from public.enrollments e where e.group_id=g.id and e.student_id=v_job.recipient_user_id and e.status='accepted')))
          and coalesce((select pr.lesson_reminders from public.user_notification_preferences pr
                        where pr.user_id=v_job.recipient_user_id),'24h') in (v_job.payload->>'offset','both')
      ) then
        update dars_private.email_outbox set state='skipped',safe_error_code='stale_event',
          next_attempt_at=null,lease_token=null,lease_expires_at=null where id=v_job.id;
        v_skipped:=v_skipped+1;
        continue;
      end if;
      select u.email into v_email from auth.users u
      where u.id=v_job.recipient_user_id and u.email is not null and length(u.email)<=320
        and u.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and ((exists(select 1 from public.profiles p where p.id=u.id and p.role='teacher' and p.status='active')
              and exists(select 1 from public.teacher_profiles tp where tp.id=u.id))
          or (v_job.kind='lesson_reminder'
              and exists(select 1 from public.profiles p where p.id=u.id and p.role='student' and p.status='active')));
      if v_email is null then
        update dars_private.email_outbox set state='skipped',safe_error_code='recipient_unavailable',
          next_attempt_at=null,lease_token=null,lease_expires_at=null where id=v_job.id;
        v_skipped:=v_skipped+1;
        continue;
      end if;
    end if;
    update dars_private.email_outbox set state='sending',attempts=attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '120 seconds',
      next_attempt_at=null,safe_error_code=null
    where id=v_job.id returning * into v_job;
    v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('id',v_job.id,'lease_token',v_job.lease_token,
      'attempts',v_job.attempts,
      'kind',v_job.kind,'payload',v_job.payload,'recipient_email',v_email,'created_at',v_job.created_at));
    v_claimed:=v_claimed+1;
    exit when v_claimed>=p_limit;
  end loop;
  return jsonb_build_object('jobs',v_jobs,'skipped',v_skipped);
end $$;
revoke all on function public.claim_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_email_jobs(integer) to service_role;

-- 6. Realtime: stream own notification inserts (RLS user_notifications_own_active_read applies) -----
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
                    and schemaname='public' and tablename='user_notifications') then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end $$;

commit;
