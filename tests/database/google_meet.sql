\set ON_ERROR_STOP on
begin;

do $$
declare s text;
begin
  if to_regclass('dars_private.google_connections') is null
     or to_regclass('dars_private.google_oauth_flows') is null
     or to_regclass('dars_private.lesson_meetings') is null
     or to_regclass('dars_private.google_meeting_jobs') is null then
    raise exception 'Google Meet private tables are missing';
  end if;
  foreach s in array array[
    'public.google_meet_begin_flow(text,uuid)','public.google_meet_consume_flow(text,uuid)',
    'public.google_meet_save_connection(text,text,text,integer,text[])','public.google_meet_credentials()',
    'public.google_meet_disconnect()','public.google_meet_status()','public.lesson_meeting(uuid)',
    'public.manage_lesson_meeting(uuid,text,text)','public.claim_google_meeting_jobs(integer)',
    'public.settle_google_meeting_job(uuid,uuid,bigint,text,text,text,text,text)'
  ] loop
    if to_regprocedure(s) is null or not has_function_privilege('authenticated',s,'EXECUTE')
       or has_function_privilege('anon',s,'EXECUTE') or has_function_privilege('service_role',s,'EXECUTE') then
      raise exception 'Google Meet RPC grants are incorrect: %',s;
    end if;
  end loop;
  if has_table_privilege('anon','dars_private.google_connections','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','dars_private.google_connections','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.google_connections','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Google credential storage is directly accessible';
  end if;
  if exists(select 1 from (values
     ('dars_private.google_connections'::regclass),('dars_private.google_oauth_flows'::regclass),
     ('dars_private.lesson_meetings'::regclass),('dars_private.google_meeting_jobs'::regclass)
   ) r(oid) join pg_class c on c.oid=r.oid where not c.relrowsecurity) then
    raise exception 'Google Meet private tables must enforce RLS';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.lessons'::regclass and tgname='lessons_google_meet_enqueue' and not tgisinternal)
     or not exists(select 1 from pg_trigger where tgrelid='public.groups'::regclass and tgname='groups_google_meet_archive' and not tgisinternal) then
    raise exception 'Google Meet lifecycle triggers are missing';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) values
 ('8f000000-0000-4000-8000-000000000001','authenticated','authenticated','meet-owner@test.invalid','{"full_name":"Meet owner","requested_role":"teacher"}','{"provider":"email"}'),
 ('8f000000-0000-4000-8000-000000000002','authenticated','authenticated','meet-other@test.invalid','{"full_name":"Meet other","requested_role":"teacher"}','{"provider":"email"}'),
 ('8f000000-0000-4000-8000-000000000003','authenticated','authenticated','meet-accepted@test.invalid','{"full_name":"Meet accepted","requested_role":"student"}','{"provider":"email"}'),
 ('8f000000-0000-4000-8000-000000000004','authenticated','authenticated','meet-pending@test.invalid','{"full_name":"Meet pending","requested_role":"student"}','{"provider":"email"}'),
 ('8f000000-0000-4000-8000-000000000005','authenticated','authenticated','meet-admin@test.invalid','{"full_name":"Meet admin","requested_role":"admin"}','{"provider":"email"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='8f000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;
do $$ begin
  if (select role from public.profiles where id='8f000000-0000-4000-8000-000000000005')<>'admin' then raise exception 'admin fixture did not create an actual admin profile'; end if;
end $$;
update public.teacher_applications set legacy_approved=true where teacher_id in ('8f000000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000002');
set local role service_role;
update public.teacher_profiles set approved=true where id in ('8f000000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000002');
reset role;

insert into auth.sessions(id,user_id) values
 ('8f000000-0000-4000-8000-000000000011','8f000000-0000-4000-8000-000000000001'),
 ('8f000000-0000-4000-8000-000000000022','8f000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
begin
  begin
    perform public.claim_google_meeting_jobs(11);
    raise exception 'claim limit above ten was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
select public.google_meet_begin_flow(repeat('a',64),'8f000000-0000-4000-8000-000000000011');
do $$
begin
  if not public.google_meet_consume_flow(repeat('a',64),'8f000000-0000-4000-8000-000000000011') then raise exception 'valid flow was not consumed'; end if;
  if public.google_meet_consume_flow(repeat('a',64),'8f000000-0000-4000-8000-000000000011') then raise exception 'flow replay was accepted'; end if;
  begin
    perform set_config('request.jwt.claims','{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000099"}',true);
    perform set_config('request.jwt.claim.session_id','8f000000-0000-4000-8000-000000000099',true);
    perform public.google_meet_begin_flow(repeat('9',64),'8f000000-0000-4000-8000-000000000099');
    raise exception 'flow accepted a session absent from auth.sessions';
  exception when insufficient_privilege then null;
  end;
  perform public.google_meet_begin_flow(repeat('b',64),'8f000000-0000-4000-8000-000000000011');
  perform public.google_meet_begin_flow(repeat('c',64),'8f000000-0000-4000-8000-000000000011');
  perform public.google_meet_begin_flow(repeat('d',64),'8f000000-0000-4000-8000-000000000011');
  perform public.google_meet_begin_flow(repeat('e',64),'8f000000-0000-4000-8000-000000000011');
  begin
    perform public.google_meet_begin_flow(repeat('f',64),'8f000000-0000-4000-8000-000000000011');
    raise exception 'sixth flow start was accepted';
  exception when raise_exception then
    if sqlerrm='sixth flow start was accepted' then raise; end if;
  end;
  begin
    perform public.google_meet_consume_flow(repeat('a',64),'8f000000-0000-4000-8000-000000000012');
    raise exception 'cross-session flow consumption was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.google_meet_save_connection('google-subject-1','owner@gmail.com',repeat('c',64),1,array['openid','email','https://www.googleapis.com/auth/calendar.events.owned']);
do $$
declare v jsonb;
begin
  v:=public.google_meet_credentials();
  if v->>'ciphertext'<>repeat('c',64) or v ? 'refresh_token' then raise exception 'credentials did not expose ciphertext-only owner data'; end if;
end $$;

set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000002';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000022';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000022"}';
do $$
begin
  if public.google_meet_credentials() is not null then raise exception 'another teacher read the first teacher connection'; end if;
  if public.google_meet_status()->>'state'<>'disconnected' then raise exception 'other teacher status leaked connection state'; end if;
end $$;
reset role;
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '8f100000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000001',o.id,'Google Meet access fixture',5,'draft'
from (select id from public.offerings limit 1) o;
set local session_replication_role=origin;
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '8f100000-0000-4000-8000-000000000002','8f000000-0000-4000-8000-000000000001',o.id,'Google Meet archive fixture',5,'draft'
from (select id from public.offerings limit 1) o;
set local session_replication_role=origin;
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('8f200000-0000-4000-8000-000000000006','8f100000-0000-4000-8000-000000000002','Past managed lesson',now()-interval '2 hours',now()-interval '1 hour','scheduled'),
 ('8f200000-0000-4000-8000-000000000007','8f100000-0000-4000-8000-000000000002','Future managed lesson',now()+interval '2 days',now()+interval '3 days','scheduled');
insert into dars_private.lesson_meetings(lesson_id,teacher_id,connection_id,status,join_url,provider_event_id)
select '8f200000-0000-4000-8000-000000000006','8f000000-0000-4000-8000-000000000001',connection_id,'ready','https://meet.google.com/abc-defg-hij','past_event_12345'
from dars_private.google_connections where teacher_id='8f000000-0000-4000-8000-000000000001';
update dars_private.lesson_meetings set status='ready',join_url='https://meet.google.com/abc-defg-hij',provider_event_id='future_event_12345'
where lesson_id='8f200000-0000-4000-8000-000000000007';
update public.groups set status='archived' where id='8f100000-0000-4000-8000-000000000002';
do $$
begin
  if (select status from public.lessons where id='8f200000-0000-4000-8000-000000000006')<>'scheduled'
     or (select status from public.lessons where id='8f200000-0000-4000-8000-000000000007')<>'scheduled' then
    raise exception 'group archive rewrote public lesson history'; end if;
  if not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000006' and status='ready' and join_url='https://meet.google.com/abc-defg-hij')
     or not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000007' and status='cancelled' and join_url is null)
     or not exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000007' and operation='cancel' and provider_event_id='future_event_12345')
     or exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000006') then
    raise exception 'archive did not cancel only future managed Meet work'; end if;
end $$;
delete from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000007';
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values('8f200000-0000-4000-8000-000000000001','8f100000-0000-4000-8000-000000000001','Google Meet join fixture',now()-interval '1 minute',now()+interval '1 hour','scheduled');
insert into public.enrollments(group_id,student_id,status) values
 ('8f100000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000003','accepted'),
 ('8f100000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000004','pending');
insert into dars_private.lesson_meetings(lesson_id,teacher_id,connection_id,status,join_url)
select '8f200000-0000-4000-8000-000000000001','8f000000-0000-4000-8000-000000000001',connection_id,'ready','https://meet.google.com/abc-defg-hij'
from dars_private.google_connections where teacher_id='8f000000-0000-4000-8000-000000000001';
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values('8f200000-0000-4000-8000-000000000002','8f100000-0000-4000-8000-000000000001','Google Meet lifecycle fixture',now()+interval '2 hours',now()+interval '3 hours','scheduled');
update dars_private.lesson_meetings set mode='manual',status='ready',manual_url='https://zoom.us/j/123456?pwd=private-pass',provider_event_id='old_event_12345',event_generation=3,join_url=null
where lesson_id='8f200000-0000-4000-8000-000000000002';
delete from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000003';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v:=public.lesson_meeting('8f200000-0000-4000-8000-000000000001');
  if v->>'join_url'<>'https://meet.google.com/abc-defg-hij' or v ? 'mode' or v ? 'error_code' then
    raise exception 'accepted student did not receive only the current lesson join projection';
  end if;
end $$;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000004';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000004","role":"authenticated"}';
do $$ begin
  if public.lesson_meeting('8f200000-0000-4000-8000-000000000001') is not null then raise exception 'pending student read a meeting link'; end if;
end $$;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000002';
do $$ begin
  if public.lesson_meeting('8f200000-0000-4000-8000-000000000001') is not null then raise exception 'another teacher read a meeting link'; end if;
end $$;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000005';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000005","role":"authenticated"}';
do $$ begin
  if public.lesson_meeting('8f200000-0000-4000-8000-000000000001') is not null then raise exception 'admin read a meeting link'; end if;
end $$;
reset role;
update public.enrollments set status='removed' where group_id='8f100000-0000-4000-8000-000000000001' and student_id='8f000000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000003';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$ begin
  if public.lesson_meeting('8f200000-0000-4000-8000-000000000001') is not null then raise exception 'removed student retained meeting access'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
select public.manage_lesson_meeting('8f200000-0000-4000-8000-000000000002','prepare',null);
reset role;
do $$ begin
  if not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000002' and mode='automatic' and event_generation=4 and status='pending')
     or not exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000002' and operation='cancel' and event_generation=3 and provider_event_id='old_event_12345') then
    raise exception 'manual cleanup did not retain old generation before preparing replacement';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000002';
  if j is null then raise exception 'manual cleanup job was not claimable'; end if;
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'cancelled','old_event_12345',null,null,null);
  if not v_ok then raise exception 'cleanup settlement failed to resume the new generation'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000002' and operation='upsert' and event_generation=4 and provider_event_id is null) then
    raise exception 'cleanup settlement did not queue the new generation'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000002';
  if j is null or j->>'operation'<>'upsert' or (j->>'event_generation')::integer<>4 then raise exception 'replacement job lost generation identity'; end if;
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'ready','new_event_12345',j->>'conference_request_id','https://meet.google.com/abc-defg-hij',null);
  if not v_ok then raise exception 'replacement event did not settle'; end if;
