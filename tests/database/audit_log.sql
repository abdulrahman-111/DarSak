\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='dars_private' and c.relname='audit_log' and c.relrowsecurity)
     or has_table_privilege('anon','dars_private.audit_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated','dars_private.audit_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('service_role','dars_private.audit_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_sequence_privilege('service_role','dars_private.audit_log_id_seq','USAGE,SELECT,UPDATE')
     or has_function_privilege('service_role','dars_private.purge_audit_log()','EXECUTE') then
    raise exception 'audit log or purge ACL is unsafe';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='dars_private.audit_log'::regclass and tgname='audit_log_no_update_delete' and tgenabled='A')
     or not exists(select 1 from pg_trigger where tgrelid='dars_private.audit_log'::regclass and tgname='audit_log_no_truncate' and tgenabled='A') then
    raise exception 'audit immutability triggers are not ALWAYS enabled';
  end if;
end $$;

-- Missing auth/profile context from a trusted worker is retained as system.
insert into dars_private.account_deletion_requests(user_id,state)
values('7d900000-0000-4000-8000-000000000099','queued') returning id \gset deletion_
update dars_private.account_deletion_requests set state='completed' where id=:'deletion_id';
do $$ begin
  if not exists(select 1 from dars_private.audit_log where action='account_deletion_started' and target_id='7d900000-0000-4000-8000-000000000099' and actor_id is null and actor_role='system')
     or not exists(select 1 from dars_private.audit_log where action='account_deletion_completed' and target_id='7d900000-0000-4000-8000-000000000099' and actor_role='system') then
    raise exception 'worker actor fallback was not recorded as system';
  end if;
end $$;

insert into dars_private.audit_log(actor_role,action,target_type,metadata)
values('system','user_suspended','user','{"status":"suspended"}');
do $$
begin
  begin update dars_private.audit_log set metadata='{}' where action='user_suspended';
    raise exception 'audit row update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin delete from dars_private.audit_log where action='user_suspended';
    raise exception 'audit row delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin insert into dars_private.audit_log(actor_role,action,target_type,metadata) values('system','user_suspended','user','{"email":"x"}');
    raise exception 'private text metadata was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- More than the analytics count cap must still be removed in a single purge.
insert into dars_private.audit_log(at,actor_role,action,target_type,metadata)
select statement_timestamp()-interval '25 months','system','user_suspended','user','{"status":"suspended"}'::jsonb from generate_series(1,10005);
insert into dars_private.audit_log(at,actor_role,action,target_type,target_id,metadata)
values(statement_timestamp(),'system','user_reactivated','user','7d900000-0000-4000-8000-000000000098','{"status":"active"}');
do $$
begin
  begin
    perform dars_private.purge_audit_log();
    raise exception 'rollback retention subtransaction';
  exception when raise_exception then
    if sqlerrm<>'rollback retention subtransaction' then raise; end if;
  end;
end $$;
do $$ begin
  if (select count(*) from dars_private.audit_log where at < statement_timestamp()-interval '24 months')<10005
     or not exists(select 1 from pg_trigger where tgrelid='dars_private.audit_log'::regclass and tgname='audit_log_no_update_delete' and tgenabled='A') then
    raise exception 'failed retention transaction left rows deleted or trigger disabled';
  end if;
end $$;
select dars_private.purge_audit_log();
do $$
begin
  if exists(select 1 from dars_private.audit_log where at < statement_timestamp()-interval '24 months') then raise exception 'purge left expired rows behind'; end if;
  if not exists(select 1 from dars_private.audit_log where action='user_reactivated' and target_id='7d900000-0000-4000-8000-000000000098' and metadata->>'status'='active') then raise exception 'purge removed a specific recent row'; end if;
  if not exists(select 1 from dars_private.audit_log where action='audit_purged' and (metadata->>'deleted_count')::bigint>=10005) then raise exception 'purge did not record deleted row count'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='dars_private.audit_log'::regclass and tgname='audit_log_no_update_delete' and tgenabled='A') then raise exception 'purge failed to restore the ALWAYS trigger'; end if;
end $$;
do $$ begin
  begin truncate dars_private.audit_log; raise exception 'owner truncate guard was bypassed';
  exception when sqlstate '55000' then null; end;
end $$;
rollback;
