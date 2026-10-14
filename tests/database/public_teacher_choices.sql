\set ON_ERROR_STOP on
begin;

do $$
declare v_proc oid := 'public.public_teacher_choices(text,uuid)'::regprocedure;
begin
  if not has_function_privilege('anon',v_proc,'EXECUTE')
     or not has_function_privilege('authenticated',v_proc,'EXECUTE')
     or has_function_privilege('service_role',v_proc,'EXECUTE') then
    raise exception 'public teacher choices grants are incorrect';
  end if;
  if (select prosecdef from pg_proc where oid=v_proc) is not true
     or (select provolatile from pg_proc where oid=v_proc) <> 's'
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid=v_proc) then
    raise exception 'public teacher choices must be stable security definer with fixed search_path';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('d9000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'authenticated','authenticated','choice-'||i||'@regression.test',
       jsonb_build_object('full_name',format('Choice Teacher %03s',i),'requested_role','teacher')
from generate_series(1,55) i;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('d9000000-0000-4000-8000-000000000056','authenticated','authenticated','choice-pending@regression.test','{"full_name":"Choice Pending","requested_role":"teacher"}'),
 ('d9000000-0000-4000-8000-000000000057','authenticated','authenticated','choice-suspended@regression.test','{"full_name":"Choice Suspended","requested_role":"teacher"}');

set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id between
 'd9000000-0000-4000-8000-000000000001'::uuid and 'd9000000-0000-4000-8000-000000000055'::uuid;
update public.teacher_profiles set approved=true where id='d9000000-0000-4000-8000-000000000057';
update public.profiles set status='suspended' where id='d9000000-0000-4000-8000-000000000057';
set local session_replication_role=origin;

set local role anon;
do $$
declare v_count integer; v_selected integer;
begin
  select count(*) into v_count from public.public_teacher_choices('Choice Teacher',null);
  if v_count<>50 then raise exception 'teacher search returned %, expected bounded 50',v_count; end if;
  select count(*) into v_selected from public.public_teacher_choices('Choice Teacher',
    'd9000000-0000-4000-8000-000000000055'::uuid)
  where id='d9000000-0000-4000-8000-000000000055'::uuid;
  if v_selected<>1 then raise exception 'selected teacher outside the search window was not retained'; end if;
  if exists(select 1 from public.public_teacher_choices(null,null) where id in (
    'd9000000-0000-4000-8000-000000000056'::uuid,
    'd9000000-0000-4000-8000-000000000057'::uuid)) then
    raise exception 'pending or suspended teacher escaped the public choices projection';
  end if;
end $$;
reset role;
rollback;
