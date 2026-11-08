begin;

-- Keep these indexes aligned with the bounded cohorts used by the admin
-- analytics view. The functions below never scan every historical row.
create index profiles_created_role_idx on public.profiles(created_at, role);
create index teacher_applications_submitted_at_idx on public.teacher_applications(submitted_at)
  where submitted_at is not null;
create index audit_log_actor_at_id_desc on dars_private.audit_log(actor_id, at desc, id desc);
create index audit_log_action_at_id_desc on dars_private.audit_log(action, at desc, id desc);
create index enrollments_created_status_idx on public.enrollments(created_at, status);
create index lessons_starts_status_idx on public.lessons(starts_at, status);
create index groups_published_snapshot_idx on public.groups(id) where status='published';
create index waitlist_waiting_snapshot_idx on public.waitlist_entries(id) where status='waiting';
create index lesson_attendance_recorded_status_idx on public.lesson_attendance(recorded_at, status);

create or replace function public.admin_audit_page(
  p_actor_id uuid default null,
  p_target_type text default null,
  p_target_id uuid default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_snapshot_at timestamptz default null,
  p_limit integer default 50
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_snapshot timestamptz := coalesce(p_snapshot_at, statement_timestamp());
  v_rows jsonb;
  v_total bigint;
  v_has_more boolean;
  v_next jsonb := null;
  v_claims jsonb;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if auth.role() is distinct from 'authenticated'
     or v_uid is null
     or coalesce(v_claims->>'aal', '') <> 'aal2'
     or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and p.status='active') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid limit' using errcode='22023';
  end if;
  if (p_from is not null and not isfinite(p_from))
     or (p_to is not null and not isfinite(p_to))
     or (p_before_at is not null and not isfinite(p_before_at))
     or (p_snapshot_at is not null and not isfinite(p_snapshot_at)) then
    raise exception 'invalid timestamp' using errcode='22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid date range' using errcode='22023';
  end if;
  if (p_before_at is null) <> (p_before_id is null) or coalesce(p_before_id, 1) < 1 then
    raise exception 'invalid cursor' using errcode='22023';
  end if;
  if p_target_type is not null and p_target_type not in (
    'teacher','teacher_application','teacher_access_request','fee_policy','quota_policy','user',
    'feedback','feedback_reply','report','group','account','teacher_plan','audit_log') then
    raise exception 'invalid target type' using errcode='22023';
  end if;
  if p_action is not null and p_action not in (
    'teacher_review_approved','teacher_review_declined','teacher_application_changes_requested',
    'teacher_access_approved','teacher_access_declined','fee_policy_changed','quota_policy_changed',
    'user_suspended','user_reactivated','admin_granted','admin_revoked','feedback_approved',
    'feedback_hidden','feedback_reply_approved','feedback_reply_hidden','report_resolved','report_reopened',
    'group_archived','group_deleted','account_deletion_started','account_deletion_completed',
    'teacher_plan_assigned','audit_purged') then
    raise exception 'invalid action' using errcode='22023';
  end if;

  -- The count is deliberately bounded. It is a live count under the fixed
  -- timestamp cutoff, not an MVCC snapshot shared by separate HTTP calls.
  select count(*) into v_total from (
    select 1 from dars_private.audit_log a
    where a.at <= v_snapshot
      and (p_actor_id is null or a.actor_id=p_actor_id)
      and (p_target_type is null or a.target_type=p_target_type)
      and (p_target_id is null or a.target_id=p_target_id)
      and (p_action is null or a.action=p_action)
      and (p_from is null or a.at>=p_from)
      and (p_to is null or a.at<p_to)
    limit 50001
  ) counted;

  with page as (
    select a.id,a.at,a.actor_id,a.actor_role,a.action,a.target_type,a.target_id,a.request_id,a.metadata
    from dars_private.audit_log a
    where a.at <= v_snapshot
      and (p_actor_id is null or a.actor_id=p_actor_id)
      and (p_target_type is null or a.target_type=p_target_type)
      and (p_target_id is null or a.target_id=p_target_id)
      and (p_action is null or a.action=p_action)
      and (p_from is null or a.at>=p_from)
      and (p_to is null or a.at<p_to)
      and (p_before_at is null or (a.at,a.id)<(p_before_at,p_before_id))
    order by a.at desc,a.id desc
    limit p_limit+1
  ), selected as (
    select * from page order by at desc,id desc limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id::text,'at',at,'actor_id',actor_id,'actor_role',actor_role,'action',action,
    'target_type',target_type,'target_id',target_id,'request_id',request_id,'metadata',metadata
  ) order by at desc,id desc),'[]'::jsonb),
    (select count(*)>p_limit from page),
    (select jsonb_build_object('at',s.at,'id',s.id::text) from selected s order by s.at asc,s.id asc limit 1)
  into v_rows,v_has_more,v_next;
  if not v_has_more then v_next := null; end if;
  return jsonb_build_object(
    'rows',v_rows,'next_cursor',v_next,'snapshot_at',v_snapshot,
    'total',least(v_total,50000),'total_capped',v_total>50000
  );
