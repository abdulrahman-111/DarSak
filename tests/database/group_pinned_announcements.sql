\set ON_ERROR_STOP on
begin;
do $$ begin
  if has_table_privilege('anon','public.group_pinned_announcements','SELECT')
     or not has_table_privilege('authenticated','public.group_pinned_announcements','SELECT')
     or has_table_privilege('authenticated','public.group_pinned_announcements','INSERT')
     or has_table_privilege('authenticated','public.group_pinned_announcements','UPDATE')
     or has_table_privilege('authenticated','public.group_pinned_announcements','DELETE')
     or has_table_privilege('service_role','public.group_pinned_announcements','SELECT')
     or has_function_privilege('anon','public.set_group_pinned_announcement(uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.set_group_pinned_announcement(uuid,text)','EXECUTE')
     or has_function_privilege('service_role','public.set_group_pinned_announcement(uuid,text)','EXECUTE') then
    raise exception 'announcement grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7e000000-0000-4000-8000-000000000001','authenticated','authenticated','announce-owner@test.invalid','{"full_name":"Announcement owner","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000002','authenticated','authenticated','announce-accepted@test.invalid','{"full_name":"Accepted student","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000003','authenticated','authenticated','announce-pending@test.invalid','{"full_name":"Pending student","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000004','authenticated','authenticated','announce-foreign@test.invalid','{"full_name":"Foreign student","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000005','authenticated','authenticated','announce-admin@test.invalid','{"full_name":"Announcement admin","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000006','authenticated','authenticated','announce-unapproved@test.invalid','{"full_name":"Unapproved owner","requested_role":"teacher"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id='7e000000-0000-4000-8000-000000000001';
update public.profiles set role='admin' where id='7e000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000001',o.id,'Pinned announcement fixture',5,'draft' from public.offerings o order by o.id limit 1;
insert into public.enrollments(id,group_id,student_id,status) values
 ('7e200000-0000-4000-8000-000000000001','7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000002','accepted'),
 ('7e200000-0000-4000-8000-000000000002','7e100000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000003','pending');

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$ declare v_time timestamptz; begin
  v_time := public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','<b>مرحبا</b>');
  if v_time is null or (select body from public.group_pinned_announcements where group_id='7e100000-0000-4000-8000-000000000001') <> '<b>مرحبا</b>' then raise exception 'plain text announcement was not preserved'; end if;
  if (select edited_at from public.group_pinned_announcements where group_id='7e100000-0000-4000-8000-000000000001') <> v_time then raise exception 'edited timestamp was not returned'; end if;
  begin perform public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001',repeat('😀',2001)); raise exception 'oversized announcement succeeded'; exception when others then if sqlerrm='oversized announcement succeeded' then raise; elsif sqlerrm <> 'announcement exceeds 2000 characters' then raise; end if; end;
  v_time := public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','   ');
  if v_time is not null then raise exception 'blank announcement clear returned a timestamp'; end if;
  if exists(select 1 from public.group_pinned_announcements where group_id='7e100000-0000-4000-8000-000000000001') then raise exception 'blank announcement was not cleared'; end if;
  perform public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','Keep history');
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.group_pinned_announcements where group_id='7e100000-0000-4000-8000-000000000001') <> 1 then raise exception 'accepted student could not read announcement'; end if;
  begin insert into public.group_pinned_announcements(group_id,body) values('7e100000-0000-4000-8000-000000000001','direct write'); raise exception 'direct insert succeeded'; exception when insufficient_privilege then null; end;
  begin update public.group_pinned_announcements set body='direct write'; raise exception 'direct update succeeded'; exception when insufficient_privilege then null; end;
  begin delete from public.group_pinned_announcements; raise exception 'direct delete succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000003';
do $$ begin if (select count(*) from public.group_pinned_announcements) <> 0 then raise exception 'pending student read announcement'; end if; end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000004';
do $$ begin if (select count(*) from public.group_pinned_announcements) <> 0 then raise exception 'foreign student read announcement'; end if; end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000006';
do $$ begin
  if (select count(*) from public.group_pinned_announcements) <> 0 then raise exception 'foreign teacher read announcement'; end if;
  begin perform public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','unauthorized'); raise exception 'unapproved owner wrote announcement'; exception when others then if sqlerrm='unapproved owner wrote announcement' then raise; elsif sqlerrm <> 'active approved teacher owner required' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000005';
do $$ begin
  if (select count(*) from public.group_pinned_announcements) <> 1 then raise exception 'admin oversight read failed'; end if;
  begin perform public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','admin write'); raise exception 'admin wrote announcement'; exception when others then if sqlerrm='admin wrote announcement' then raise; end if; end;
end $$;
reset role;

-- Active owner may review old announcements even if teacher approval changes.
set local session_replication_role=replica;
update public.teacher_profiles set approved=false where id='7e000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.group_pinned_announcements) <> 1 then raise exception 'active owner lost read access to historical announcement'; end if;
  begin perform public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','unapproved write'); raise exception 'unapproved owner wrote announcement'; exception when others then if sqlerrm='unapproved owner wrote announcement' then raise; elsif sqlerrm <> 'active approved teacher owner required' then raise; end if; end;
end $$;
reset role;

set local session_replication_role=replica;
update public.profiles set status='suspended' where id='7e000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$ begin if (select count(*) from public.group_pinned_announcements) <> 0 then raise exception 'suspended owner retained announcement access'; end if; end $$;
reset role;
set local session_replication_role=replica;
update public.profiles set status='active' where id='7e000000-0000-4000-8000-000000000001';
update public.teacher_profiles set approved=true where id='7e000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
update public.groups set status='archived' where id='7e100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000001';
do $$ begin
  begin perform public.set_group_pinned_announcement('7e100000-0000-4000-8000-000000000001','stale archived write'); raise exception 'archived announcement write succeeded'; exception when others then if sqlerrm='archived announcement write succeeded' then raise; elsif sqlerrm <> 'archived group cannot be edited' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.group_pinned_announcements) <> 1 then raise exception 'accepted student lost archived history'; end if;
end $$;
reset role;
rollback;
select 'group pinned announcements SQL assertions passed' as result;