end $$;
reset role;

update public.lessons set status='cancelled' where id='8f200000-0000-4000-8000-000000000002';
do $$ begin
  if (select event_generation from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000002')<>4 then raise exception 'cancellation unexpectedly changed generation'; end if;
end $$;
update public.lessons set status='scheduled' where id='8f200000-0000-4000-8000-000000000002';
do $$
begin
  if not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000002' and event_generation=5 and status='pending')
    or not exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000002' and operation='cancel' and event_generation=4 and provider_event_id='new_event_12345') then
    raise exception 'cancelled-to-scheduled transition did not advance generation while cleaning up old event';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000002';
  if j is null or j->>'operation'<>'cancel' then raise exception 'reactivation cleanup job was not claimable'; end if;
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'cancelled','new_event_12345',null,null,null);
  if not v_ok then raise exception 'reactivation cleanup did not queue replacement'; end if;
end $$;
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000002';
  if j is null or j->>'operation'<>'upsert' or (j->>'event_generation')::integer<>5 then raise exception 'reactivated generation was not claimable'; end if;
  perform public.manage_lesson_meeting('8f200000-0000-4000-8000-000000000002','manual','https://zoom.us/j/999999?pwd=manual-link');
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'ready','late_event_12345',j->>'conference_request_id','https://meet.google.com/abc-defg-hij',null);
  if v_ok then raise exception 'stale upsert published after manual override'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000002' and mode='manual' and status='ready' and manual_url='https://zoom.us/j/999999?pwd=manual-link' and join_url is null)
     or not exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000002' and operation='cancel' and provider_event_id='late_event_12345') then
    raise exception 'stale upsert did not preserve manual meeting and queue event cleanup'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000002';
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'cancelled','late_event_12345',null,null,null);
  if j is null or not v_ok then raise exception 'manual event cleanup did not settle'; end if;
