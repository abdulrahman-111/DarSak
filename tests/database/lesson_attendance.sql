\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regclass('public.lesson_attendance') is null
     or not has_table_privilege('authenticated','public.lesson_attendance','SELECT')
     or has_table_privilege('authenticated','public.lesson_attendance','INSERT')
     or has_table_privilege('authenticated','public.lesson_attendance','UPDATE')
     or has_table_privilege('authenticated','public.lesson_attendance','DELETE')
     or has_table_privilege('anon','public.lesson_attendance','SELECT')
     or has_table_privilege('service_role','public.lesson_attendance','SELECT') then
    raise exception 'attendance table grants are unsafe';
  end if;
  if not has_function_privilege('authenticated','public.set_lesson_attendance(uuid,uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.set_lesson_attendance(uuid,uuid,text)','EXECUTE')
     or has_function_privilege('service_role','public.set_lesson_attendance(uuid,uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.teacher_lesson_attendance_page(uuid,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.teacher_lesson_attendance_page(uuid,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.teacher_lesson_attendance_page(uuid,integer,integer)','EXECUTE') then
    raise exception 'attendance RPC grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7f000000-0000-4000-8000-000000000001','authenticated','authenticated','attendance-owner@test.invalid','{"full_name":"Attendance Owner","requested_role":"teacher"}'),
 ('7f000000-0000-4000-8000-000000000002','authenticated','authenticated','attendance-foreign@test.invalid','{"full_name":"Attendance Foreign","requested_role":"teacher"}'),
 ('7f000000-0000-4000-8000-000000000003','authenticated','authenticated','attendance-student@test.invalid','{"full_name":"Attendance Student","requested_role":"student"}'),
 ('7f000000-0000-4000-8000-000000000004','authenticated','authenticated','attendance-pending@test.invalid','{"full_name":"Attendance Pending","requested_role":"student"}'),
 ('7f000000-0000-4000-8000-000000000005','authenticated','authenticated','attendance-admin@test.invalid','{"full_name":"Attendance Admin","requested_role":"student"}'),
 ('7f000000-0000-4000-8000-000000000006','authenticated','authenticated','attendance-unapproved@test.invalid','{"full_name":"Attendance Unapproved","requested_role":"teacher"}'),
 ('7f000000-0000-4000-8000-000000000007','authenticated','authenticated','attendance-student-other@test.invalid','{"full_name":"Attendance Other Student","requested_role":"student"}');

