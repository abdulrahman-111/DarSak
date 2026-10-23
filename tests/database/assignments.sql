\set ON_ERROR_STOP on
begin;

do $$ begin
 if to_regclass('public.group_assignments') is null or to_regclass('public.assignment_submissions') is null
  or to_regprocedure('public.save_group_assignment(uuid,text,text,text,timestamptz,uuid,integer)') is null
  or to_regprocedure('public.archive_group_assignment(uuid,integer)') is null
  or to_regprocedure('public.submit_assignment_link(uuid,text,text,integer)') is null
  or to_regprocedure('public.review_assignment_submission(uuid,text,integer)') is null
  or to_regprocedure('public.student_assignment_page(uuid,integer,integer)') is null
  or to_regprocedure('public.teacher_assignment_page(uuid,integer,integer)') is null
  or to_regprocedure('public.teacher_assignment_submissions(uuid,integer,integer)') is null then raise exception 'assignment schema/RPC missing'; end if;
 if has_table_privilege('authenticated','public.group_assignments','INSERT') or has_table_privilege('authenticated','public.assignment_submissions','UPDATE')
  or has_table_privilege('anon','public.assignment_submissions','SELECT') or has_table_privilege('service_role','public.group_assignments','SELECT')
  or has_function_privilege('anon','public.submit_assignment_link(uuid,text,text,integer)','EXECUTE')
  or has_function_privilege('service_role','public.submit_assignment_link(uuid,text,text,integer)','EXECUTE') then raise exception 'assignment ACL exposed'; end if;
end $$;

set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('ca000000-0000-4000-8000-000000000001','authenticated','authenticated','assignment-teacher@test.invalid','{}'),
 ('ca000000-0000-4000-8000-000000000002','authenticated','authenticated','assignment-student@test.invalid','{}'),
 ('ca000000-0000-4000-8000-000000000003','authenticated','authenticated','assignment-peer@test.invalid','{}'),
 ('ca000000-0000-4000-8000-000000000004','authenticated','authenticated','assignment-admin@test.invalid','{}');
insert into public.profiles(id,full_name,role,status) values
 ('ca000000-0000-4000-8000-000000000001','Assignment Teacher','teacher','active'),
 ('ca000000-0000-4000-8000-000000000002','Assignment Student','student','active'),
 ('ca000000-0000-4000-8000-000000000003','Assignment Peer','student','active'),
 ('ca000000-0000-4000-8000-000000000004','Assignment Admin','admin','active');
insert into public.teacher_profiles(id,approved) values('ca000000-0000-4000-8000-000000000001',true);
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select 'ca200000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001',o.id,'Assignment Group',10,'published'
from public.offerings o order by o.id limit 1;
insert into public.enrollments(id,group_id,student_id,status) values('ca300000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002','accepted');
set local session_replication_role=origin;
select dars_private.issue_teacher_access_grant('ca000000-0000-4000-8000-000000000001','signup',null,null,statement_timestamp()-interval '1 day',false);

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000001';
select public.save_group_assignment('ca200000-0000-4000-8000-000000000001','  Homework  ','Read chapter','https://example.test/task',statement_timestamp()-interval '1 day') as aid \gset
select set_config('test.assignment_id', :'aid', true);
do $$ declare v text; begin
 begin perform public.save_group_assignment('ca200000-0000-4000-8000-000000000001','Bad','','https://user:pass@example.test',null); raise exception 'credential URL accepted'; exception when others then get stacked diagnostics v=message_text; if v='credential URL accepted' then raise; end if; end;
 begin perform public.save_group_assignment('ca200000-0000-4000-8000-000000000001','Bad','','https://',null); raise exception 'malformed URL accepted'; exception when others then get stacked diagnostics v=message_text; if v='malformed URL accepted' then raise; end if; end;
 begin perform public.save_group_assignment('ca200000-0000-4000-8000-000000000001','Bad','','https://example.test:99999',null); raise exception 'invalid port accepted'; exception when others then get stacked diagnostics v=message_text; if v='invalid port accepted' then raise; end if; end;
 begin perform public.save_group_assignment('ca200000-0000-4000-8000-000000000001','Bad','','https://999.999.999.999',null); raise exception 'invalid IPv4 accepted'; exception when others then get stacked diagnostics v=message_text; if v='invalid IPv4 accepted' then raise; end if; end;
 begin perform public.save_group_assignment('ca200000-0000-4000-8000-000000000001','Bad','instructions',null,'infinity'); raise exception 'infinite deadline accepted'; exception when others then get stacked diagnostics v=message_text; if v='infinite deadline accepted' then raise; end if; end;
 begin perform public.save_group_assignment('ca200000-0000-4000-8000-000000000001','Stale','x',null,null,current_setting('test.assignment_id')::uuid,9); raise exception 'stale edit accepted'; exception when sqlstate '40001' then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000002';
