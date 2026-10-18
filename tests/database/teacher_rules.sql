\set ON_ERROR_STOP on
begin;
do $$ begin
 if has_table_privilege('anon','public.teacher_rules_acceptances','SELECT')
 or has_table_privilege('authenticated','public.teacher_rules_acceptances','INSERT,UPDATE,DELETE')
 or has_function_privilege('anon','public.accept_teacher_rules(text)','EXECUTE') then raise exception 'teacher rules ACL too broad'; end if;
 if (select prosecdef from pg_proc where oid='public.complete_teacher_account_setup_with_rules(bigint,text,text,text)'::regprocedure)
 or (select prosecdef from pg_proc where oid='public.submit_teacher_application_with_rules(timestamptz,text)'::regprocedure) then raise exception 'wrappers elevate privileges'; end if;
end $$;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('85000000-0000-4000-8000-000000000001','authenticated','authenticated','rules-teacher@test.invalid','{"requested_role":"teacher","full_name":"Rules teacher"}'),
 ('85000000-0000-4000-8000-000000000002','authenticated','authenticated','rules-other@test.invalid','{"requested_role":"teacher","full_name":"Rules other"}'),
 ('85000000-0000-4000-8000-000000000003','authenticated','authenticated','rules-student@test.invalid','{"requested_role":"student","full_name":"Rules student"}');
set local role authenticated;
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000001';
do $$ declare initial_time timestamptz;
begin
 begin perform public.accept_teacher_rules('old-version'); raise exception 'old rules accepted'; exception when invalid_parameter_value then null; end;
 perform public.accept_teacher_rules('2026-10-18');
 select accepted_at into initial_time from public.teacher_rules_acceptances where teacher_id=auth.uid();
 if initial_time is null or initial_time<transaction_timestamp() then raise exception 'missing or non-server acceptance timestamp'; end if;
 perform public.accept_teacher_rules('2026-10-18');
 if (select accepted_at from public.teacher_rules_acceptances where teacher_id=auth.uid()) is distinct from initial_time then raise exception 'retry changed original acceptance'; end if;
 begin insert into public.teacher_rules_acceptances values(auth.uid(),'forged','2000-01-01'); raise exception 'forged timestamp accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000002';
do $$ begin
 if exists(select 1 from public.teacher_rules_acceptances) then raise exception 'foreign teacher saw acceptance'; end if;
 begin
  perform public.complete_teacher_account_setup_with_rules(999999,'en',null,'2026-10-18');
  raise exception 'invalid completion accepted';
 exception when others then if sqlerrm='invalid completion accepted' then raise; end if; end;
 if exists(select 1 from public.teacher_rules_acceptances where teacher_id=auth.uid()) then raise exception 'failed completion persisted acceptance'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000003';
do $$ begin
 begin perform public.accept_teacher_rules('2026-10-18'); raise exception 'student accepted teacher rules'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local session_replication_role=replica;
update public.profiles set role='admin' where id='85000000-0000-4000-8000-000000000003';
update public.profiles set status='suspended' where id='85000000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000003';
do $$ begin
 if (select count(*) from public.teacher_rules_acceptances)<>1 then raise exception 'active admin could not inspect acceptance evidence'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='85000000-0000-4000-8000-000000000002';
do $$ begin
 begin perform public.accept_teacher_rules('2026-10-18'); raise exception 'suspended teacher accepted rules'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'teacher rules privacy and atomic acceptance passed';
rollback;