end;
$$;
revoke all on function public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)
  from public, anon, service_role;
grant execute on function public.admin_audit_page(uuid,text,uuid,text,timestamptz,timestamptz,timestamptz,bigint,timestamptz,integer)
  to authenticated;

create or replace function public.admin_analytics_summary(p_days integer default 7)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_start timestamptz;
  v_utc_today date;
  v_registrations bigint[];
  v_verified bigint;
  v_registered bigint;
  v_apps bigint;
  v_approved bigint;
  v_median numeric;
  v_groups bigint;
  v_pending bigint;
  v_accepted bigint;
  v_decided_enrollments bigint;
  v_waitlist bigint;
  v_lessons bigint[];
  v_attended bigint;
  v_attendance_total bigint;
  v_sandak bigint;
  v_outbox bigint[];
  v_claims jsonb;
  v_metrics jsonb;
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if auth.role() is distinct from 'authenticated'
     or v_uid is null
     or coalesce(v_claims->>'aal', '') <> 'aal2'
     or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and p.status='active') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_days is null or p_days not in (7,30) then raise exception 'invalid window' using errcode='22023'; end if;
  v_start := v_now - make_interval(days=>p_days);
  v_utc_today := (v_now at time zone 'UTC')::date;

  -- Registration counts are profiles created in [start, as_of), bucketed by
  -- each profile's current role. Verification is confirmed Auth users among
  -- that same registration cohort; only aggregate values leave this function.
  select array[
    count(*) filter(where role='student'),count(*) filter(where role='teacher'),count(*) filter(where role='admin')
  ] into v_registrations from public.profiles where created_at>=v_start and created_at<v_now;
  select count(*) filter(where u.confirmed_at is not null),count(*)
    into v_verified,v_registered
    from auth.users u join public.profiles p on p.id=u.id
    where p.created_at>=v_start and p.created_at<v_now;

  -- Applications are latest submissions per teacher because the source table
  -- stores one current row per teacher. Approval rate = currently approved
  -- rows / latest submissions in the selected submission-time cohort.
  select count(*),count(*) filter(where status='approved'),
    percentile_cont(0.5) within group(order by extract(epoch from reviewed_at-submitted_at)/3600)
    filter(where status='approved' and reviewed_at is not null and reviewed_at>=submitted_at)
    into v_apps,v_approved,v_median
    from public.teacher_applications where submitted_at>=v_start and submitted_at<v_now;
  -- These are current global snapshots; older published groups and waiting
  -- rows remain part of the totals until their current status changes.
  select count(*) into v_groups from public.groups where status='published';
  -- Enrollment counts are current status snapshots for rows created in-window.
  -- Pending applications do not enter the acceptance-rate denominator.
  select count(*) filter(where status='pending'),count(*) filter(where status='accepted'),
    count(*) filter(where status<>'pending')
    into v_pending,v_accepted,v_decided_enrollments
    from public.enrollments where created_at>=v_start and created_at<v_now;
  select count(*) into v_waitlist from public.waitlist_entries where status='waiting';
  -- Lesson cohort uses starts_at, but status remains current snapshot.
  select array[
    count(*) filter(where status='scheduled'),count(*) filter(where status='completed'),count(*) filter(where status='cancelled')
  ] into v_lessons from public.lessons where starts_at>=v_start and starts_at<v_now;
  -- Attendance rate = present or late / all recorded attendance marks in the
  -- recorded_at window. Unmarked enrolled students are not counted as absent.
  select count(*) filter(where status in ('present','late')),count(*)
    into v_attended,v_attendance_total
    from public.lesson_attendance where recorded_at>=v_start and recorded_at<v_now;
  -- Sandak accepted reservations are available only as complete UTC daily
  -- buckets. This metric covers the p_days completed calendar days
  -- [UTC today - p_days, UTC today); it intentionally excludes today's partial
  -- bucket and the day before the interval. The other metrics use the rolling
  -- [as_of - p_days, as_of) timestamp window.
  select coalesce(sum(accepted_requests),0) into v_sandak
    from dars_private.sandak_global_daily_usage
    where utc_day >= v_utc_today - p_days and utc_day < v_utc_today;
  select count(*) filter(where state='queued'),count(*) filter(where state='failed')
    into v_outbox from dars_private.email_outbox where created_at>=v_start and created_at<v_now;

  v_metrics := jsonb_build_array(
    jsonb_build_object('key','registrations_students','value',v_registrations[1],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','registrations_teachers','value',v_registrations[2],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','registrations_admins','value',v_registrations[3],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','email_verification_rate','value',case when v_registered=0 then null else round(100.0*v_verified/v_registered,2) end,'unit','percent','status',case when v_registered=0 then 'unavailable' else 'ready' end,'reason',case when v_registered=0 then 'no_data' else null end),
    jsonb_build_object('key','teacher_app_submitted','value',v_apps,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','teacher_app_approved','value',v_approved,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','teacher_app_approval_rate','value',case when v_apps=0 then null else round(100.0*v_approved/v_apps,2) end,'unit','percent','status',case when v_apps=0 then 'unavailable' else 'ready' end,'reason',case when v_apps=0 then 'no_data' else null end),
    jsonb_build_object('key','teacher_app_median_hours','value',case when v_median is null then null else round(v_median::numeric,2) end,'unit','hours','status',case when v_median is null then 'unavailable' else 'ready' end,'reason',case when v_median is null then 'no_data' else null end),
    jsonb_build_object('key','published_groups','value',v_groups,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','enrollment_pending','value',v_pending,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','enrollment_accepted','value',v_accepted,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','enrollment_acceptance_rate','value',case when v_decided_enrollments=0 then null else round(100.0*v_accepted/v_decided_enrollments,2) end,'unit','percent','status',case when v_decided_enrollments=0 then 'unavailable' else 'ready' end,'reason',case when v_decided_enrollments=0 then 'no_data' else null end),
    jsonb_build_object('key','waitlist_size','value',v_waitlist,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','lessons_scheduled','value',v_lessons[1],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','lessons_completed','value',v_lessons[2],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','lessons_cancelled','value',v_lessons[3],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','attendance_rate','value',case when v_attendance_total=0 then null else round(100.0*v_attended/v_attendance_total,2) end,'unit','percent','status',case when v_attendance_total=0 then 'unavailable' else 'ready' end,'reason',case when v_attendance_total=0 then 'no_data' else null end),
    jsonb_build_object('key','sandak_requests','value',v_sandak,'unit','count','status','ready','reason',null),
    jsonb_build_object('key','sandak_quota_hits','value',null,'unit','count','status','unavailable','reason','not_instrumented'),
    jsonb_build_object('key','sandak_errors','value',null,'unit','count','status','unavailable','reason','not_instrumented'),
    jsonb_build_object('key','email_outbox_queued','value',v_outbox[1],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','email_outbox_failed','value',v_outbox[2],'unit','count','status','ready','reason',null),
    jsonb_build_object('key','push_delivery','value',null,'unit','count','status','unavailable','reason','not_enabled')
  );
  return jsonb_build_object('window_days',p_days,'as_of',v_now,'metrics',v_metrics);
end;
$$;
revoke all on function public.admin_analytics_summary(integer) from public, anon, service_role;
grant execute on function public.admin_analytics_summary(integer) to authenticated;

commit;
