\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('public.student_enrollment_page(integer,integer)') is null
     or not has_function_privilege('authenticated','public.student_enrollment_page(integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.student_enrollment_page(integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.student_enrollment_page(integer,integer)','EXECUTE') then
    raise exception 'student enrollment page signature or grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('82000000-0000-4000-8000-000000000001','authenticated','authenticated','class-page-student@test.invalid','{"full_name":"Class Page Student","requested_role":"student"}'),
 ('82000000-0000-4000-8000-000000000002','authenticated','authenticated','class-page-other@test.invalid','{"full_name":"Other Class Student","requested_role":"student"}'),
 ('82000000-0000-4000-8000-000000000003','authenticated','authenticated','class-page-teacher@test.invalid','{"full_name":"Class Page Teacher","requested_role":"teacher"}'),
 ('82000000-0000-4000-8000-000000000004','authenticated','authenticated','class-page-suspended@test.invalid','{"full_name":"Suspended Class Student","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='82000000-0000-4000-8000-000000000003';
update public.profiles set status='suspended' where id='82000000-0000-4000-8000-000000000004';
set local session_replication_role=origin;

insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
select '82100000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003',o.id,'Visible history group','',10,'draft','Private room'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
select '82100000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003',o.id,'Public class group','',10,'draft','Public room'
from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
select '82100000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000003',o.id,'Private history group','',10,'draft','Private history room'
from public.offerings o order by o.id limit 1;
set local session_replication_role=replica;
update public.groups set status='published' where id in ('82100000-0000-4000-8000-000000000001','82100000-0000-4000-8000-000000000002');
update public.groups set status='published' where id='82100000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
insert into public.enrollments(id,group_id,student_id,status,updated_at) values
 ('82200000-0000-4000-8000-000000000001','82100000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','pending','2026-01-02'),
 ('82200000-0000-4000-8000-000000000002','82100000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','accepted','2026-01-01'),
 ('82200000-0000-4000-8000-000000000003','82100000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','accepted','2026-01-03'),
 ('82200000-0000-4000-8000-000000000004','82100000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','removed','2025-12-01');
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values ('82300000-0000-4000-8000-000000000001','82100000-0000-4000-8000-000000000001','Private pending lesson','2099-01-01 10:00+00','2099-01-01 11:00+00','scheduled');
insert into public.lesson_materials(id,lesson_id,kind,title,url,uploaded_by)
values ('82400000-0000-4000-8000-000000000001','82300000-0000-4000-8000-000000000001','link','Private pending material','https://example.invalid','82000000-0000-4000-8000-000000000003');

set local role authenticated;
set local request.jwt.claim.sub='82000000-0000-4000-8000-000000000001';
do $$ declare v_page jsonb; v_empty jsonb;
begin
 v_page:=public.student_enrollment_page(0,20);
 if (v_page->>'total')::int<>3 or jsonb_array_length(v_page->'rows')<>3 then raise exception 'own enrollment total or rows are wrong'; end if;
 if v_page->'rows'->0->>'id'<>'82200000-0000-4000-8000-000000000001'
    or v_page->'rows'->0->'group'->>'name'<>'Visible history group'
    or v_page->'rows'->0->'group'->>'location'<>'Private room' then raise exception 'pending enrollment group name or eligible location was hidden'; end if;
 if v_page->'rows'->1->'group'->>'location'<>'Public room' then raise exception 'eligible location was hidden'; end if;
 if v_page->'rows'->2->>'status'<>'removed' or v_page->'rows'->2->'group'->>'location' is not null then raise exception 'historical status or private location guard failed'; end if;
 if (v_page->'rows'->0->'group') ?| array['teacher_id','description','capacity','offering','teacher_name'] then raise exception 'unexpected private group fields returned'; end if;
 if exists(select 1 from jsonb_array_elements(v_page->'rows') r where r->>'student_id' is not null) then raise exception 'another student identity was returned'; end if;
 v_empty:=public.student_enrollment_page(20,20);
 if (v_empty->>'total')::int<>3 or jsonb_array_length(v_empty->'rows')<>0 then raise exception 'empty page count is not exact'; end if;
 begin perform public.student_enrollment_page(-1,20); raise exception 'negative offset accepted'; exception when sqlstate '22023' then null; end;
 begin perform public.student_enrollment_page(0,101); raise exception 'oversized page accepted'; exception when sqlstate '22023' then null; end;
 if exists(select 1 from public.lessons l join public.enrollments e on e.group_id=l.group_id where e.student_id=auth.uid() and e.status='pending' and l.id='82300000-0000-4000-8000-000000000001')
    or exists(select 1 from public.lesson_materials m where m.id='82400000-0000-4000-8000-000000000001') then raise exception 'pending enrollment gained lesson or material access'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='82000000-0000-4000-8000-000000000002';
do $$ declare v_page jsonb;
begin
 v_page:=public.student_enrollment_page(0,20);
 if (v_page->>'total')::int<>1 or v_page->'rows'->0->>'id'<>'82200000-0000-4000-8000-000000000003' then raise exception 'RPC returned another student enrollment or lost own enrollment'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='82000000-0000-4000-8000-000000000003';
do $$ begin
 begin perform public.student_enrollment_page(0,20); raise exception 'teacher access accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='82000000-0000-4000-8000-000000000004';
do $$ begin
 begin perform public.student_enrollment_page(0,20); raise exception 'suspended student access accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
 begin perform public.student_enrollment_page(0,20); raise exception 'anonymous execution accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
