\set ON_ERROR_STOP on
begin;

-- This cohort is deliberately isolated from the shared fixture users. The fixture
-- rolls back every row, including the attendance and overview-parity data below.
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('86a00000-0000-4000-8000-000000000001','authenticated','authenticated','page-owner-86a@test.invalid','{"requested_role":"teacher","full_name":"Page owner"}'),
 ('86a00000-0000-4000-8000-000000000002','authenticated','authenticated','page-student-86a@test.invalid','{"requested_role":"student","full_name":"Page student"}'),
 ('86a00000-0000-4000-8000-000000000003','authenticated','authenticated','page-outsider-86a@test.invalid','{"requested_role":"student","full_name":"Page outsider"}'),
 ('86a00000-0000-4000-8000-000000000004','authenticated','authenticated','page-pending-86a@test.invalid','{"requested_role":"student","full_name":"Page pending"}'),
 ('86a00000-0000-4000-8000-000000000005','authenticated','authenticated','page-rejected-86a@test.invalid','{"requested_role":"student","full_name":"Page rejected"}'),
 ('86a00000-0000-4000-8000-000000000006','authenticated','authenticated','page-suspended-86a@test.invalid','{"requested_role":"student","full_name":"Page suspended"}'),
 ('86a00000-0000-4000-8000-000000000007','authenticated','authenticated','page-other-student-86a@test.invalid','{"requested_role":"student","full_name":"Other student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='86a00000-0000-4000-8000-000000000001';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status)
select '86a10000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000001',id,'Page reads','Description',10,'draft' from public.offerings order by id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status)
select '86a10000-0000-4000-8000-000000000002','86a00000-0000-4000-8000-000000000001',id,'Other class','Separate membership',10,'draft' from public.offerings order by id limit 1;
insert into public.enrollments(group_id,student_id,status) values
 ('86a10000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000002','accepted'),
 ('86a10000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000004','pending'),
 ('86a10000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000005','rejected'),
 ('86a10000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000006','accepted'),
 ('86a10000-0000-4000-8000-000000000002','86a00000-0000-4000-8000-000000000003','accepted'),
 ('86a10000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000007','accepted');

-- 22 history lessons: 20 unique times followed by an older ID-ordered tie.
insert into public.lessons(id,group_id,title,starts_at,ends_at,status,notes)
select ('86a20000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       '86a10000-0000-4000-8000-000000000001', 'History '||lpad(i::text,2,'0'),
       timestamptz '2027-01-02 00:00+00' + i * interval '1 hour',
       timestamptz '2027-01-02 00:30+00' + i * interval '1 hour', 'completed', 'history note '||i
from generate_series(1,20) i;
insert into public.lessons(id,group_id,title,starts_at,ends_at,status,notes) values
 ('86a20000-0000-4000-8000-000000000030','86a10000-0000-4000-8000-000000000001','Older tied A','2027-01-01 10:00+00','2027-01-01 11:00+00','completed','Tie A'),
 ('86a20000-0000-4000-8000-000000000031','86a10000-0000-4000-8000-000000000001','Older tied B','2027-01-01 10:00+00','2027-01-01 11:00+00','completed','Tie B'),
 -- The ends_at equality is included in the upcoming page but excluded from next.
 ('86a20000-0000-4000-8000-000000000099','86a10000-0000-4000-8000-000000000001','Boundary','2027-01-14 23:00+00','2027-01-15 00:00+00','scheduled','Ends exactly at p_now'),
 -- Same earliest starts_at: ID is the deterministic secondary order for both the
 -- upcoming page and the overview's next scheduled lesson.
 ('86a20000-0000-4000-8000-000000000100','86a10000-0000-4000-8000-000000000001','Upcoming tie A','2027-01-15 01:00+00','2027-01-15 02:00+00','scheduled','Upcoming tie A');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status,notes)
select ('86a20000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,
       '86a10000-0000-4000-8000-000000000001', 'Upcoming '||lpad(i::text,2,'0'),
       timestamptz '2027-01-15 00:00+00' + i * interval '1 hour',
       timestamptz '2027-01-15 00:30+00' + i * interval '1 hour', 'scheduled', 'upcoming note '||i
from generate_series(1,21) i;

-- Populate the legacy overview fields; disabling only fixture side-effect triggers
-- keeps this transaction self-contained while still exercising RPC reads.
set local session_replication_role=replica;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time,timezone) values
 ('86a30000-0000-4000-8000-000000000002','86a10000-0000-4000-8000-000000000001',2,'11:00','12:00','Africa/Cairo'),
 ('86a30000-0000-4000-8000-000000000001','86a10000-0000-4000-8000-000000000001',2,'09:00','10:00','Africa/Cairo'),
 ('86a30000-0000-4000-8000-000000000003','86a10000-0000-4000-8000-000000000001',4,'09:00','10:00','Africa/Cairo');
