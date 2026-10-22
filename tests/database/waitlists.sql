\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('public.waitlist_entries') is null
     or to_regprocedure('public.join_group_waitlist(uuid)') is null
     or to_regprocedure('public.withdraw_group_waitlist(uuid)') is null
     or to_regprocedure('public.promote_group_waitlist(uuid)') is null
     or to_regprocedure('public.student_waitlist_page(integer,integer)') is null
     or to_regprocedure('public.teacher_waitlist_page(text,uuid,integer,integer)') is null then
    raise exception 'waitlist migration is incomplete';
  end if;
  if has_table_privilege('authenticated','public.waitlist_entries','INSERT')
     or has_table_privilege('authenticated','public.waitlist_entries','UPDATE')
     or has_table_privilege('authenticated','public.waitlist_entries','DELETE')
     or has_table_privilege('anon','public.waitlist_entries','SELECT')
     or has_table_privilege('service_role','public.waitlist_entries','SELECT') then
    raise exception 'waitlist table exposes direct writes or unauthorized reads';
  end if;
  if not has_table_privilege('authenticated','public.waitlist_entries','SELECT')
     or not has_function_privilege('authenticated','public.join_group_waitlist(uuid)','EXECUTE')
     or has_function_privilege('anon','public.join_group_waitlist(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.join_group_waitlist(uuid)','EXECUTE') then
    raise exception 'waitlist read/RPC grants are incorrect';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','authenticated','authenticated','waitlist-owner@test.invalid','{"full_name":"Waitlist Owner","requested_role":"teacher"}'),
 ('c1000000-0000-4000-8000-000000000002','authenticated','authenticated','waitlist-student-one@test.invalid','{"full_name":"Waitlist Student One","requested_role":"student"}'),
 ('c1000000-0000-4000-8000-000000000003','authenticated','authenticated','waitlist-student-two@test.invalid','{"full_name":"Waitlist Student Two","requested_role":"student"}'),
 ('c1000000-0000-4000-8000-000000000004','authenticated','authenticated','waitlist-outsider@test.invalid','{"full_name":"Waitlist Outsider","requested_role":"teacher"}'),
 ('c1000000-0000-4000-8000-000000000005','authenticated','authenticated','waitlist-student-three@test.invalid','{"full_name":"Waitlist Student Three","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='c1000000-0000-4000-8000-000000000001';
update public.teacher_profiles set approved=true where id='c1000000-0000-4000-8000-000000000004';
set local session_replication_role=origin;

set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select f.id,f.teacher_id,o.id,f.name,f.capacity,f.status
from (values
 ('c1100000-0000-4000-8000-000000000001'::uuid,'c1000000-0000-4000-8000-000000000001'::uuid,'Waitlist Full',1,'published'::public.group_status),
 ('c1100000-0000-4000-8000-000000000002'::uuid,'c1000000-0000-4000-8000-000000000001'::uuid,'Waitlist Available',2,'published'::public.group_status),
 ('c1100000-0000-4000-8000-000000000003'::uuid,'c1000000-0000-4000-8000-000000000001'::uuid,'Waitlist Archive',2,'published'::public.group_status)
) f(id,teacher_id,name,capacity,status)
cross join lateral (select id from public.offerings order by id limit 1) o;
insert into public.enrollments(id,group_id,student_id,status) values
 ('c1200000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','accepted');
set local session_replication_role=origin;

set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000002';
select public.join_group_waitlist('c1100000-0000-4000-8000-000000000001') as waiting_id \gset
select public.join_group_waitlist('c1100000-0000-4000-8000-000000000001') as retry_id \gset
select set_config('test.waiting_id', :'waiting_id', true);
select set_config('test.retry_waiting_id', :'retry_id', true);
do $$
declare v_page jsonb; v_message text;
begin
  if current_setting('test.waiting_id')::uuid is distinct from current_setting('test.retry_waiting_id')::uuid then raise exception 'join retry created a second entry'; end if;
  v_page:=public.student_waitlist_page();
  if v_page->>'total'<>'1' or v_page->'rows'->0->>'status'<>'waiting'
     or v_page->'rows'->0->>'group_name'<>'Waitlist Full' then raise exception 'student waitlist page has wrong JSON fields'; end if;
  if (select count(*) from public.waitlist_entries where student_id='c1000000-0000-4000-8000-000000000002')<>1
     or (select count(*) from public.waitlist_entries where student_id<>'c1000000-0000-4000-8000-000000000002')<>0 then raise exception 'waitlist SELECT RLS exposed another student'; end if;
  if public.is_group_member('c1100000-0000-4000-8000-000000000001') then raise exception 'waiting student received accepted-member access'; end if;
  begin perform public.request_enrollment('c1100000-0000-4000-8000-000000000001');
    raise exception 'ordinary request bypassed waitlist consent';
  exception when others then get stacked diagnostics v_message=message_text;
    if v_message<>'withdraw from waitlist first' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000003';
do $$
declare v_id uuid; v_message text;
begin
  v_id:=public.request_enrollment('c1100000-0000-4000-8000-000000000001');
  if v_id<>'c1200000-0000-4000-8000-000000000001' then raise exception 'existing accepted request was not returned before full check'; end if;
  begin perform public.request_enrollment('c1100000-0000-4000-8000-000000000001');
  exception when others then get stacked diagnostics v_message=message_text;
    if v_message<>'group full; join waitlist' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000005';
do $$ declare v_message text; begin
  begin perform public.request_enrollment('c1100000-0000-4000-8000-000000000001');
    raise exception 'new request bypassed a full group';
  exception when others then get stacked diagnostics v_message=message_text;
    if v_message<>'group full; join waitlist' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000001';
do $$
declare v_page jsonb;
begin
  if (select count(*) from public.waitlist_entries)<>1 then raise exception 'owner cannot read their waitlist entries'; end if;
  v_page:=public.teacher_waitlist_page('Student One');
  if v_page->>'total'<>'1' or v_page->'rows'->0->>'student_id'<>'c1000000-0000-4000-8000-000000000002'
    or v_page->'rows'->0->>'can_promote'<>'false' then raise exception 'teacher waitlist page/search/capacity data incorrect'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000004';
do $$
declare v_page jsonb; v_message text;
begin
  if (select count(*) from public.waitlist_entries)<>0 then raise exception 'foreign teacher can read another teacher waitlist'; end if;
  v_page:=public.teacher_waitlist_page();
  if v_page->>'total'<>'0' then raise exception 'foreign teacher RPC returned another teacher waitlist'; end if;
  begin perform public.promote_group_waitlist(current_setting('test.waiting_id')::uuid);
    raise exception 'foreign teacher promoted another teacher waitlist';
  exception when others then get stacked diagnostics v_message=message_text;
    if v_message<>'not authorized' then raise; end if;
  end;
end $$;
reset role;

-- The group lock serializes promotion with decisions. Free the last seat,
-- then check the ordinary pending review and both owner-alert suppressions.
set local session_replication_role=replica;
update public.enrollments set status='removed' where id='c1200000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000002';
do $$ begin
  if public.join_group_waitlist('c1100000-0000-4000-8000-000000000001')<>current_setting('test.waiting_id')::uuid then
    raise exception 'waiting retry failed after a seat became available';
  end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000001';
select public.promote_group_waitlist(:'waiting_id') as enrollment_id \gset
select public.promote_group_waitlist(:'waiting_id') as retry_enrollment_id \gset
select set_config('test.enrollment_id', :'enrollment_id', true);
select set_config('test.retry_enrollment_id', :'retry_enrollment_id', true);
reset role;
do $$
begin
  if current_setting('test.enrollment_id')::uuid is distinct from current_setting('test.retry_enrollment_id')::uuid
     or (select status from public.enrollments where id=current_setting('test.enrollment_id')::uuid)<>'pending'
     or (select status from public.waitlist_entries where id=current_setting('test.waiting_id')::uuid)<>'promoted'
     or (select count(*) from public.user_notifications where recipient_id='c1000000-0000-4000-8000-000000000002' and kind='waitlist_promoted' and payload->>'waitlist_id'=current_setting('test.waiting_id'))<>1
     or exists(select 1 from public.user_notifications where recipient_id='c1000000-0000-4000-8000-000000000001' and kind='enrollment_requested' and payload->>'group_id'='c1100000-0000-4000-8000-000000000001')
     or exists(select 1 from dars_private.email_outbox where recipient_user_id='c1000000-0000-4000-8000-000000000001' and kind='enrollment_requested' and payload->>'group_id'='c1100000-0000-4000-8000-000000000001') then
    raise exception 'promotion did not produce one student notice, pending enrollment, and no owner alert';
  end if;
  if public.is_group_member('c1100000-0000-4000-8000-000000000001') then raise exception 'pending promotion granted accepted-member access'; end if;
end $$;

-- A new consent cycle can promote a previously canceled enrollment into a
-- fresh pending review, with one additional student notice.
set local session_replication_role=replica;
update public.enrollments set status='cancelled' where id=current_setting('test.enrollment_id')::uuid;
update public.enrollments set status='accepted' where id='c1200000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000002';
do $$ begin
  if public.join_group_waitlist('c1100000-0000-4000-8000-000000000001')<>current_setting('test.waiting_id')::uuid then
    raise exception 'waitlist rejoin after canceled promotion failed';
  end if;
end $$;
reset role;
set local session_replication_role=replica;
update public.enrollments set status='removed' where id='c1200000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000001';
select public.promote_group_waitlist(current_setting('test.waiting_id')::uuid);
reset role;
do $$
begin
  if (select status from public.enrollments where id=current_setting('test.enrollment_id')::uuid)<>'pending'
     or (select count(*) from public.user_notifications where recipient_id='c1000000-0000-4000-8000-000000000002' and kind='waitlist_promoted' and payload->>'waitlist_id'=current_setting('test.waiting_id'))<>2
     or exists(select 1 from public.user_notifications where recipient_id='c1000000-0000-4000-8000-000000000001' and kind='enrollment_requested' and payload->>'group_id'='c1100000-0000-4000-8000-000000000001')
     or exists(select 1 from dars_private.email_outbox where recipient_user_id='c1000000-0000-4000-8000-000000000001' and kind='enrollment_requested' and payload->>'group_id'='c1100000-0000-4000-8000-000000000001') then
    raise exception 're-promotion did not create one new student notice or reactivated owner alerts';
  end if;
end $$;

-- A normal student request still creates the usual teacher notifications.
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000003';
select public.request_enrollment('c1100000-0000-4000-8000-000000000002');
reset role;
do $$ begin
  if not exists(select 1 from public.user_notifications where recipient_id='c1000000-0000-4000-8000-000000000001' and kind='enrollment_requested' and payload->>'group_id'='c1100000-0000-4000-8000-000000000002')
     or not exists(select 1 from dars_private.email_outbox where recipient_user_id='c1000000-0000-4000-8000-000000000001' and kind='enrollment_requested' and payload->>'group_id'='c1100000-0000-4000-8000-000000000002') then
    raise exception 'ordinary student request lost its owner notifications';
  end if;
end $$;

-- Archived groups close waiting entries under the group lock; student history
-- remains visible, and direct clients cannot mutate the table.
set local session_replication_role=replica;
insert into public.waitlist_entries(id,group_id,student_id) values
 ('c1300000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002');
set local session_replication_role=origin;
update public.groups set status='archived' where id='c1100000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000002';
do $$
declare v_page jsonb;
begin
  v_page:=public.student_waitlist_page();
  if not exists(select 1 from jsonb_array_elements(v_page->'rows') r where r->>'id'='c1300000-0000-4000-8000-000000000001' and r->>'status'='closed') then
    raise exception 'archive did not preserve closed history in student page';
  end if;
  begin insert into public.waitlist_entries(group_id,student_id) values('c1100000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002');
    raise exception 'direct waitlist insert was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Withdrawal remains available after the teacher loses access.
set local session_replication_role=replica;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select 'c1100000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000001',o.id,'Waitlist Expired Teacher',1,'published'
from public.offerings o order by o.id limit 1;
insert into public.waitlist_entries(id,group_id,student_id) values
 ('c1300000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000002');
set local session_replication_role=origin;
update dars_private.teacher_quota_policy set quotas_enabled=true,effective_at=statement_timestamp()-interval '1 second' where singleton;
do $$ begin
  if dars_private.teacher_has_access('c1000000-0000-4000-8000-000000000001') then raise exception 'fixture did not expire teacher access'; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-4000-8000-000000000002';
select public.withdraw_group_waitlist('c1300000-0000-4000-8000-000000000002');
select public.withdraw_group_waitlist('c1300000-0000-4000-8000-000000000002');
do $$ begin
  if (select status from public.waitlist_entries where id='c1300000-0000-4000-8000-000000000002')<>'withdrawn' then raise exception 'withdraw failed after teacher access expiry'; end if;
end $$;
reset role;

rollback;