set local session_replication_role=replica;
update public.profiles set role='admin' where id='7f000000-0000-4000-8000-000000000005';
update public.teacher_profiles set approved=true where id='7f000000-0000-4000-8000-000000000001';
update public.teacher_profiles set approved=false where id='7f000000-0000-4000-8000-000000000006';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f100000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001',o.id,'Attendance owner group',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f100000-0000-4000-8000-000000000002','7f000000-0000-4000-8000-000000000002',o.id,'Attendance foreign group',10,'draft' from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f100000-0000-4000-8000-000000000003','7f000000-0000-4000-8000-000000000001',o.id,'Attendance archived group',10,'archived' from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7f100000-0000-4000-8000-000000000004','7f000000-0000-4000-8000-000000000006',o.id,'Attendance unapproved group',10,'archived' from public.offerings o order by o.id limit 1;
insert into public.enrollments(group_id,student_id,status) values
 ('7f100000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','accepted'),
 ('7f100000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000007','accepted'),
 ('7f100000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000004','pending'),
 ('7f100000-0000-4000-8000-000000000002','7f000000-0000-4000-8000-000000000003','accepted'),
 ('7f100000-0000-4000-8000-000000000003','7f000000-0000-4000-8000-000000000003','accepted'),
 ('7f100000-0000-4000-8000-000000000004','7f000000-0000-4000-8000-000000000003','accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('7f200000-0000-4000-8000-000000000001','7f100000-0000-4000-8000-000000000001','Attendance started',now()-interval '1 hour',now()+interval '1 hour','scheduled'),
 ('7f200000-0000-4000-8000-000000000002','7f100000-0000-4000-8000-000000000001','Attendance future',now()+interval '1 day',now()+interval '2 days','scheduled'),
 ('7f200000-0000-4000-8000-000000000003','7f100000-0000-4000-8000-000000000001','Attendance cancelled',now()-interval '1 hour',now()+interval '1 hour','cancelled'),
 ('7f200000-0000-4000-8000-000000000004','7f100000-0000-4000-8000-000000000003','Attendance archived',now()-interval '1 hour',now()+interval '1 hour','scheduled'),
 ('7f200000-0000-4000-8000-000000000005','7f100000-0000-4000-8000-000000000002','Attendance foreign',now()-interval '1 hour',now()+interval '1 hour','scheduled'),
 ('7f200000-0000-4000-8000-000000000006','7f100000-0000-4000-8000-000000000004','Attendance unapproved',now()-interval '1 hour',now()+interval '1 hour','scheduled');

set local role authenticated;
set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000001';
select public.set_lesson_attendance('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','present');
do $$ begin
  if not exists(select 1 from public.lesson_attendance where lesson_id='7f200000-0000-4000-8000-000000000001' and student_id='7f000000-0000-4000-8000-000000000003' and status='present' and recorded_by='7f000000-0000-4000-8000-000000000001' and recorded_at is not null) then raise exception 'attendance identity/time/status was not recorded'; end if;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000004','absent'); raise exception 'pending member was marked'; exception when sqlstate '22023' then null; end;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000003','7f000000-0000-4000-8000-000000000003','absent'); raise exception 'cancelled lesson was marked'; exception when sqlstate '22023' then null; end;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000002','7f000000-0000-4000-8000-000000000003','absent'); raise exception 'future lesson was marked'; exception when sqlstate '22023' then null; end;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000004','7f000000-0000-4000-8000-000000000003','absent'); raise exception 'archived group was marked'; exception when sqlstate '22023' then null; end;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000005','7f000000-0000-4000-8000-000000000003','absent'); raise exception 'foreign owner wrote attendance'; exception when insufficient_privilege then null; end;
  begin insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','absent','7f000000-0000-4000-8000-000000000001'); raise exception 'raw authenticated write succeeded'; exception when insufficient_privilege then null; end;
  if public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000001',0,20)->>'total'<>'2' then raise exception 'attendance page included a pending student or lost accepted roster'; end if;
  if public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000001',0,1)->'rows'->0->>'full_name'<>'Attendance Other Student'
     or public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000001',1,1)->'rows'->0->>'full_name'<>'Attendance Student' then raise exception 'attendance pages are not stably ordered'; end if;
  begin perform public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000001',1000001,20); raise exception 'unsafe offset was accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000001',0,21); raise exception 'oversized page was accepted'; exception when sqlstate '22023' then null; end;
  perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003',null);
  if exists(select 1 from public.lesson_attendance where lesson_id='7f200000-0000-4000-8000-000000000001') then raise exception 'clear did not remove the attendance mark'; end if;
  perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','present');
  perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000007','absent');
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000003';
do $$ begin
  if (select count(*) from public.lesson_attendance where lesson_id='7f200000-0000-4000-8000-000000000001')<>1
     or not exists(select 1 from public.lesson_attendance where lesson_id='7f200000-0000-4000-8000-000000000001' and student_id=auth.uid() and status='present') then raise exception 'student did not see only their own attendance result'; end if;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000003','present'); raise exception 'student wrote attendance'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000006';
do $$ begin
  if (public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000006')->>'total')::integer<>1 then raise exception 'unapproved active owner could not read history'; end if;
  begin perform public.set_lesson_attendance('7f200000-0000-4000-8000-000000000006','7f000000-0000-4000-8000-000000000003','present'); raise exception 'unapproved owner wrote attendance'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7f000000-0000-4000-8000-000000000005';
do $$ begin
  if (public.teacher_lesson_attendance_page('7f200000-0000-4000-8000-000000000001')->>'total')::integer<>1 then raise exception 'admin could not read lesson attendance history'; end if;
end $$;
reset role;

rollback;
