begin;

create table dars_private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 1 and 180),
  kind text not null check (kind in (
    'teacher_review_requested','teacher_review_approved','teacher_review_declined',
    'enrollment_requested','teacher_renewal','teacher_fee_announcement'
  )),
  recipient_user_id uuid,
  fixed_admin_recipient boolean not null default false,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=12000),
  state text not null default 'queued' check (state in ('queued','sending','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz default statement_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  sent_at timestamptz,
  safe_error_code text check (safe_error_code is null or safe_error_code in (
    'smtp_transient','smtp_permanent','connection_timeout','connection_error',
    'invalid_recipient','recipient_unavailable','max_attempts'
  )),
  check ((fixed_admin_recipient and recipient_user_id is null) or
         (not fixed_admin_recipient and recipient_user_id is not null)),
  check ((state='sending' and lease_token is not null and lease_expires_at is not null) or
         (state<>'sending' and lease_token is null and lease_expires_at is null))
);
create index email_outbox_due_idx on dars_private.email_outbox(next_attempt_at,created_at,id)
  where state='queued';
create index email_outbox_expired_lease_idx on dars_private.email_outbox(lease_expires_at,created_at,id)
  where state='sending';
create index email_outbox_status_page_idx on dars_private.email_outbox(created_at desc,id desc);
alter table dars_private.email_outbox enable row level security;
revoke all on dars_private.email_outbox from public,anon,authenticated,service_role;

create or replace function dars_private.guard_email_outbox_update()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if new.id is distinct from old.id or new.event_key is distinct from old.event_key
     or new.kind is distinct from old.kind or new.recipient_user_id is distinct from old.recipient_user_id
     or new.fixed_admin_recipient is distinct from old.fixed_admin_recipient
     or new.payload is distinct from old.payload or new.created_at is distinct from old.created_at then
    raise exception 'email event metadata is immutable';
  end if;
  return new;
end $$;
revoke all on function dars_private.guard_email_outbox_update() from public,anon,authenticated,service_role;
create trigger email_outbox_immutable_metadata before update on dars_private.email_outbox
  for each row execute function dars_private.guard_email_outbox_update();

create or replace function dars_private.enqueue_email(
  p_event_key text,p_kind text,p_recipient_user_id uuid,p_fixed_admin boolean,p_payload jsonb
) returns void language sql security definer set search_path=pg_catalog,dars_private
as $$
  insert into dars_private.email_outbox(event_key,kind,recipient_user_id,fixed_admin_recipient,payload)
  values(p_event_key,p_kind,p_recipient_user_id,p_fixed_admin,p_payload)
  on conflict(event_key) do nothing
$$;
revoke all on function dars_private.enqueue_email(text,text,uuid,boolean,jsonb) from public,anon,authenticated,service_role;

create or replace function dars_private.email_teacher_review_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_name text;
begin
  if new.kind='operator_sync' then return new; end if;
  select p.full_name into v_name from public.profiles p where p.id=new.teacher_id;
  if new.kind='requested' then
    perform dars_private.enqueue_email(
      'teacher-review-request:'||new.id::text,'teacher_review_requested',null,true,
      jsonb_build_object('teacher_id',new.teacher_id,'teacher_name',left(coalesce(v_name,''),160))
    );
  elsif new.kind in ('approved','declined') then
    perform dars_private.enqueue_email(
      'teacher-review-decision:'||new.id::text,
      case when new.kind='approved' then 'teacher_review_approved' else 'teacher_review_declined' end,
      new.teacher_id,false,
      jsonb_build_object('teacher_id',new.teacher_id,'decision',new.kind)
    );
  end if;
  return new;
end $$;
revoke all on function dars_private.email_teacher_review_event() from public,anon,authenticated,service_role;
create trigger email_teacher_review_after_insert after insert on public.teacher_review_events
  for each row execute function dars_private.email_teacher_review_event();

create or replace function dars_private.email_enrollment_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_teacher uuid; v_group_name text; v_student_name text; v_transition text;
begin
  if new.status<>'pending'::public.enrollment_status then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select g.teacher_id,g.name,p.full_name into v_teacher,v_group_name,v_student_name
    from public.groups g join public.profiles p on p.id=new.student_id where g.id=new.group_id;
  if v_teacher is null then return new; end if;
  v_transition:=txid_current()::text;
  perform dars_private.enqueue_email(
    'enrollment-request:'||new.id::text||':'||v_transition,'enrollment_requested',v_teacher,false,
    jsonb_build_object('enrollment_id',new.id,'teacher_id',v_teacher,'group_id',new.group_id,
      'student_name',left(coalesce(v_student_name,''),160),'group_name',left(coalesce(v_group_name,''),160))
  );
  return new;
end $$;
revoke all on function dars_private.email_enrollment_transition() from public,anon,authenticated,service_role;
create trigger email_enrollment_after_insert after insert on public.enrollments
  for each row execute function dars_private.email_enrollment_transition();
create trigger email_enrollment_after_update after update of status on public.enrollments
  for each row execute function dars_private.email_enrollment_transition();

create or replace function dars_private.email_teacher_renewal_grant()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
begin
  if new.source not in ('free_renewal','admin_approved') then return new; end if;
  perform dars_private.enqueue_email(
    'teacher-renewal:'||new.id::text,'teacher_renewal',new.teacher_id,false,
    jsonb_build_object('teacher_id',new.teacher_id,'period_starts_at',new.starts_at,
      'period_expires_at',new.expires_at)
  );
  return new;
end $$;
revoke all on function dars_private.email_teacher_renewal_grant() from public,anon,authenticated,service_role;
create trigger email_teacher_renewal_after_insert after insert on dars_private.teacher_access_grants
  for each row execute function dars_private.email_teacher_renewal_grant();

create or replace function dars_private.email_teacher_fee_announcement()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_teacher record;
begin
  for v_teacher in
    select p.id,p.full_name from public.profiles p
    join public.teacher_profiles tp on tp.id=p.id
    where p.role='teacher' and p.status='active'
  loop
    perform dars_private.enqueue_email(
      'fee-announcement:'||new.id::text||':'||v_teacher.id::text,'teacher_fee_announcement',v_teacher.id,false,
      jsonb_build_object('teacher_id',v_teacher.id,'teacher_name',left(coalesce(v_teacher.full_name,''),160),
        'effective_at',new.effective_at,'announcement_en',left(new.announcement_en,1000),
        'announcement_ar',left(new.announcement_ar,1000))
    );
  end loop;
  return new;
end $$;
revoke all on function dars_private.email_teacher_fee_announcement() from public,anon,authenticated,service_role;
create trigger email_teacher_fee_announcement_after_insert after insert on dars_private.teacher_access_announcements
  for each row execute function dars_private.email_teacher_fee_announcement();

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
      select u.email into v_email from auth.users u
      where u.id=v_job.recipient_user_id and u.email is not null and length(u.email)<=320
        and u.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and exists(select 1 from public.profiles p where p.id=u.id and p.role='teacher' and p.status='active')
        and exists(select 1 from public.teacher_profiles tp where tp.id=u.id);
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
      'kind',v_job.kind,'payload',v_job.payload,'recipient_email',v_email,'created_at',v_job.created_at));
    v_claimed:=v_claimed+1;
    exit when v_claimed>=p_limit;
  end loop;
  return jsonb_build_object('jobs',v_jobs,'skipped',v_skipped);
