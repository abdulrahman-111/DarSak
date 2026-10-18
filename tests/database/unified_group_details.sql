\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('84000000-0000-4000-8000-000000000001','authenticated','authenticated','unified-owner@test.invalid','{"requested_role":"teacher","full_name":"Unified owner"}'),
 ('84000000-0000-4000-8000-000000000002','authenticated','authenticated','unified-other@test.invalid','{"requested_role":"teacher","full_name":"Other teacher"}'),
 ('84000000-0000-4000-8000-000000000003','authenticated','authenticated','unified-student@test.invalid','{"requested_role":"student","full_name":"Student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in ('84000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002');
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000001';
do $$ declare gid uuid; base_version timestamptz; learning_version timestamptz; before_count int; offering_count int;
begin
 gid:=public.save_teacher_group_details(null,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Unified Physics','Description',10,'Cairo',null,
 '{"outcomes":"Build useful skills","prerequisites":"None","delivery_mode":"hybrid","fee_egp":150,"fee_basis":"month","fee_includes":"Practice"}',null);
 if not exists(select 1 from public.groups where id=gid and name='Unified Physics' and status='draft')
 or not exists(select 1 from public.group_learning_details where group_id=gid and fee_egp=150 and outcomes='Build useful skills') then raise exception 'unified create lost details'; end if;
 select updated_at into base_version from public.groups where id=gid;
 select updated_at into learning_version from public.group_learning_details where group_id=gid;
 begin
  perform public.save_teacher_group_details(gid,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Must rollback','',10,'',base_version,'{}',learning_version-interval '1 day');
  raise exception 'stale learning version accepted';
 exception when serialization_failure then null; end;
 if not exists(select 1 from public.groups where id=gid and name='Unified Physics' and updated_at=base_version) then raise exception 'stale learning save partially saved basics'; end if;
 begin
  perform public.save_teacher_group_details(gid,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Must rollback','',10,'',base_version-interval '1 day','{}',learning_version);
  raise exception 'stale base version accepted';
 exception when serialization_failure then null; end;
 if not exists(select 1 from public.group_learning_details where group_id=gid and updated_at=learning_version and fee_egp=150) then raise exception 'stale base save changed learning'; end if;
 select count(*) into before_count from public.groups where teacher_id=auth.uid();
 select count(*) into offering_count from public.offerings where owner_teacher_id=auth.uid();
 begin
  perform public.save_teacher_group_details(null,'00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000021','Invalid fee','',10,'',null,'{"fee_egp":100}',null);
  raise exception 'invalid fee pair accepted';
 exception when check_violation then null; end;
 if before_count<>(select count(*) from public.groups where teacher_id=auth.uid()) or offering_count<>(select count(*) from public.offerings where owner_teacher_id=auth.uid()) then raise exception 'failed create left a group or catalogue pairing'; end if;
 begin
  perform public.save_teacher_group_details(null,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Invalid precision','',10,'',null,'{"fee_egp":100.123,"fee_basis":"month"}',null);
  raise exception 'invalid precision accepted';
 exception when invalid_parameter_value then null; end;
 perform set_config('test.unified_gid',gid::text,true);
 perform set_config('test.unified_base_version',base_version::text,true);
 perform set_config('test.unified_learning_version',learning_version::text,true);
end $$;
reset role;
-- Verify the same combined save can edit a published group without changing status.
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time)
values(current_setting('test.unified_gid')::uuid,1,'09:00','10:00');
set local session_replication_role=replica;
update public.groups set status='published' where id=current_setting('test.unified_gid')::uuid;
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000001';
do $$ declare gid uuid:=current_setting('test.unified_gid')::uuid;
begin
 perform public.save_teacher_group_details(gid,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Published unified','',10,'',
  (select updated_at from public.groups where id=gid),'{}',current_setting('test.unified_learning_version')::timestamptz);
 if not exists(select 1 from public.groups where id=gid and status='published' and name='Published unified')
 or not exists(select 1 from public.group_learning_details where group_id=gid and outcomes='' and fee_egp is null) then raise exception 'published blank optional save failed'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000002';
do $$ begin
 begin
  perform public.save_teacher_group_details(current_setting('test.unified_gid')::uuid,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Foreign','',10,'',now(),'{}',null);
  raise exception 'foreign teacher accepted';
 exception when others then if sqlerrm='foreign teacher accepted' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000003';
do $$ begin
 begin
  perform public.save_teacher_group_details(null,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Student','',10,'',null,'{}',null);
  raise exception 'student accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.save_teacher_group_details(uuid,uuid,uuid,text,text,integer,text,timestamptz,jsonb,timestamptz)','execute')
 or (select prosecdef from pg_proc where oid='public.save_teacher_group_details(uuid,uuid,uuid,text,text,integer,text,timestamptz,jsonb,timestamptz)'::regprocedure) then raise exception 'wrapper grants or privilege escalation'; end if;
end $$;
-- Both component functions still enforce owner approval and archived status.
set local session_replication_role=replica;
update public.groups set status='archived' where id=current_setting('test.unified_gid')::uuid;
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000001';
do $$ begin
 begin
  perform public.save_teacher_group_details(current_setting('test.unified_gid')::uuid,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Archived','',10,'',now(),'{}',null);
  raise exception 'archived group accepted';
 exception when others then if sqlerrm='archived group accepted' then raise; end if; end;
end $$;
reset role;
set local session_replication_role=replica;
update public.teacher_profiles set approved=false where id='84000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='84000000-0000-4000-8000-000000000001';
do $$ declare old_count int;
begin
 select count(*) into old_count from public.groups where teacher_id=auth.uid();
 begin
  perform public.save_teacher_group_details(null,'00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000021','Unapproved','',10,'',null,'{}',null);
  raise exception 'unapproved teacher accepted';
 exception when insufficient_privilege then null; end;
 if old_count<>(select count(*) from public.groups where teacher_id=auth.uid()) then raise exception 'unapproved save left partial group'; end if;
end $$;
reset role;
select 'unified group details regression passed';
rollback;
