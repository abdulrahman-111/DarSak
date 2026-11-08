create extension if not exists pgtap;
begin;
select plan(13);

select has_table('dars_private','audit_log','private audit ledger exists');
select ok(not has_table_privilege('anon','dars_private.audit_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'anon has no ledger privileges');
select ok(not has_table_privilege('authenticated','dars_private.audit_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated has no ledger privileges');
select ok(not has_table_privilege('service_role','dars_private.audit_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'service role has no ledger privileges');
select ok(not has_sequence_privilege('service_role','dars_private.audit_log_id_seq','USAGE,SELECT,UPDATE'), 'service role has no identity sequence privileges');
select ok(not has_function_privilege('service_role','dars_private.write_audit(text,text,uuid,uuid,jsonb)','EXECUTE'), 'service role cannot invoke the writer');
select is((select count(*)::integer from pg_trigger where tgrelid='dars_private.audit_log'::regclass and tgname in ('audit_log_no_update_delete','audit_log_no_truncate') and tgenabled='A'),2,'immutable guards are always enabled');
select ok((select p.provolatile='i' and p.proconfig[1] like 'search_path=pg_catalog%dars_private%' from pg_proc p where p.oid='dars_private.audit_metadata_valid(text,jsonb)'::regprocedure)
  and exists(select 1 from pg_constraint where conrelid='dars_private.audit_log'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%audit_metadata_valid%'), 'exact metadata validator is immutable and called by a table CHECK');

insert into dars_private.audit_log(actor_role,action,target_type,metadata)
values('system','user_suspended','user','{"status":"suspended"}');
select is((select metadata->>'status' from dars_private.audit_log where action='user_suspended' limit 1),'suspended','bounded metadata is retained');
select throws_ok($$insert into dars_private.audit_log(actor_role,action,target_type,metadata) values('system','user_suspended','user','{"email":"private"}')$$,'23514',null,'free-form metadata is rejected by the table CHECK');
select is(dars_private.audit_metadata_valid('admin_revoked','{"role":null}'),false,'null role metadata is a definite rejection');
select throws_ok($$insert into dars_private.audit_log(actor_role,action,target_type,metadata) values('system','admin_revoked','user','{"role":null}')$$,'23514',null,'null role metadata is rejected by table CHECK');
select is(dars_private.audit_metadata_valid('user_suspended','{"status":null}'),false,'null status metadata is a definite rejection');
select * from finish();
rollback;
