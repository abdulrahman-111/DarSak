\set ON_ERROR_STOP on
begin;

do $$ begin
  if to_regprocedure('public.meeting_links(uuid[])') is null
     or to_regprocedure('public.group_meeting_settings(uuid)') is null
     or to_regprocedure('public.lesson_meeting_settings(uuid)') is null
     or to_regprocedure('public.save_group_meeting_url(uuid,text)') is null
     or to_regprocedure('public.save_lesson_with_meeting(uuid,text,timestamp with time zone,timestamp with time zone,text,uuid,text)') is null
     or to_regprocedure('dars_private.effective_meeting_url(uuid)') is null then
    raise exception 'private meeting migration is incomplete';
  end if;
  if has_table_privilege('authenticated','dars_private.lesson_meetings','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','dars_private.group_meeting_settings','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','dars_private.lesson_meetings','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.group_meeting_settings','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'private meeting tables expose direct privileges';
  end if;
  if has_function_privilege('anon','public.meeting_links(uuid[])','EXECUTE')
     or has_function_privilege('service_role','public.meeting_links(uuid[])','EXECUTE')
     or has_function_privilege('authenticated','dars_private.effective_meeting_url(uuid)','EXECUTE') then
    raise exception 'meeting RPC/helper grants are unsafe';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('groups','lessons') and column_name ilike '%meeting%url%') then
    raise exception 'public lesson/group projection acquired a meeting URL column';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('8a100000-0000-4000-8000-000000000001','authenticated','authenticated','meeting-owner@test.invalid','{"full_name":"Meeting owner","requested_role":"teacher"}'),
 ('8a100000-0000-4000-8000-000000000002','authenticated','authenticated','meeting-foreign@test.invalid','{"full_name":"Meeting foreign","requested_role":"teacher"}'),
 ('8a100000-0000-4000-8000-000000000003','authenticated','authenticated','meeting-student@test.invalid','{"full_name":"Meeting student","requested_role":"student"}'),
 ('8a100000-0000-4000-8000-000000000004','authenticated','authenticated','meeting-pending@test.invalid','{"full_name":"Meeting pending","requested_role":"student"}'),
 ('8a100000-0000-4000-8000-000000000005','authenticated','authenticated','meeting-admin@test.invalid','{"full_name":"Meeting admin","requested_role":"student"}'),
 ('8a100000-0000-4000-8000-000000000006','authenticated','authenticated','meeting-suspended@test.invalid','{"full_name":"Meeting suspended","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='8a100000-0000-4000-8000-000000000005';
update public.profiles set status='suspended' where id='8a100000-0000-4000-8000-000000000006';
update public.teacher_profiles set approved=true where id in ('8a100000-0000-4000-8000-000000000001','8a100000-0000-4000-8000-000000000002');
set local session_replication_role=origin;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status,location)
select x.id,x.teacher_id,o.id,x.name,10,'draft','Cairo'
from (values
 ('8a110000-0000-4000-8000-000000000001'::uuid,'8a100000-0000-4000-8000-000000000001'::uuid,'Meeting group'),
 ('8a110000-0000-4000-8000-000000000002'::uuid,'8a100000-0000-4000-8000-000000000002'::uuid,'Foreign meeting group')
) x(id,teacher_id,name) cross join lateral(select id from public.offerings order by id limit 1) o;
insert into public.lessons(id,group_id,title,starts_at,ends_at,status) values
 ('8a120000-0000-4000-8000-000000000001','8a110000-0000-4000-8000-000000000001','Meeting eligible',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled'),
 ('8a120000-0000-4000-8000-000000000002','8a110000-0000-4000-8000-000000000001','Meeting default',now()+interval '3 days',now()+interval '3 days 1 hour','scheduled'),
 ('8a120000-0000-4000-8000-000000000003','8a110000-0000-4000-8000-000000000001','Meeting cancelled',now()+interval '4 days',now()+interval '4 days 1 hour','cancelled'),
 ('8a120000-0000-4000-8000-000000000004','8a110000-0000-4000-8000-000000000002','Foreign lesson',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled'),
 ('8a120000-0000-4000-8000-000000000005','8a110000-0000-4000-8000-000000000001','Stale generated fallback',now()+interval '5 days',now()+interval '5 days 1 hour','scheduled');
insert into public.enrollments(group_id,student_id,status) values
 ('8a110000-0000-4000-8000-000000000001','8a100000-0000-4000-8000-000000000003','accepted'),
 ('8a110000-0000-4000-8000-000000000001','8a100000-0000-4000-8000-000000000004','pending');
insert into dars_private.group_meeting_settings(group_id,teacher_id,meeting_url) values
 ('8a110000-0000-4000-8000-000000000001','8a100000-0000-4000-8000-000000000001','https://meet.google.com/group-room');
insert into dars_private.lesson_meetings(lesson_id,teacher_id,mode,status,manual_url,join_url) values
 ('8a120000-0000-4000-8000-000000000001','8a100000-0000-4000-8000-000000000001','automatic','ready',null,'https://meet.google.com/abc-defg-hij'),
 ('8a120000-0000-4000-8000-000000000005','8a100000-0000-4000-8000-000000000001','automatic','disconnected',null,'https://meet.google.com/old-link-abc');

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare v_links jsonb; v_id uuid; begin
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001')->>'meeting_url' is distinct from 'https://meet.google.com/group-room' then raise exception 'owner default read failed'; end if;
  if public.lesson_meeting_settings('8a120000-0000-4000-8000-000000000001')->>'meeting_url' is not null then raise exception 'generated URL leaked into explicit override getter'; end if;
  v_links:=public.meeting_links(array['8a120000-0000-4000-8000-000000000001','8a120000-0000-4000-8000-000000000002','8a120000-0000-4000-8000-000000000003']::uuid[]);
  if v_links->0->>'meeting_url'<>'https://meet.google.com/abc-defg-hij'
     or v_links->1->>'meeting_url'<>'https://meet.google.com/group-room'
     or v_links->2 is not null then raise exception 'ready/default/cancelled effective resolution failed: %',v_links; end if;
  begin perform public.meeting_links(array(select gen_random_uuid() from generate_series(1,101))); raise exception 'over 100 lesson IDs accepted'; exception when sqlstate '22023' then null; end;
  perform public.save_group_meeting_url('8a110000-0000-4000-8000-000000000001','');
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001')->>'meeting_url' is not null then raise exception 'empty default did not clear'; end if;
  perform public.save_group_meeting_url('8a110000-0000-4000-8000-000000000001','https://meet.google.com/group-room');
  begin perform public.save_group_meeting_url('8a110000-0000-4000-8000-000000000001','http://meet.google.com/group-room'); raise exception 'HTTP URL accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_group_meeting_url('8a110000-0000-4000-8000-000000000001','https://user@meet.google.com/room'); raise exception 'userinfo URL accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_group_meeting_url('8a110000-0000-4000-8000-000000000001',repeat('x',501)); raise exception 'overlength URL accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_group_meeting_url('8a110000-0000-4000-8000-000000000001',E'https://meet.google.com/room\\evil'); raise exception 'backslash URL accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.save_lesson_with_meeting('8a110000-0000-4000-8000-000000000001','Atomic bad create',now()+interval '6 days',now()+interval '6 days 1 hour','',null,'javascript:alert(1)'); raise exception 'unsafe lesson create succeeded'; exception when sqlstate '22023' then null; end;
  if exists(select 1 from public.lessons where title='Atomic bad create') then raise exception 'invalid override left a created lesson'; end if;
  begin perform public.save_lesson_with_meeting('8a110000-0000-4000-8000-000000000001','Atomic bad edit',now()+interval '2 days',now()+interval '2 days 1 hour','', '8a120000-0000-4000-8000-000000000001','data:text/plain,no'); raise exception 'unsafe lesson edit succeeded'; exception when sqlstate '22023' then null; end;
  if (select title from public.lessons where id='8a120000-0000-4000-8000-000000000001')<>'Meeting eligible' then raise exception 'invalid override edit was not atomic'; end if;
  v_id:=public.save_lesson_with_meeting('8a110000-0000-4000-8000-000000000001','Manual override',now()+interval '2 days',now()+interval '2 days 1 hour','', '8a120000-0000-4000-8000-000000000001','https://meet.google.com/owner-room');
  if public.meeting_links(array[v_id])->0->>'meeting_url' is distinct from 'https://meet.google.com/owner-room'
    or public.lesson_meeting_settings(v_id)->>'meeting_url' is distinct from 'https://meet.google.com/owner-room' then raise exception 'manual override precedence failed'; end if;
  perform public.save_lesson_with_meeting('8a110000-0000-4000-8000-000000000001','Clear override',now()+interval '2 days',now()+interval '2 days 1 hour','',v_id,null);
  if public.lesson_meeting_settings(v_id)->>'meeting_url' is not null then raise exception 'clear left manual override'; end if;
  perform public.save_lesson_with_meeting('8a110000-0000-4000-8000-000000000001','Manual over stale generated',now()+interval '5 days',now()+interval '5 days 1 hour','', '8a120000-0000-4000-8000-000000000005','https://meet.google.com/temporary-room');
  perform public.save_lesson_with_meeting('8a110000-0000-4000-8000-000000000001','Clear stale generated',now()+interval '5 days',now()+interval '5 days 1 hour','', '8a120000-0000-4000-8000-000000000005',null);
  if public.meeting_links(array['8a120000-0000-4000-8000-000000000005']::uuid[])->0->>'meeting_url' is distinct from 'https://meet.google.com/group-room' then raise exception 'clearing manual exposed stale disconnected generated URL'; end if;
end $$;
reset role;
do $$ begin
  if (select desired_revision from dars_private.lesson_meetings where lesson_id='8a120000-0000-4000-8000-000000000001')<>3
     or (select mode from dars_private.lesson_meetings where lesson_id='8a120000-0000-4000-8000-000000000001')<>'automatic'
     or (select status from dars_private.lesson_meetings where lesson_id='8a120000-0000-4000-8000-000000000001')<>'ready' then raise exception 'manual clear did not preserve ready automatic metadata'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ declare v_links jsonb; begin
  v_links:=public.meeting_links(array['8a120000-0000-4000-8000-000000000001','8a120000-0000-4000-8000-000000000002','8a120000-0000-4000-8000-000000000004']::uuid[]);
  if jsonb_array_length(v_links)<>2 or v_links->0->>'meeting_url' is distinct from 'https://meet.google.com/abc-defg-hij'
    or v_links->1->>'meeting_url' is distinct from 'https://meet.google.com/group-room' then raise exception 'accepted student read failed or foreign lesson visible: %',v_links; end if;
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001') is not null
    or public.lesson_meeting_settings('8a120000-0000-4000-8000-000000000001') is not null then raise exception 'student received owner settings'; end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ begin
  if public.meeting_links(array['8a120000-0000-4000-8000-000000000001']::uuid[])<>'[]'::jsonb then raise exception 'pending student received link'; end if;
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001') is not null then raise exception 'pending student received settings'; end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$ begin
  if public.current_role() is not null then raise exception 'AAL1 admin role unexpectedly active'; end if;
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001') is not null
     or public.lesson_meeting_settings('8a120000-0000-4000-8000-000000000001') is not null
     or public.meeting_links(array['8a120000-0000-4000-8000-000000000001']::uuid[])<>'[]'::jsonb then raise exception 'AAL1 admin received private settings or links'; end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$ begin
  if public.current_role() is distinct from 'admin'::public.user_role
     or public.group_meeting_settings('8a110000-0000-4000-8000-000000000001')->>'meeting_url' is distinct from 'https://meet.google.com/group-room'
     or public.meeting_links(array['8a120000-0000-4000-8000-000000000001']::uuid[])->0->>'meeting_url' is distinct from 'https://meet.google.com/abc-defg-hij' then
    raise exception 'AAL2 admin authorized private meeting read failed';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001') is not null
     or public.meeting_links(array['8a120000-0000-4000-8000-000000000001']::uuid[])<>'[]'::jsonb then
    raise exception 'foreign teacher read another owner private meeting data';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"8a100000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}',true);
select set_config('request.jwt.claim.sub','8a100000-0000-4000-8000-000000000006',true);
set local role authenticated;
do $$ begin
  if public.group_meeting_settings('8a110000-0000-4000-8000-000000000001') is not null
     or public.lesson_meeting_settings('8a120000-0000-4000-8000-000000000001') is not null then raise exception 'suspended user received owner settings'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
-- The owner URL remains a private tombstone after group/lesson cascades, then
-- the ordinary auth.users -> profiles deletion path scrubs it.
insert into dars_private.lesson_meetings(lesson_id,teacher_id,mode,status,manual_url)
values('8a120000-0000-4000-8000-000000000099','8a100000-0000-4000-8000-000000000001','manual','ready','https://meet.google.com/delete-me');
delete from public.groups where id in ('8a110000-0000-4000-8000-000000000001','8a110000-0000-4000-8000-000000000002');
delete from auth.users where id='8a100000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select 1 from dars_private.lesson_meetings where lesson_id='8a120000-0000-4000-8000-000000000099' and manual_url is not null)
    then raise exception 'profile deletion did not scrub private meeting URL'; end if;
end $$;
rollback;