end $$;
revoke all on function public.claim_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_email_jobs(integer) to service_role;

create or replace function public.settle_email_job(
  p_id uuid,p_lease_token uuid,p_outcome text,p_error_code text default null
) returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private
as $$
declare v_attempts integer; v_lease_expires_at timestamptz; v_delay interval;
begin
  if p_outcome is null or p_outcome not in ('sent','retry','failed','skipped') then raise exception 'invalid outcome' using errcode='22023'; end if;
  if p_error_code is not null and p_error_code not in (
    'smtp_transient','smtp_permanent','connection_timeout','connection_error',
    'invalid_recipient','recipient_unavailable','max_attempts'
  ) then raise exception 'invalid error code' using errcode='22023'; end if;
  select attempts,lease_expires_at into v_attempts,v_lease_expires_at from dars_private.email_outbox
  where id=p_id and state='sending' and lease_token=p_lease_token for update;
  if not found then return false; end if;
  if v_lease_expires_at<=clock_timestamp() then return false; end if;
  if p_outcome='sent' then
    update dars_private.email_outbox set state='sent',sent_at=clock_timestamp(),next_attempt_at=null,
      lease_token=null,lease_expires_at=null,safe_error_code=null where id=p_id;
  elsif p_outcome='skipped' then
    update dars_private.email_outbox set state='skipped',sent_at=null,next_attempt_at=null,
      lease_token=null,lease_expires_at=null,safe_error_code=coalesce(p_error_code,'recipient_unavailable') where id=p_id;
  elsif p_outcome='failed' or v_attempts>=5 then
    update dars_private.email_outbox set state='failed',sent_at=null,next_attempt_at=null,
      lease_token=null,lease_expires_at=null,safe_error_code=case when v_attempts>=5 then 'max_attempts' else coalesce(p_error_code,'smtp_permanent') end where id=p_id;
  else
    v_delay:=case v_attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
      when 3 then interval '30 minutes' else interval '2 hours' end;
    update dars_private.email_outbox set state='queued',sent_at=null,next_attempt_at=clock_timestamp()+v_delay,
      lease_token=null,lease_expires_at=null,safe_error_code=coalesce(p_error_code,'smtp_transient') where id=p_id;
  end if;
  return true;