end $$;
reset role;

delete from dars_private.google_meeting_jobs where teacher_id='8f000000-0000-4000-8000-000000000001';
insert into dars_private.google_meeting_jobs(lesson_id,teacher_id,connection_id,operation,desired_revision,event_generation)
select gen_random_uuid(),'8f000000-0000-4000-8000-000000000001',c.connection_id,'upsert',1,1
from dars_private.google_connections c cross join generate_series(1,100) where c.teacher_id='8f000000-0000-4000-8000-000000000001';
reset role;
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values('8f200000-0000-4000-8000-000000000003','8f100000-0000-4000-8000-000000000001','Google Meet cap fixture',now()+interval '4 hours',now()+interval '5 hours','scheduled');
do $$
begin
  if exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000003')
     or not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000003' and status='unprepared' and error_code='meeting_queue_full') then
    raise exception 'automatic queue cap assertion: job %, status %, error %, owner jobs %',
      exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000003'),
      (select status from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000003'),
      (select error_code from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000003'),
      (select count(*) from dars_private.google_meeting_jobs where teacher_id='8f000000-0000-4000-8000-000000000001');
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
begin
  begin
    perform public.manage_lesson_meeting('8f200000-0000-4000-8000-000000000003','prepare',null);
    raise exception 'explicit preparation exceeded 100 job cap';
  exception when raise_exception then
    if sqlerrm='explicit preparation exceeded 100 job cap' then raise; end if;
    if sqlerrm<>'meeting_queue_full' then raise; end if;
  end;
end $$;
reset role;
delete from dars_private.google_meeting_jobs where teacher_id='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values('8f200000-0000-4000-8000-000000000004','8f100000-0000-4000-8000-000000000001','Former owner lesson',now()+interval '6 hours',now()+interval '7 hours','scheduled');
update dars_private.lesson_meetings set provider_event_id='reassigned_event_12345' where lesson_id='8f200000-0000-4000-8000-000000000004';
update dars_private.google_meeting_jobs set provider_event_id='reassigned_event_12345' where lesson_id='8f200000-0000-4000-8000-000000000004';
update public.groups set teacher_id='8f000000-0000-4000-8000-000000000002' where id='8f100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000004';
  if j is null or j->>'operation'<>'cancel' or j->>'title' is not null or j->>'starts_at' is not null or j->>'ends_at' is not null then raise exception 'former owner received reassigned lesson data: %',j; end if;
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'cancelled',null,null,null,null);
  if not v_ok then raise exception 'former owner cancellation did not settle'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000002';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000022';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000022"}';
select public.manage_lesson_meeting('8f200000-0000-4000-8000-000000000004','manual','https://zoom.us/j/777777?pwd=new-owner');
do $$
declare v jsonb;
begin
  v:=public.lesson_meeting('8f200000-0000-4000-8000-000000000004');
  if v->>'mode'<>'manual' or v->>'join_url'<>'https://zoom.us/j/777777?pwd=new-owner' then raise exception 'new owner could not set their own manual meeting'; end if;
end $$;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$ begin
  if public.lesson_meeting('8f200000-0000-4000-8000-000000000004') is not null then raise exception 'former owner could still read transferred lesson data'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000004' and teacher_id='8f000000-0000-4000-8000-000000000002' and mode='manual' and manual_url='https://zoom.us/j/777777?pwd=new-owner' and provider_event_id is null and join_url is null) then
    raise exception 'ownership transfer retained old provider identity or failed new-owner mode'; end if;
end $$;
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';
update public.groups set teacher_id='8f000000-0000-4000-8000-000000000001' where id='8f100000-0000-4000-8000-000000000001';
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values('8f200000-0000-4000-8000-000000000005','8f100000-0000-4000-8000-000000000001','Disconnect race lesson',now()+interval '8 hours',now()+interval '9 hours','scheduled');
set local role authenticated;
set local request.jwt.claim.sub='8f000000-0000-4000-8000-000000000001';
set local request.jwt.claim.session_id='8f000000-0000-4000-8000-000000000011';
set local request.jwt.claims='{"sub":"8f000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8f000000-0000-4000-8000-000000000011"}';
do $$
declare j jsonb; v_ok boolean;
begin
  select x into j from public.claim_google_meeting_jobs(1) x where x->>'lesson_id'='8f200000-0000-4000-8000-000000000005';
  if j is null then raise exception 'disconnect-race job was not claimable'; end if;
  perform public.google_meet_disconnect();
  v_ok:=public.settle_google_meeting_job((j->>'job_id')::uuid,(j->>'lease_token')::uuid,(j->>'desired_revision')::bigint,'ready','late_event_54321',j->>'conference_request_id','https://meet.google.com/abc-defg-hij',null);
  if v_ok then raise exception 'in-flight upsert succeeded after disconnect'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000005' and status='disconnected' and join_url is null and provider_event_id='late_event_54321')
     or not exists(select 1 from dars_private.google_meeting_jobs where lesson_id='8f200000-0000-4000-8000-000000000005' and desired_revision=(select desired_revision from dars_private.lesson_meetings where lesson_id='8f200000-0000-4000-8000-000000000005')) then
    raise exception 'disconnect race published link or lost stale event identity'; end if;
end $$;
rollback;
select 'Google Meet database assertions passed' as result;
