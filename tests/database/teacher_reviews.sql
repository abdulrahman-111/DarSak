\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('public.teacher_review_state') is null or to_regclass('public.teacher_review_events') is null then
    raise exception 'teacher review tables are missing';
  end if;
  if (select count(*) from public.teacher_review_state s join public.teacher_profiles t on t.id=s.teacher_id where (s.status='approved') is distinct from t.approved) > 0 then
    raise exception 'review-state backfill changed or mismatched approval compatibility';
  end if;
  if exists(select 1 from public.teacher_review_events) then
    raise exception 'silent existing-user backfill generated retrospective events';
  end if;
  if has_table_privilege('anon','public.teacher_review_state','SELECT')
     or has_table_privilege('anon','public.teacher_review_events','SELECT')
     or has_table_privilege('authenticated','public.teacher_review_state','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.teacher_review_events','INSERT,UPDATE,DELETE') then
    raise exception 'review tables have unsafe role privileges';
  end if;
  if has_function_privilege('anon','public.teacher_review_status(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.teacher_review_status(uuid)','EXECUTE')
     or has_function_privilege('anon','public.admin_teacher_reviews(text,text,integer,integer)','EXECUTE') then
    raise exception 'review projection grants are too broad or missing';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7b000000-0000-4000-8000-000000000001','authenticated','authenticated','review-owner@test.invalid','{"full_name":"Review owner","requested_role":"teacher"}'),
 ('7b000000-0000-4000-8000-000000000002','authenticated','authenticated','review-other@test.invalid','{"full_name":"Review other","requested_role":"teacher"}'),
 ('7b000000-0000-4000-8000-000000000003','authenticated','authenticated','review-admin@test.invalid','{"full_name":"Review admin","requested_role":"student"}');
set local session_replication_role = replica;
update public.profiles set role='admin' where id='7b000000-0000-4000-8000-000000000003';
update public.teacher_profiles set approved=true where id='7b000000-0000-4000-8000-000000000002';
set local session_replication_role = origin;
-- This file preserves the legacy review workflow. The owner remains pending,
-- while the other teacher represents a previously approved account. The
-- separate teacher_applications.sql suite covers new-app submission guards.
update public.teacher_applications
set legacy_approved=true,
    status=case teacher_id
      when '7b000000-0000-4000-8000-000000000002'::uuid then 'approved'
      else 'draft'
    end
where teacher_id in ('7b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002');
do $$ begin
  if (select count(*) from public.teacher_applications where teacher_id in ('7b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002') and legacy_approved)<>2 then
    raise exception 'legacy review application fixtures were not initialized';
  end if;
end $$;
delete from public.teacher_review_events where teacher_id in ('7b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002');
insert into public.teacher_review_state(teacher_id,status,request_id,requested_at)
values
 ('7b000000-0000-4000-8000-000000000001','pending','7b100000-0000-4000-8000-000000000001',now()),
 ('7b000000-0000-4000-8000-000000000002','approved',null,now())
on conflict(teacher_id) do update set status=excluded.status,request_id=excluded.request_id,
  requested_at=excluded.requested_at,reviewed_at=null,reviewed_by=null,decline_reason=null;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7b000000-0000-4000-8000-000000000004','authenticated','authenticated','review-new@test.invalid','{"full_name":"Review new","requested_role":"teacher"}');