end $$;
revoke all on function public.settle_email_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.settle_email_job(uuid,uuid,text,text) to service_role;

create or replace function public.admin_email_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_rows jsonb; v_total bigint; v_summary jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then
    raise exception 'invalid page' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active') then
    raise exception 'active admin only' using errcode='42501';
  end if;
  select count(*) into v_total from dars_private.email_outbox;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_rows from (
    select o.id,o.kind,o.state,o.attempts,o.created_at,o.sent_at,o.next_attempt_at,o.safe_error_code,
      case when o.fixed_admin_recipient then 'Fixed admin mailbox'
        else coalesce(p.full_name,'Unavailable recipient') end recipient_label
    from dars_private.email_outbox o left join public.profiles p on p.id=o.recipient_user_id
    order by o.created_at desc,o.id desc offset p_offset limit p_limit
  ) q;
  select jsonb_build_object(
    'queued',count(*) filter(where state='queued'),'sending',count(*) filter(where state='sending'),
    'sent',count(*) filter(where state='sent'),'failed',count(*) filter(where state='failed'),
    'skipped',count(*) filter(where state='skipped'),
    'oldest_queued_at',min(created_at) filter(where state='queued')
  ) into v_summary from dars_private.email_outbox;
  return jsonb_build_object('rows',v_rows,'total',v_total,'summary',v_summary);
end $$;
revoke all on function public.admin_email_page(integer,integer) from public,anon,service_role;
grant execute on function public.admin_email_page(integer,integer) to authenticated;

create or replace function public.retry_email_job(p_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,dars_private,auth
as $$
declare v_state text;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active') then
    raise exception 'active admin only' using errcode='42501';
  end if;
  select state into v_state from dars_private.email_outbox where id=p_id for update;
  if not found or v_state<>'failed' then raise exception 'failed email job required' using errcode='22023'; end if;
  update dars_private.email_outbox set state='queued',attempts=0,next_attempt_at=clock_timestamp(),
    sent_at=null,safe_error_code=null,lease_token=null,lease_expires_at=null where id=p_id;
end $$;
revoke all on function public.retry_email_job(uuid) from public,anon,service_role;
grant execute on function public.retry_email_job(uuid) to authenticated;

commit;
