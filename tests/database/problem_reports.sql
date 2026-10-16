\set ON_ERROR_STOP on
begin;

do $$
begin
  if not has_function_privilege('authenticated', 'public.submit_problem_report(text,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_problem_report_page(text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.submit_problem_report(text,text,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.admin_problem_report_page(text,integer,integer)', 'EXECUTE') then
    raise exception 'problem report RPC grants are unsafe';
  end if;
  if has_table_privilege('authenticated', 'public.reports', 'INSERT')
     or has_column_privilege('authenticated', 'public.reports', 'admin_note', 'SELECT')
     or has_column_privilege('authenticated', 'public.reports', 'reporter_id', 'INSERT')
     or not has_column_privilege('authenticated', 'public.reports', 'status', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.reports', 'admin_note', 'UPDATE') then
    raise exception 'reports column grants expose private data or block admin updates';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7e000000-0000-4000-8000-000000000001','authenticated','authenticated','reports-student@test.invalid','{"full_name":"Report Student","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000002','authenticated','authenticated','reports-teacher@test.invalid','{"full_name":"Report Teacher","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000003','authenticated','authenticated','reports-admin@test.invalid','{"full_name":"Report Admin","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000004','authenticated','authenticated','reports-suspended@test.invalid','{"full_name":"Report Suspended","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000005','authenticated','authenticated','reports-other@test.invalid','{"full_name":"Report Other","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='7e000000-0000-4000-8000-000000000003';
update public.profiles set status='suspended' where id='7e000000-0000-4000-8000-000000000004';
set local session_replication_role=origin;

-- Student reports can be submitted through the RPC and are idempotent within 60s.
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$
declare v_first uuid; v_retry uuid;
begin
  v_first := public.submit_problem_report('Broken save', 'Saving a lesson shows an error.', '/en/lessons/42');
  v_retry := public.submit_problem_report('Broken save', 'Saving a lesson shows an error.', '/en/lessons/42');
  if v_first <> v_retry then raise exception 'identical retry did not reuse report id'; end if;

  begin perform public.submit_problem_report('Bad path', 'This description is long enough.', '/en/page?token=secret');
    raise exception 'query string was accepted as a page path';
  exception when invalid_parameter_value then null; end;
  begin perform public.submit_problem_report('External page', 'This description is long enough.', 'https://evil.test/path');
    raise exception 'external URL was accepted as a page path';
  exception when invalid_parameter_value then null; end;

  begin
    insert into public.reports(reporter_id,subject,description,status,admin_note)
    values(auth.uid(),'Injected status','Injected description','resolved','secret');
    raise exception 'direct reporter insert succeeded';
  exception when insufficient_privilege then null; end;

  if (select count(*) from public.reports where reporter_id <> auth.uid()) <> 0 then
    raise exception 'reporter can read another account reports';
  end if;
  begin perform admin_note from public.reports where id=v_first;
    raise exception 'reporter can read admin_note';
  exception when insufficient_privilege then null; end;

  perform public.submit_problem_report('Second report', 'Description that passes the minimum.', '');
  perform public.submit_problem_report('Third report', 'Description that passes the minimum.', '');
  perform public.submit_problem_report('Fourth report', 'Description that passes the minimum.', '');
  perform public.submit_problem_report('Fifth report', 'Description that passes the minimum.', '');
  begin perform public.submit_problem_report('Sixth report', 'Description that passes the minimum.', '');
    raise exception 'hourly report cap was not enforced';
  exception when sqlstate 'PT429' then null;
  end;
end $$;
reset role;

-- A second active role can report even without teaching access; suspended users cannot.
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000002';
select public.submit_problem_report('Teacher issue','Pending teacher can send a report.','/en/teacher');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000004';
do $$ begin
  begin perform public.submit_problem_report('Suspended issue','This should never be stored.','');
    raise exception 'suspended account submitted a report';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Admins retain the existing status/note update flow and get private reporter context via RPC.
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000003';
do $$
declare v_id uuid; v_page jsonb; v_empty_page jsonb;
begin
  v_id := public.submit_problem_report('Admin issue','Admin reports are also accepted here.','/en/admin');
  update public.reports set status='resolved', admin_note='Internal follow-up only.' where id=v_id returning id into v_id;
  if v_id is null then raise exception 'existing admin status/note update flow failed'; end if;
  v_page := public.admin_problem_report_page('resolved',0,20);
  if (v_page->>'total')::integer < 1
     or not (v_page->'rows' @> jsonb_build_array(jsonb_build_object(
       'id',v_id,'reporter_name','Report Admin','reporter_role','admin','admin_note','Internal follow-up only.')))
     or jsonb_array_length(v_page->'rows') = 0 then
    raise exception 'admin report RPC did not return reporter context and internal note';
  end if;
  v_page := public.admin_problem_report_page('open',0,20);
  v_empty_page := public.admin_problem_report_page('open',999,20);
  if v_page->>'total' is null or v_empty_page->>'total' <> v_page->>'total'
     or jsonb_array_length(v_empty_page->'rows') <> 0 then
    raise exception 'admin pagination omitted exact count for an empty page';
  end if;
  begin perform public.admin_problem_report_page('secret',0,20);
    raise exception 'invalid admin status accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.admin_problem_report_page('all',0,21);
    raise exception 'unbounded page size accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- Ordinary authenticated accounts cannot call the privileged admin RPC.
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000005';
do $$ begin
  begin perform public.admin_problem_report_page('all',0,20);
    raise exception 'non-admin account read admin reports';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform public.submit_problem_report('Anonymous','Anonymous description is long enough.','');
    raise exception 'anonymous account invoked report RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
