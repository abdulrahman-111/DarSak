\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regprocedure('public.save_student_group(uuid)') is null
     or to_regprocedure('public.unsave_student_group(uuid)') is null
     or to_regprocedure('public.student_saved_group_page(integer,integer)') is null
     or not has_function_privilege('authenticated','public.save_student_group(uuid)','EXECUTE')
     or has_function_privilege('anon','public.save_student_group(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.save_student_group(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.student_saved_group_page(integer,integer)','EXECUTE')
     or has_table_privilege('authenticated','public.student_saved_groups','INSERT')
     or has_table_privilege('service_role','public.student_saved_groups','SELECT')
     or has_table_privilege('service_role','public.student_saved_groups','DELETE') then
    raise exception 'saved group grants are unsafe';
  end if;
end $$;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7d000000-0000-4000-8000-000000000001','authenticated','authenticated','saved-teacher@test.invalid','{"full_name":"Saved teacher","requested_role":"teacher"}'),
 ('7d000000-0000-4000-8000-000000000002','authenticated','authenticated','saved-student@test.invalid','{"full_name":"Saved student","requested_role":"student"}'),
 ('7d000000-0000-4000-8000-000000000003','authenticated','authenticated','saved-other@test.invalid','{"full_name":"Other student","requested_role":"student"}'),
 ('7d000000-0000-4000-8000-000000000004','authenticated','authenticated','saved-unapproved@test.invalid','{"full_name":"Unapproved","requested_role":"teacher"}'),
 ('7d000000-0000-4000-8000-000000000005','authenticated','authenticated','saved-admin@test.invalid','{"full_name":"Admin fixture","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='7d000000-0000-4000-8000-000000000001';
update public.profiles set role='admin' where id='7d000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7d100000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001',o.id,'Saved public group',5,'draft' from public.offerings o order by o.id limit 1;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values('7d200000-0000-4000-8000-000000000001','7d100000-0000-4000-8000-000000000001',1,'09:00','10:00');
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000001';
select public.publish_group('7d100000-0000-4000-8000-000000000001',null,null);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000002';
do $$ declare v_rows record; begin
  perform public.save_student_group('7d100000-0000-4000-8000-000000000001');
  perform public.save_student_group('7d100000-0000-4000-8000-000000000001');
  if (select count(*) from public.student_saved_groups where student_id=auth.uid())<>1 then raise exception 'save was not idempotent'; end if;
  select * into v_rows from public.student_saved_group_page(0,100);
  if v_rows.group_id<>'7d100000-0000-4000-8000-000000000001' or not v_rows.available or v_rows.group_name<>'Saved public group' then raise exception 'eligible save projection is incorrect'; end if;
  begin perform public.save_student_group('00000000-0000-4000-8000-000000000000'); raise exception 'missing group save succeeded'; exception when others then if sqlerrm='missing group save succeeded' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000003';
do $$ begin
  if (select count(*) from public.student_saved_groups)<>0 then raise exception 'foreign student read another shortlist'; end if;
  perform public.unsave_student_group('7d100000-0000-4000-8000-000000000001');
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000001';
do $$ begin
  begin perform public.save_student_group('7d100000-0000-4000-8000-000000000001'); raise exception 'teacher saved a student group'; exception when others then if sqlerrm='teacher saved a student group' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000005';
do $$ begin
  begin perform public.save_student_group('7d100000-0000-4000-8000-000000000001'); raise exception 'admin saved a student group'; exception when others then if sqlerrm='admin saved a student group' then raise; end if; end;
end $$;
reset role;
update public.groups set status='archived' where id='7d100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000002';
do $$ declare v_rows record; begin
  select * into v_rows from public.student_saved_group_page(0,20);
  if v_rows.available or v_rows.group_name is not null then raise exception 'unavailable saved group leaked its name'; end if;
  perform public.unsave_student_group('7d100000-0000-4000-8000-000000000001');
  if exists(select 1 from public.student_saved_groups where student_id=auth.uid()) then raise exception 'unavailable group could not be removed'; end if;
end $$;
reset role;
set local session_replication_role=replica;
update public.profiles set status='suspended' where id='7d000000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='7d000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.student_saved_groups)<>0 then raise exception 'suspended student retained direct shortlist access'; end if;
  begin perform public.unsave_student_group('7d100000-0000-4000-8000-000000000001'); raise exception 'suspended student unsaved a group'; exception when others then if sqlerrm='suspended student unsaved a group' then raise; end if; end;
end $$;
reset role;
rollback;
select 'student saved groups SQL assertions passed' as result;
