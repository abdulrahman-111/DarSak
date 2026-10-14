\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('dars_private.email_outbox') is null then raise exception 'email outbox migration is missing'; end if;
  if not (select relrowsecurity from pg_class where oid='dars_private.email_outbox'::regclass) then
    raise exception 'email outbox RLS is disabled';
  end if;
  if has_table_privilege('anon','dars_private.email_outbox','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','dars_private.email_outbox','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.email_outbox','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'raw outbox table grants are too broad';
  end if;
  if has_function_privilege('anon','public.claim_email_jobs(integer)','EXECUTE')
     or has_function_privilege('authenticated','public.claim_email_jobs(integer)','EXECUTE')
     or not has_function_privilege('service_role','public.claim_email_jobs(integer)','EXECUTE')
     or has_function_privilege('authenticated','public.settle_email_job(uuid,uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.settle_email_job(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('anon','public.admin_email_page(integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.admin_email_page(integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.retry_email_job(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.retry_email_job(uuid)','EXECUTE') then
    raise exception 'email outbox RPC grants are too broad or missing';
  end if;
  if has_function_privilege('authenticated','dars_private.enqueue_email(text,text,uuid,boolean,jsonb)','EXECUTE')
     or has_function_privilege('service_role','dars_private.enqueue_email(text,text,uuid,boolean,jsonb)','EXECUTE') then
    raise exception 'private enqueue helper is callable by clients or worker';
  end if;
  if exists(
    select 1 from public.teacher_review_events e join dars_private.email_outbox o
      on o.event_key='teacher-review-request:'||e.id::text
    where e.created_at<'2026-10-14 18:14:00+00'
    union all
    select 1 from public.teacher_review_events e join dars_private.email_outbox o
      on o.event_key='teacher-review-decision:'||e.id::text
    where e.created_at<'2026-10-14 18:14:00+00'
    union all
    select 1 from public.enrollments e join dars_private.email_outbox o
      on o.kind='enrollment_requested' and o.payload->>'enrollment_id'=e.id::text
    where e.created_at<'2026-10-14 18:14:00+00'
    union all
    select 1 from dars_private.teacher_access_grants g join dars_private.email_outbox o
      on o.event_key='teacher-renewal:'||g.id::text
    where g.source in ('free_renewal','admin_approved') and g.created_at<'2026-10-14 18:14:00+00'
    union all
    select 1 from dars_private.teacher_access_announcements a join dars_private.email_outbox o
      on o.event_key like 'fee-announcement:'||a.id::text||':%'
    where a.created_at<'2026-10-14 18:14:00+00'
  ) then raise exception 'migration backfilled historical email jobs'; end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7c000000-0000-4000-8000-000000000001','authenticated','authenticated','outbox-teacher@test.invalid','{"full_name":"Outbox Teacher","requested_role":"teacher"}'),
 ('7c000000-0000-4000-8000-000000000002','authenticated','authenticated','outbox-student@test.invalid','{"full_name":"Outbox Student","requested_role":"student"}'),
 ('7c000000-0000-4000-8000-000000000003','authenticated','authenticated','outbox-admin@test.invalid','{"full_name":"Outbox Admin","requested_role":"student"}'),
 ('7c000000-0000-4000-8000-000000000004','authenticated','authenticated','outbox-suspended@test.invalid','{"full_name":"Outbox Suspended","requested_role":"teacher"}'),
 ('7c000000-0000-4000-8000-000000000005','authenticated','authenticated','outbox-deleted@test.invalid','{"full_name":"Outbox Deleted","requested_role":"teacher"}');
set local session_replication_role = replica;
update public.profiles set role='admin' where id='7c000000-0000-4000-8000-000000000003';
update public.profiles set status='suspended' where id='7c000000-0000-4000-8000-000000000004';
set local session_replication_role = origin;

do $$
declare v_teacher uuid:='7c000000-0000-4000-8000-000000000001'; v_review uuid; v_job uuid;
  v_group uuid; v_offering uuid; v_system uuid; v_level uuid; v_node uuid; v_subject uuid;
begin
  insert into public.teacher_contacts(teacher_id,contact_email)
    values(v_teacher,'contact-only@test.invalid') on conflict(teacher_id) do update set contact_email=excluded.contact_email;
  -- Initial/signup grant never creates confirmation mail.
  if exists(select 1 from dars_private.email_outbox where recipient_user_id=v_teacher and kind='teacher_renewal') then
    raise exception 'initial teacher creation generated renewal email';
  end if;

  -- The canonical review event creates a fixed-destination job, and operator_sync is ignored.
  insert into public.teacher_review_events(teacher_id,kind,source)
    values(v_teacher,'requested','test') returning id into v_review;
  insert into public.teacher_review_events(teacher_id,kind,source)
    values(v_teacher,'operator_sync','test');
  insert into public.teacher_review_events(teacher_id,kind,source)
    values(v_teacher,'approved','test');
  insert into public.teacher_review_events(teacher_id,kind,source)
    values(v_teacher,'declined','test');
  if (select count(*) from dars_private.email_outbox where event_key='teacher-review-request:'||v_review::text)<>1
     or not (select fixed_admin_recipient and recipient_user_id is null from dars_private.email_outbox where event_key='teacher-review-request:'||v_review::text)
     or (select count(*) from dars_private.email_outbox where kind='teacher_review_approved' and recipient_user_id=v_teacher)<>1
     or (select count(*) from dars_private.email_outbox where kind='teacher_review_declined' and recipient_user_id=v_teacher)<>1
     or exists(select 1 from dars_private.email_outbox where kind='teacher_review_requested' and event_key like '%operator%') then
    raise exception 'review event producers, destination or exclusion is wrong';
  end if;

  -- Enrollment insert and real transition emit once; pending no-op and acceptance do not.
  select id into v_offering from public.offerings limit 1;
  if v_offering is null then
    insert into public.education_nodes(kind,name_ar,name_en,slug) values('system','اختبار','Test','outbox-test-system') returning id into v_system;
    insert into public.education_nodes(parent_id,kind,name_ar,name_en,slug) values(v_system,'level','اختبار','Test','outbox-test-level') returning id into v_level;
    insert into public.education_nodes(parent_id,kind,name_ar,name_en,slug) values(v_level,'grade','اختبار','Test','outbox-test-grade') returning id into v_node;
    insert into public.subjects(name_ar,name_en,slug) values('اختبار','Test','outbox-test') returning id into v_subject;
    insert into public.offerings(node_id,subject_id) values(v_node,v_subject) returning id into v_offering;
  end if;
  insert into public.groups(teacher_id,offering_id,name,capacity,status)
    values(v_teacher,v_offering,'Outbox fixture',10,'draft') returning id into v_group;
  insert into public.enrollments(group_id,student_id,status)
    values(v_group,'7c000000-0000-4000-8000-000000000002','pending') returning id into v_job;
  update public.enrollments set status='pending' where id=v_job;
  if (select count(*) from dars_private.email_outbox where kind='enrollment_requested' and payload->>'enrollment_id'=v_job::text)<>1 then
    raise exception 'pending no-op duplicated enrollment email';
  end if;

  -- Only explicit renewal grant sources and explicit immutable announcement rows create jobs.
  insert into dars_private.teacher_access_grants(teacher_id,starts_at,expires_at,source)
    values(v_teacher,now(),now()+interval '1 month','free_renewal');
  insert into dars_private.teacher_access_grants(teacher_id,starts_at,expires_at,source)
    values(v_teacher,now(),now()+interval '1 month','backfill');
  insert into dars_private.teacher_access_grants(teacher_id,starts_at,expires_at,source)
    values(v_teacher,now(),now()+interval '1 month','admin_approved');
  if (select count(*) from dars_private.email_outbox where kind='teacher_renewal' and recipient_user_id=v_teacher)<>2 then
    raise exception 'renewal producer included initial/backfill history or missed renewal';
  end if;
  insert into dars_private.teacher_access_announcements(actor_id,effective_at,announcement_en,announcement_ar)
    values('7c000000-0000-4000-8000-000000000003',now()+interval '1 day','Future policy','سياسة مستقبلية');
  if (select count(*) from dars_private.email_outbox where kind='teacher_fee_announcement')<>
     (select count(*) from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.role='teacher' and p.status='active') then
    raise exception 'announcement was not materialized once per active teacher';
  end if;
  -- Suspended recipients remain pending for a safe skipped result.
  insert into dars_private.email_outbox(event_key,kind,recipient_user_id,payload,created_at)
    values('email-test-unavailable-recipient','teacher_renewal','7c000000-0000-4000-8000-000000000004',
      jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000004'),clock_timestamp()-interval '1 day');
  -- A real Auth deletion leaves the outbox audit row because recipient IDs have no FK.
  insert into dars_private.email_outbox(event_key,kind,recipient_user_id,payload,created_at)
    values('email-test-deleted-recipient','teacher_renewal','7c000000-0000-4000-8000-000000000005',
      jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000005'),clock_timestamp()-interval '1 day');
  delete from auth.users where id='7c000000-0000-4000-8000-000000000005';
  if not exists(select 1 from dars_private.email_outbox where event_key='email-test-deleted-recipient'
      and recipient_user_id='7c000000-0000-4000-8000-000000000005') then
    raise exception 'deleting Auth user removed the outbox audit row';
  end if;
  insert into dars_private.email_outbox(id,event_key,kind,recipient_user_id,payload,state,attempts,
    lease_token,lease_expires_at,created_at)
  values('7d000000-0000-4000-8000-000000000002','email-test-expired-lease','teacher_renewal','7c000000-0000-4000-8000-000000000001',
    jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),'sending',1,
    '7d000000-0000-4000-8000-000000000003',clock_timestamp()+interval '1 day',clock_timestamp()-interval '3 days');
  insert into dars_private.email_outbox(id,event_key,kind,recipient_user_id,payload,state,attempts,
    lease_token,lease_expires_at,created_at)
  values('7d000000-0000-4000-8000-000000000004','email-test-exhausted-lease','teacher_renewal','7c000000-0000-4000-8000-000000000001',
    jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),'sending',5,
    '7d000000-0000-4000-8000-000000000008',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '4 days');
  insert into dars_private.email_outbox(event_key,kind,recipient_user_id,payload,created_at)
  select 'email-test-invalid-'||n,'teacher_renewal',gen_random_uuid(),jsonb_build_object('teacher_id',gen_random_uuid()),
    statement_timestamp()-interval '2 days'
  from generate_series(1,30) n;
end $$;

-- A single claim scans and skips at most 25 invalid jobs even if the queue is much larger.
set local role service_role;
do $$
declare v_claim jsonb;
begin
  v_claim:=public.claim_email_jobs(5);
  if jsonb_array_length(v_claim->'jobs')<>0 or (v_claim->>'skipped')::integer<>25 then
    raise exception 'claim did not cap invalid-recipient scanning at 25 rows';
  end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from dars_private.email_outbox where event_key like 'email-test-invalid-%' and state='queued')<>5 then
    raise exception 'bounded claim changed more than 25 invalid jobs';
  end if;
  if (select state from dars_private.email_outbox where event_key='email-test-unavailable-recipient')<>'queued' then
    raise exception 'bounded scan skipped an unrelated later recipient';
  end if;
  update dars_private.email_outbox set lease_expires_at=clock_timestamp()-interval '1 minute'
    where event_key='email-test-expired-lease';
end $$;

-- Expired leases receive a new fence; canonical Auth addresses resolve at dispatch.
set local role service_role;
do $$
declare v_claim jsonb; v_second jsonb; v_job uuid; v_token uuid; v_sent_job uuid; v_sent_token uuid;
begin
  v_claim:=public.claim_email_jobs(1);
  if jsonb_array_length(v_claim->'jobs')<>1 or v_claim->>'skipped'<>'0' then raise exception 'expired lease was not reclaimed'; end if;
  select (j->>'id')::uuid,(j->>'lease_token')::uuid into v_job,v_token from jsonb_array_elements(v_claim->'jobs') j;
  if v_job<>'7d000000-0000-4000-8000-000000000002' or v_token='7d000000-0000-4000-8000-000000000003' then
    raise exception 'expired lease did not receive a fresh fence';
  end if;
  begin
    perform public.settle_email_job(v_job,v_token,'retry','untrusted provider error');
    raise exception 'unsafe provider error code was accepted';
  exception when sqlstate '22023' then
    if sqlerrm='unsafe provider error code was accepted' then raise; end if;
  end;
  if public.settle_email_job(v_job,'7d000000-0000-4000-8000-000000000003','sent',null) then
    raise exception 'expired lease token settled';
  end if;
  if not public.settle_email_job(v_job,v_token,'retry','connection_error') then raise exception 'current lease did not settle'; end if;
  v_second:=public.claim_email_jobs(5);
  if jsonb_array_length(v_second->'jobs')<>5 or v_second->>'skipped'<>'9' then
    raise exception 'recipient skip/batch counts differ (jobs %, skipped %)',jsonb_array_length(v_second->'jobs'),v_second->>'skipped';
  end if;
  if exists(select 1 from jsonb_array_elements(v_second->'jobs') j where j->>'recipient_email'='contact-only@test.invalid') then
    raise exception 'claim resolved recipient from public contact email';
  end if;
  select (j->>'id')::uuid,(j->>'lease_token')::uuid into v_job,v_token from jsonb_array_elements(v_second->'jobs') j limit 1;
  if public.settle_email_job(v_job,gen_random_uuid(),'sent',null) then raise exception 'stale lease token settled'; end if;
  if not public.settle_email_job(v_job,v_token,'retry','connection_error') then raise exception 'current lease did not settle'; end if;
  select (j->>'id')::uuid,(j->>'lease_token')::uuid into v_sent_job,v_sent_token
    from jsonb_array_elements(v_second->'jobs') j offset 1 limit 1;
  if not public.settle_email_job(v_sent_job,v_sent_token,'sent',null) then raise exception 'current lease did not record SMTP acceptance'; end if;
end $$;
reset role;

do $$
begin
  if (select state from dars_private.email_outbox where event_key='email-test-exhausted-lease')<>'failed'
     or (select safe_error_code from dars_private.email_outbox where event_key='email-test-exhausted-lease')<>'max_attempts' then
    raise exception 'expired exhausted lease was not finalized failed';
  end if;
  if (select state from dars_private.email_outbox where event_key='email-test-expired-lease')<>'queued'
     or (select attempts from dars_private.email_outbox where event_key='email-test-expired-lease')<>2
     or (select safe_error_code from dars_private.email_outbox where event_key='email-test-expired-lease')<>'connection_error'
     or (select next_attempt_at from dars_private.email_outbox where event_key='email-test-expired-lease') not between clock_timestamp()+interval '4 minutes 59 seconds' and clock_timestamp()+interval '5 minutes 1 second' then
    raise exception 'retry did not preserve attempt count, safe code and five-minute backoff';
  end if;
  if not exists(select 1 from dars_private.email_outbox where state='sent' and sent_at is not null) then
    raise exception 'sent status did not record SMTP acceptance time';
  end if;
  if (select attempts from dars_private.email_outbox where event_key='email-test-deleted-recipient')<>0
     or (select attempts from dars_private.email_outbox where event_key='email-test-unavailable-recipient')<>0 then
    raise exception 'unavailable recipient consumed an attempt';
  end if;
  begin
    update dars_private.email_outbox set payload=jsonb_build_object('changed',true)
      where event_key='teacher-review-request:'||(
        select id::text from public.teacher_review_events where teacher_id='7c000000-0000-4000-8000-000000000001' and kind='requested' order by created_at desc,id desc limit 1
      );
    raise exception 'immutable event metadata update succeeded';
  exception when raise_exception then
    if sqlerrm<>'email event metadata is immutable' then raise; end if;
  end;
end $$;

-- A same-token settle after expiry is rejected even if the row has not yet been reclaimed.
insert into dars_private.email_outbox(id,event_key,kind,recipient_user_id,payload,created_at)
values('7d000000-0000-4000-8000-000000000009','email-test-expired-settle','teacher_renewal',
  '7c000000-0000-4000-8000-000000000001',jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),
  clock_timestamp()-interval '1 hour');
do $$
declare v_claim jsonb; v_job uuid; v_token uuid;
begin
  v_claim:=public.claim_email_jobs(1);
  select (j->>'id')::uuid,(j->>'lease_token')::uuid into v_job,v_token from jsonb_array_elements(v_claim->'jobs') j;
  if v_job<>'7d000000-0000-4000-8000-000000000009' then raise exception 'expired-settle fixture was not claimed'; end if;
  update dars_private.email_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=v_job;
  if public.settle_email_job(v_job,v_token,'sent',null) then raise exception 'expired same-token settle succeeded'; end if;
  update dars_private.email_outbox set state='skipped',next_attempt_at=null,lease_token=null,
    lease_expires_at=null,safe_error_code='recipient_unavailable' where id=v_job;
end $$;

insert into dars_private.email_outbox(id,event_key,kind,fixed_admin_recipient,payload,created_at)
values('7d000000-0000-4000-8000-000000000011','email-test-fixed-admin','teacher_review_requested',true,
  jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),clock_timestamp()-interval '5 hours');
set local role service_role;
do $$
declare v_claim jsonb;
begin
  v_claim:=public.claim_email_jobs(1);
  if jsonb_array_length(v_claim->'jobs')<>1
     or v_claim->'jobs'->0->>'id'<>'7d000000-0000-4000-8000-000000000011'
     or v_claim->'jobs'->0->>'recipient_email'<>'abdulrahman.gomaa.h05@gmail.com' then
    raise exception 'fixed-admin recipient was not resolved to the contracted address';
  end if;
end $$;
reset role;

insert into dars_private.email_outbox(id,event_key,kind,recipient_user_id,payload,created_at)
values('7d000000-0000-4000-8000-000000000012','email-test-canonical-auth','teacher_renewal',
  '7c000000-0000-4000-8000-000000000001',jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),
  '2000-01-01 00:00:00+00');
set local role service_role;
do $$
declare v_claim jsonb;
begin
  v_claim:=public.claim_email_jobs(1);
  if jsonb_array_length(v_claim->'jobs')<>1
     or v_claim->'jobs'->0->>'id'<>'7d000000-0000-4000-8000-000000000012'
     or v_claim->'jobs'->0->>'recipient_email'<>'outbox-teacher@test.invalid' then
    raise exception 'teacher recipient was not resolved from canonical Auth email';
  end if;
end $$;
reset role;

insert into dars_private.email_outbox(id,event_key,kind,recipient_user_id,payload,state,attempts,sent_at,safe_error_code,lease_token,lease_expires_at)
values
 ('7d000000-0000-4000-8000-000000000005','email-test-retry-sent','teacher_renewal','7c000000-0000-4000-8000-000000000001',jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),'sent',1,now(),null,null,null),
 ('7d000000-0000-4000-8000-000000000006','email-test-retry-skipped','teacher_renewal','7c000000-0000-4000-8000-000000000001',jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),'skipped',0,null,'recipient_unavailable',null,null),
 ('7d000000-0000-4000-8000-000000000007','email-test-retry-sending','teacher_renewal','7c000000-0000-4000-8000-000000000001',jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),'sending',1,null,null,'7d000000-0000-4000-8000-000000000010',clock_timestamp()+interval '1 minute');

