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
  if exists(select 1 from public.teacher_review_events) or exists(select 1 from dars_private.email_outbox) then
    raise exception 'silent existing-user backfill generated retrospective events or jobs';
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
insert into public.teacher_review_state(teacher_id,status,request_id,requested_at)
values
 ('7b000000-0000-4000-8000-000000000001','pending','7b100000-0000-4000-8000-000000000001',now()),
 ('7b000000-0000-4000-8000-000000000002','approved',null,now());

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
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7b000000-0000-4000-8000-000000000003';
do $$
declare v_page jsonb;
begin
  v_page:=public.admin_teacher_reviews('all','Review',0,1);
  if jsonb_array_length(v_page->'rows')<>1 or (v_page->>'total')::integer<>2 then
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

rollback;