insert into public.group_pinned_announcements(group_id,body,edited_at)
values('86a10000-0000-4000-8000-000000000001','Pinned parity body','2027-01-10 12:00+00');
insert into public.lesson_attendance(lesson_id,student_id,status,recorded_by) values
 ('86a20000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000002','present','86a00000-0000-4000-8000-000000000001'),
 ('86a20000-0000-4000-8000-000000000001','86a00000-0000-4000-8000-000000000007','late','86a00000-0000-4000-8000-000000000001'),
 ('86a20000-0000-4000-8000-000000000030','86a00000-0000-4000-8000-000000000002','excused','86a00000-0000-4000-8000-000000000001');
update public.groups set status='archived' where id='86a10000-0000-4000-8000-000000000001';
update public.profiles set status='suspended' where id='86a00000-0000-4000-8000-000000000006';
set local session_replication_role=origin;

-- Prove the second student's attendance fixture is real, so the ownership check
-- below cannot pass vacuously on an empty attendance set.
do $$ begin
 if not exists(select 1 from public.lesson_attendance where lesson_id='86a20000-0000-4000-8000-000000000001' and student_id='86a00000-0000-4000-8000-000000000007' and status='late') then
   raise exception 'other-student attendance fixture missing';
 end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub='86a00000-0000-4000-8000-000000000002';
do $$ declare r jsonb; o jsonb; detail jsonb; ids jsonb;
begin
 detail:=public.student_class_detail('86a10000-0000-4000-8000-000000000001');
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',true,1,'2027-01-15 00:00+00');
 if r->'group' is distinct from detail or r->>'page'<>'1' or r->>'total'<>'22' or jsonb_array_length(r->'lessons')<>20 then raise exception 'history page 1 projection mismatch: %',r; end if;
 select jsonb_agg(x->'id' order by ord) into ids from jsonb_array_elements(r->'lessons') with ordinality as e(x,ord);
 if ids is distinct from (select jsonb_agg(('86a20000-0000-4000-8000-'||lpad(i::text,12,'0'))::text order by i desc) from generate_series(1,20) i) then raise exception 'history page 1 IDs/order mismatch: %',ids; end if;
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',true,2,'2027-01-15 00:00+00');
 if r->>'page'<>'2' or r->>'total'<>'22' or r->'lessons'->0->>'id'<>'86a20000-0000-4000-8000-000000000030' or r->'lessons'->1->>'id'<>'86a20000-0000-4000-8000-000000000031' then raise exception 'history tie page/order mismatch: %',r; end if;
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',true,50001,'2027-01-15 00:00+00');
 if r->>'page'<>'2' or r->>'total'<>'22' or jsonb_array_length(r->'lessons')<>2 then raise exception 'history beyond-end clamp mismatch: %',r; end if;

 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00');
 if r->'group' is distinct from detail or r->>'page'<>'1' or r->>'total'<>'23' or jsonb_array_length(r->'lessons')<>20 then raise exception 'upcoming page 1 projection mismatch: %',r; end if;
 if r->'lessons'->0->>'id'<>'86a20000-0000-4000-8000-000000000099' or r->'lessons'->0->>'notes'<>'Ends exactly at p_now' then raise exception 'ends_at equality was not included in upcoming history/page filter'; end if;
 select jsonb_agg(x->'id' order by ord) into ids from jsonb_array_elements(r->'lessons') with ordinality as e(x,ord);
 if ids is distinct from jsonb_build_array(
   '86a20000-0000-4000-8000-000000000099',
   '86a20000-0000-4000-8000-000000000100',
   '86a20000-0000-4000-8000-000000000101',
   '86a20000-0000-4000-8000-000000000102',
   '86a20000-0000-4000-8000-000000000103',
   '86a20000-0000-4000-8000-000000000104',
   '86a20000-0000-4000-8000-000000000105',
   '86a20000-0000-4000-8000-000000000106',
   '86a20000-0000-4000-8000-000000000107',
   '86a20000-0000-4000-8000-000000000108',
   '86a20000-0000-4000-8000-000000000109',
   '86a20000-0000-4000-8000-000000000110',
   '86a20000-0000-4000-8000-000000000111',
   '86a20000-0000-4000-8000-000000000112',
   '86a20000-0000-4000-8000-000000000113',
   '86a20000-0000-4000-8000-000000000114',
   '86a20000-0000-4000-8000-000000000115',
   '86a20000-0000-4000-8000-000000000116',
   '86a20000-0000-4000-8000-000000000117',
   '86a20000-0000-4000-8000-000000000118') then raise exception 'upcoming page 1 IDs/order mismatch: %',ids; end if;
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,2,'2027-01-15 00:00+00');
 if r->>'page'<>'2' or r->>'total'<>'23' or r->'lessons'->0->>'id'<>'86a20000-0000-4000-8000-000000000119' or r->'lessons'->1->>'id'<>'86a20000-0000-4000-8000-000000000120' or r->'lessons'->2->>'id'<>'86a20000-0000-4000-8000-000000000121' then raise exception 'upcoming page 2 order mismatch: %',r; end if;
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,50001,'2027-01-15 00:00+00');
 if r->>'page'<>'2' or r->>'total'<>'23' or jsonb_array_length(r->'lessons')<>3 then raise exception 'upcoming beyond-end clamp mismatch: %',r; end if;

 -- Two attendance rows exist for a returned lesson, but the caller sees exactly
 -- their own row and the second row is known to exist from the fixture check above.
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00');
 if jsonb_array_length(r->'attendance')<>0 then raise exception 'upcoming projection returned attendance for a lesson without caller attendance'; end if;
 r:=public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',true,1,'2027-01-15 00:00+00');
 if jsonb_array_length(r->'attendance')<>1 or r->'attendance'->0 is distinct from jsonb_build_object('lesson_id','86a20000-0000-4000-8000-000000000001','status','present') then raise exception 'other-student attendance leaked or own attendance missing: %',r->'attendance'; end if;

 o:=public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00');
 if o->'group' is distinct from detail then raise exception 'overview group does not match canonical detail'; end if;
 if o->'next' is distinct from jsonb_build_object('id','86a20000-0000-4000-8000-000000000100','group_id','86a10000-0000-4000-8000-000000000001','title','Upcoming tie A','starts_at','2027-01-15T01:00:00+00:00','ends_at','2027-01-15T02:00:00+00:00','status','scheduled') then raise exception 'overview next filter/order/field parity mismatch: %',o->'next'; end if;
 if o->'slots' is distinct from jsonb_build_array(
   jsonb_build_object('id','86a30000-0000-4000-8000-000000000001','group_id','86a10000-0000-4000-8000-000000000001','weekday',2,'start_time','09:00:00','end_time','10:00:00','timezone','Africa/Cairo'),
   jsonb_build_object('id','86a30000-0000-4000-8000-000000000002','group_id','86a10000-0000-4000-8000-000000000001','weekday',2,'start_time','11:00:00','end_time','12:00:00','timezone','Africa/Cairo'),
   jsonb_build_object('id','86a30000-0000-4000-8000-000000000003','group_id','86a10000-0000-4000-8000-000000000001','weekday',4,'start_time','09:00:00','end_time','10:00:00','timezone','Africa/Cairo')) then raise exception 'overview slots fields/order parity mismatch: %',o->'slots'; end if;
 if o->'announcement' is distinct from jsonb_build_object('body','Pinned parity body','edited_at','2027-01-10T12:00:00+00:00') then raise exception 'overview pinned announcement parity mismatch: %',o->'announcement'; end if;
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000002',false,1,'2027-01-15 00:00+00') is not null then raise exception 'outsider saw another accepted class'; end if;
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000099',false,1,'2027-01-15 00:00+00') is not null then raise exception 'unknown class exposed'; end if;
end $$;