insert into dars_private.email_outbox(id,event_key,kind,recipient_user_id,payload,state,attempts,next_attempt_at,safe_error_code)
values('7d000000-0000-4000-8000-000000000001','email-test-admin-retry','teacher_review_declined','7c000000-0000-4000-8000-000000000001',
  jsonb_build_object('teacher_id','7c000000-0000-4000-8000-000000000001'),
  'failed',5,null,'max_attempts');
set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000003';
do $$
declare v_page jsonb;
begin
  v_page:=public.admin_email_page(0,20);
  if jsonb_array_length(v_page->'rows')<1 or (v_page->'summary'->>'queued')::bigint<1 then
    raise exception 'active admin page omitted safe metadata or summary';
  end if;
  if (v_page->'rows'->0 ? 'recipient_email') or (v_page->'rows'->0 ? 'payload') then
    raise exception 'admin page exposed raw recipient or payload';
  end if;
  perform public.retry_email_job('7d000000-0000-4000-8000-000000000001');
  begin
    perform public.retry_email_job('7d000000-0000-4000-8000-000000000005');
    raise exception 'retry accepted a sent row';
  exception when sqlstate '22023' then if sqlerrm='retry accepted a sent row' then raise; end if; end;
  begin
    perform public.retry_email_job('7d000000-0000-4000-8000-000000000006');
    raise exception 'retry accepted a skipped row';
  exception when sqlstate '22023' then if sqlerrm='retry accepted a skipped row' then raise; end if; end;
  begin
    perform public.retry_email_job('7d000000-0000-4000-8000-000000000007');
    raise exception 'retry accepted a live sending row';
  exception when sqlstate '22023' then if sqlerrm='retry accepted a live sending row' then raise; end if; end;
end $$;
reset role;
do $$
begin
  if (select state from dars_private.email_outbox where event_key='email-test-admin-retry')<>'queued'
     or (select attempts from dars_private.email_outbox where event_key='email-test-admin-retry')<>0 then
    raise exception 'admin retry did not reset only failed job';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='7c000000-0000-4000-8000-000000000004';
do $$
begin
  begin perform public.admin_email_page(0,20);
    raise exception 'suspended user read the admin email page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