select public.submit_assignment_link(current_setting('test.assignment_id')::uuid,'https://example.test/answer','First attempt',null) as sid \gset
select set_config('test.submission_id', :'sid', true);
do $$ declare v jsonb; begin
 v:=public.student_assignment_page('ca200000-0000-4000-8000-000000000001',0,20);
 if v->>'total'<>'1' or v->'rows'->0->'submission'->>'is_late'<>'true' then raise exception 'late submission page shape/label incorrect'; end if;
 if (select count(*) from public.assignment_submissions where student_id='ca000000-0000-4000-8000-000000000002')<>1 then raise exception 'own submission missing'; end if;
 if (select count(*) from public.assignment_submissions where student_id<>'ca000000-0000-4000-8000-000000000002')<>0 then raise exception 'peer submission leaked'; end if;
 begin perform public.submit_assignment_link(current_setting('test.assignment_id')::uuid,'ftp://example.test','',1); raise exception 'unsafe URL accepted'; exception when others then if sqlerrm='unsafe URL accepted' then raise; end if; end;
 begin perform public.submit_assignment_link(current_setting('test.assignment_id')::uuid,'https:///broken','',1); raise exception 'malformed URL accepted'; exception when others then if sqlerrm='malformed URL accepted' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000001';
do $$ declare v jsonb; begin
 v:=public.teacher_assignment_submissions(current_setting('test.assignment_id')::uuid,0,20);
 if v->>'total'<>'1' or v->'rows'->0->>'student_name'<>'Assignment Student' or v->'rows'->0->>'enrollment_status'<>'accepted' then raise exception 'teacher submission page shape incorrect'; end if;
 perform public.review_assignment_submission(current_setting('test.submission_id')::uuid,'Private feedback',1);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000002';
do $$ declare v jsonb; begin
 v:=public.student_assignment_page('ca200000-0000-4000-8000-000000000001',0,20);
 if v->'rows'->0->'submission'->>'teacher_feedback'<>'Private feedback' then raise exception 'private feedback missing from own page'; end if;
 perform public.submit_assignment_link(current_setting('test.assignment_id')::uuid,'https://example.test/new','Revised',1);
 v:=public.student_assignment_page('ca200000-0000-4000-8000-000000000001',0,20);
 if v->'rows'->0->'submission'->>'revision'<>'2' or v->'rows'->0->'submission'->>'teacher_feedback' is not null then raise exception 'resubmit did not increment revision and clear feedback'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000001';
do $$ declare v jsonb; begin
 perform public.archive_group_assignment(current_setting('test.assignment_id')::uuid,1);
 perform public.archive_group_assignment(current_setting('test.assignment_id')::uuid,999);
 v:=public.teacher_assignment_page('ca200000-0000-4000-8000-000000000001',0,20);
 if v->>'total'<>'1' or v->'rows'->0->>'status'<>'archived' then raise exception 'archive failed or was not idempotent'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000002';
do $$ declare v text; begin
 if public.student_assignment_page('ca200000-0000-4000-8000-000000000001',0,20)->>'total'<>'1' then raise exception 'student lost archived submission history'; end if;
 begin perform public.submit_assignment_link(current_setting('test.assignment_id')::uuid,'https://example.test/archived','',2); raise exception 'archived assignment accepted resubmission'; exception when others then if sqlerrm='archived assignment accepted resubmission' then raise; end if; end;
end $$;
reset role;

update public.enrollments set status='removed' where id='ca300000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000002';
do $$ declare v text; begin
 if exists(select 1 from public.assignment_submissions where id=current_setting('test.submission_id')::uuid) then raise exception 'removed student can read private submission'; end if;
 begin perform public.student_assignment_page('ca200000-0000-4000-8000-000000000001',0,20); raise exception 'removed student can read assignments'; exception when others then if sqlerrm='removed student can read assignments' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000003';
do $$ declare v text; begin
 begin perform public.student_assignment_page('ca200000-0000-4000-8000-000000000001',0,20); raise exception 'peer group read allowed'; exception when others then if sqlerrm='peer group read allowed' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='ca000000-0000-4000-8000-000000000004';
do $$ declare v text; begin
 begin perform public.teacher_assignment_page('ca200000-0000-4000-8000-000000000001',0,20); raise exception 'admin read allowed'; exception when others then if sqlerrm='admin read allowed' then raise; end if; end;
end $$;
reset role;
rollback;