do $$
begin
  if (select status from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000004')<>'pending'
     or (select count(*) from public.teacher_review_events where teacher_id='7b000000-0000-4000-8000-000000000004' and kind='requested')<>1 then
    raise exception 'new teacher did not atomically create one pending request event';
  end if;
end $$;
-- This compatibility assertion exercises the legacy admin_update_user path.
-- The new-application suite separately verifies that an unmarked new draft
-- cannot be approved through either canonical or raw compatibility writes.
update public.teacher_applications set legacy_approved=true,status='draft'
where teacher_id='7b000000-0000-4000-8000-000000000004';

set local role anon;
set local request.jwt.claim.sub='';
do $$
begin
  begin
    perform * from public.teacher_review_state;
    raise exception 'anonymous can read review state';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.teacher_review_status('7b000000-0000-4000-8000-000000000001');
    raise exception 'anonymous can call owner review projection';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000001';
do $$
declare v_status jsonb;
begin
  v_status:=public.teacher_review_status();
  if v_status->>'status'<>'pending' or v_status->>'request_id'<>'7b100000-0000-4000-8000-000000000001' then
    raise exception 'owner status projection omitted safe current review state';
  end if;
  if (select count(*) from public.teacher_review_state)<>1 then raise exception 'owner can read foreign review state'; end if;
  begin update public.teacher_review_state set status='approved' where teacher_id=auth.uid();
    raise exception 'owner directly changed review state';
  exception when insufficient_privilege then null; end;
  begin insert into public.teacher_review_events(teacher_id,kind,source) values(auth.uid(),'approved','spoof');
    raise exception 'owner directly inserted review event';
  exception when insufficient_privilege then null; end;
  begin
    perform public.teacher_review_status('7b000000-0000-4000-8000-000000000002');
    raise exception 'owner read another teacher review status';
  exception when raise_exception then
    if sqlerrm='owner read another teacher review status' then raise; end if;
  end;
  begin
    update public.teacher_profiles set approved=true where id=auth.uid();
    raise exception 'teacher directly changed compatibility approval';
  exception when raise_exception then
    if sqlerrm='teacher directly changed compatibility approval' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000003';
do $$
declare v_page jsonb;
begin
  v_page:=public.admin_teacher_reviews('all','Review',0,1);
  if jsonb_array_length(v_page->'rows')<>1 or (v_page->>'total')::integer<>3 then
    raise exception 'admin queue pagination or independent total is incorrect';
  end if;
  if (v_page->'rows'->0 ? 'recipient_email') or (v_page->'rows'->0 ? 'payload') then
    raise exception 'admin queue exposed private email/outbox data';
  end if;
  begin perform public.admin_teacher_reviews('all',repeat('x',121),0,30);
    raise exception 'overlong review search was accepted';
  exception when raise_exception then
    if sqlerrm='overlong review search was accepted' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000003';
do $$
declare v_event uuid;
begin
  v_event:=public.admin_decide_teacher_review('7b000000-0000-4000-8000-000000000001','7b100000-0000-4000-8000-000000000001','declined','  Please add more teaching detail.  ');
  if v_event is null or (select status from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000001')<>'declined'
     or (select decline_reason from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000001')<>'Please add more teaching detail.'
     or (select approved from public.teacher_profiles where id='7b000000-0000-4000-8000-000000000001') then
    raise exception 'decline did not synchronize private state and approved compatibility';
  end if;
  begin
    perform public.admin_decide_teacher_review('7b000000-0000-4000-8000-000000000001','7b100000-0000-4000-8000-000000000001','approved',null);
    raise exception 'stale competing decision was accepted';
  exception when sqlstate '40001' then null; end;
  if (select count(*) from public.teacher_review_events where teacher_id='7b000000-0000-4000-8000-000000000001' and kind in ('approved','declined'))<>1 then
    raise exception 'stale decision emitted a duplicate review event';
  end if;
  begin
    perform public.admin_decide_teacher_review('7b000000-0000-4000-8000-000000000003',null,'approved',null);
    raise exception 'admin target review was accepted';
  exception when raise_exception then
    if sqlerrm='admin target review was accepted' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000001';
do $$
declare v_request uuid; v_event_count bigint; v_status jsonb;
begin
  v_event_count:=(select count(*) from public.teacher_review_events where teacher_id=auth.uid());
  v_request:=public.request_teacher_review();
  if v_request is null or (select decline_reason from public.teacher_review_state where teacher_id=auth.uid()) is not null then
    raise exception 'declined teacher resubmission did not clear current reason';
  end if;
  if public.request_teacher_review() is distinct from v_request then raise exception 'pending retry changed request token'; end if;
  v_status:=public.teacher_review_status();
  if (select count(*) from public.teacher_review_events where teacher_id=auth.uid())<>v_event_count+1
     or jsonb_array_length(v_status->'events')<>v_event_count+1 then
    raise exception 'pending retry created an extra request event';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000003';
do $$
declare v_request uuid;
begin
  select request_id into v_request from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000001';
  perform public.admin_decide_teacher_review('7b000000-0000-4000-8000-000000000001',v_request,'approved',null);
  if not (select approved from public.teacher_profiles where id='7b000000-0000-4000-8000-000000000001') then
    raise exception 'approval did not set compatibility boolean';
  end if;
  update public.teacher_profiles set approved=false where id='7b000000-0000-4000-8000-000000000002';
  if not (select approved from public.teacher_profiles where id='7b000000-0000-4000-8000-000000000002') then
    raise exception 'raw admin write changed another teacher approval';
  end if;
  begin perform public.admin_update_user(auth.uid(),'suspended',null);
    raise exception 'admin self-target suspension was accepted';
  exception when raise_exception then
    if sqlerrm='admin self-target suspension was accepted' then raise; end if;
  end;
  begin perform public.admin_update_user('7b000000-0000-4000-8000-000000000003','suspended',null);
    raise exception 'admin target suspension was accepted';
  exception when raise_exception then
    if sqlerrm='admin target suspension was accepted' then raise; end if;
  end;
  perform public.admin_update_user('7b000000-0000-4000-8000-000000000001','suspended',null);
  if (select status from public.profiles where id='7b000000-0000-4000-8000-000000000001')<>'suspended'
     or (select status from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000001')<>'approved' then
    raise exception 'suspension changed initial review status';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000003';
do $$
begin
  perform public.admin_update_user('7b000000-0000-4000-8000-000000000004','active',true);
  if (select status from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000004')<>'approved'
     or not (select approved from public.teacher_profiles where id='7b000000-0000-4000-8000-000000000004') then
    raise exception 'legacy approval request did not use the synchronized review path';
  end if;
  begin
    perform public.admin_update_user('7b000000-0000-4000-8000-000000000004','suspended',false);
    raise exception 'legacy contradictory completed decision was accepted';
  exception when raise_exception then
    if sqlerrm='legacy contradictory completed decision was accepted' then raise; end if;
  end;
end $$;
reset role;

set local role service_role;
do $$
begin
  update public.teacher_profiles set approved=false where id='7b000000-0000-4000-8000-000000000004';
  if (select status from public.teacher_review_state where teacher_id='7b000000-0000-4000-8000-000000000004')<>'declined'
     or (select count(*) from public.teacher_review_events where teacher_id='7b000000-0000-4000-8000-000000000004' and kind='operator_sync')<>1 then
    raise exception 'service-role approval change was not synchronized to an operator audit event';
  end if;
end $$;
reset role;

rollback;
