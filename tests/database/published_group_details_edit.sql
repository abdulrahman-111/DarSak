\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamptz)') is null then
    raise exception 'group details RPC is missing';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('83000000-0000-4000-8000-000000000001','authenticated','authenticated','published-edit-owner@test.invalid','{"full_name":"Edit owner","requested_role":"teacher"}'),
 ('83000000-0000-4000-8000-000000000002','authenticated','authenticated','published-edit-other@test.invalid','{"full_name":"Other owner","requested_role":"teacher"}'),
 ('83000000-0000-4000-8000-000000000003','authenticated','authenticated','published-edit-student@test.invalid','{"full_name":"Accepted student","requested_role":"student"}'),
 ('83000000-0000-4000-8000-000000000004','authenticated','authenticated','published-edit-student2@test.invalid','{"full_name":"Accepted student 2","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002');
set local session_replication_role=origin;

insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values
 ('83100000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','رياضيات','Math','83100000-0000-4000-8000-000000000001'),
 ('83100000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','فيزياء','Physics','83100000-0000-4000-8000-000000000002');
insert into public.education_nodes(id,kind,name_ar,name_en,slug,owner_teacher_id) values
 ('83200000-0000-4000-8000-000000000001','student_category','الصف الأول','Grade 1','83200000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001'),
 ('83200000-0000-4000-8000-000000000002','student_category','الصف الثاني','Grade 2','83200000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002');
insert into public.offerings(id,node_id,subject_id,owner_teacher_id) values
 ('83300000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','83100000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001'),
 ('83300000-0000-4000-8000-000000000002','83200000-0000-4000-8000-000000000002','83100000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002');
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,location,status)
values ('83400000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','83300000-0000-4000-8000-000000000001','Published before','Old description',4,'Old room','draft');
set local session_replication_role=replica;
update public.groups set status='published' where id='83400000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
values ('83500000-0000-4000-8000-000000000001','83400000-0000-4000-8000-000000000001',1,'09:00','10:00');
insert into public.enrollments(id,group_id,student_id,status) values
 ('83600000-0000-4000-8000-000000000001','83400000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003','accepted'),
 ('83600000-0000-4000-8000-000000000002','83400000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000004','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values ('83700000-0000-4000-8000-000000000001','83400000-0000-4000-8000-000000000001','Existing lesson','2099-01-01 09:00+00','2099-01-01 10:00+00','scheduled');

set local role authenticated;
set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000001';
do $$ declare v_updated timestamptz; v_saved uuid;
begin
 select updated_at into v_updated from public.groups where id='83400000-0000-4000-8000-000000000001';
 v_saved:=public.save_teacher_group_draft('83400000-0000-4000-8000-000000000001','83100000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','Published Arabic name','Edited description',3,'New room',v_updated);
 if v_saved<>'83400000-0000-4000-8000-000000000001'
    or not exists(select 1 from public.groups where id=v_saved and status='published' and name='Published Arabic name' and capacity=3 and location='New room')
    or (select count(*) from public.enrollments where group_id=v_saved and status='accepted')<>2
    or not exists(select 1 from public.lessons where group_id=v_saved and id='83700000-0000-4000-8000-000000000001')
    or not exists(select 1 from public.group_schedule_slots where group_id=v_saved and id='83500000-0000-4000-8000-000000000001') then
   raise exception 'published edit changed publication, membership, schedule, or lesson state';
 end if;
 begin
   perform public.save_teacher_group_draft(v_saved,'83100000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','Too small','',1,'',
     (select updated_at from public.groups where id=v_saved));
   raise exception 'capacity below accepted membership was accepted';
 exception when others then if sqlerrm='capacity below accepted membership was accepted' then raise; end if; end;
 begin
   perform public.save_teacher_group_draft(v_saved,'83100000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','Stale','',4,'',v_updated);
   raise exception 'stale published edit was accepted';
 exception when sqlstate '40001' then null; end;
 begin
   perform public.save_teacher_group_draft(v_saved,'83100000-0000-4000-8000-000000000002','83200000-0000-4000-8000-000000000002','Foreign catalogue','',4,'',
     (select updated_at from public.groups where id=v_saved));
   raise exception 'foreign private catalogue selection was accepted';
 exception when others then if sqlerrm='foreign private catalogue selection was accepted' then raise; end if; end;
 perform set_config('test.current_group_updated_at',(select updated_at::text from public.groups where id=v_saved),true);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000002';
do $$ begin
 begin perform public.save_teacher_group_draft('83400000-0000-4000-8000-000000000001','83100000-0000-4000-8000-000000000002','83200000-0000-4000-8000-000000000002','Foreign edit','',4,'',
   current_setting('test.current_group_updated_at')::timestamptz);
   raise exception 'foreign teacher edit was accepted';
 exception when others then if sqlerrm='foreign teacher edit was accepted' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000003';
do $$ begin
 begin perform public.save_teacher_group_draft('83400000-0000-4000-8000-000000000001','83100000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','Student edit','',4,'',
   (select updated_at from public.groups where id='83400000-0000-4000-8000-000000000001'));
   raise exception 'student edit was accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='83000000-0000-4000-8000-000000000001';
reset role;
set local session_replication_role=replica;
update public.groups set status='archived' where id='83400000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
do $$ begin
 begin perform public.save_teacher_group_draft('83400000-0000-4000-8000-000000000001','83100000-0000-4000-8000-000000000001','83200000-0000-4000-8000-000000000001','Archived edit','',4,'',
   (select updated_at from public.groups where id='83400000-0000-4000-8000-000000000001'));
   raise exception 'archived group edit was accepted';
 exception when others then if sqlerrm='archived group edit was accepted' then raise; end if; end;
end $$;
reset role;
rollback;