-- The canonical detail gate must also deny every non-accepted/non-student actor
-- for both definer projections; the outsider really is accepted in the other class.
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86a00000-0000-4000-8000-000000000003';
do $$ begin
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00') is not null or public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00') is not null then raise exception 'outsider saw private class projections'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86a00000-0000-4000-8000-000000000004';
do $$ begin
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00') is not null or public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00') is not null then raise exception 'pending student saw private class projections'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86a00000-0000-4000-8000-000000000005';
do $$ begin
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00') is not null or public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00') is not null then raise exception 'rejected student saw private class projections'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86a00000-0000-4000-8000-000000000006';
do $$ begin
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00') is not null or public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00') is not null then raise exception 'suspended student saw private class projections'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='86a00000-0000-4000-8000-000000000001';
do $$ begin
 if public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00') is not null or public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00') is not null then raise exception 'owner teacher entered student projections'; end if;
end $$;

reset role;
do $$ begin
 if not has_function_privilege('authenticated','public.student_class_lessons_page(uuid,boolean,integer,timestamptz)','EXECUTE')
 or not has_function_privilege('authenticated','public.student_class_overview(uuid,timestamptz)','EXECUTE') then raise exception 'authenticated role cannot execute projection RPCs'; end if;
end $$;
set local role anon;
do $$ declare denied boolean;
begin
 denied:=false; begin perform public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'anonymous caller executed lessons projection'; end if;
 denied:=false; begin perform public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'anonymous caller executed overview projection'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare denied boolean;
begin
 denied:=false; begin perform public.student_class_lessons_page('86a10000-0000-4000-8000-000000000001',false,1,'2027-01-15 00:00+00'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'service_role executed lessons projection'; end if;
 denied:=false; begin perform public.student_class_overview('86a10000-0000-4000-8000-000000000001','2027-01-15 00:00+00'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'service_role executed overview projection'; end if;
end $$;
reset role;
select 'student class page projections and access matrix passed';
rollback;
