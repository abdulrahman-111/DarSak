\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regprocedure('public.student_resource_page(uuid,text,text,integer,integer)') is null
     or not has_function_privilege('authenticated','public.student_resource_page(uuid,text,text,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.student_resource_page(uuid,text,text,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.student_resource_page(uuid,text,text,integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.student_resource_group_choices(text,uuid)','EXECUTE')
     or has_function_privilege('anon','public.student_resource_group_choices(text,uuid)','EXECUTE')
     or has_function_privilege('service_role','public.student_resource_group_choices(text,uuid)','EXECUTE') then
    raise exception 'student resource finder signatures or grants are unsafe';
  end if;
  if pg_get_functiondef('public.student_resource_page(uuid,text,text,integer,integer)'::regprocedure) ilike '%storage_path%'
     or pg_get_functiondef('public.student_resource_page(uuid,text,text,integer,integer)'::regprocedure) ilike '%signedurl%' then
    raise exception 'student resource page exposes private storage information';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7e000000-0000-4000-8000-000000000021','authenticated','authenticated','resource-owner@test.invalid','{"full_name":"Resource owner","requested_role":"teacher"}'),
 ('7e000000-0000-4000-8000-000000000022','authenticated','authenticated','resource-student@test.invalid','{"full_name":"Resource student","requested_role":"student"}'),
 ('7e000000-0000-4000-8000-000000000023','authenticated','authenticated','resource-other@test.invalid','{"full_name":"Other student","requested_role":"student"}');
update public.teacher_profiles set headline='Teacher',bio='' where id='7e000000-0000-4000-8000-000000000021';
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select '7e100000-0000-4000-8000-000000000021','7e000000-0000-4000-8000-000000000021',o.id,'Historical resource group',10,'archived' from public.offerings o order by o.id limit 1;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status)
select ('7e100000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'7e000000-0000-4000-8000-000000000021',o.id,'A resource group '||lpad(n::text,2,'0'),10,'archived'
from public.offerings o cross join generate_series(1,50) n order by o.id,n limit 50;
insert into public.enrollments(id,group_id,student_id,status) values
 ('7e200000-0000-4000-8000-000000000021','7e100000-0000-4000-8000-000000000021','7e000000-0000-4000-8000-000000000022','accepted'),
 ('7e200000-0000-4000-8000-000000000022','7e100000-0000-4000-8000-000000000021','7e000000-0000-4000-8000-000000000023','pending');
insert into public.enrollments(id,group_id,student_id,status)
select ('7e200000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,('7e100000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'7e000000-0000-4000-8000-000000000022','accepted'
from generate_series(1,50) n;
insert into public.lessons(id,group_id,title,starts_at,ends_at,status)
values('7e300000-0000-4000-8000-000000000021','7e100000-0000-4000-8000-000000000021','Resource lesson',now(),now()+interval '1 hour','completed');
insert into public.lesson_materials(id,lesson_id,kind,title,content,uploaded_by)
values('7e400000-0000-4000-8000-000000000021','7e300000-0000-4000-8000-000000000021','note','Revision note','Private note text','7e000000-0000-4000-8000-000000000021');
insert into public.lesson_materials(id,lesson_id,kind,title,content,uploaded_by)
select ('7e400000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'7e300000-0000-4000-8000-000000000021','note','Bulk note '||n,'Bounded page fixture','7e000000-0000-4000-8000-000000000021'
from generate_series(1,25) n;

set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000022';
do $$
declare v_page jsonb; v_choices integer;
begin
  v_page:=public.student_resource_page(null,null,'Historical resource',0,100);
  if (v_page->>'total')::integer<>26 or jsonb_array_length(v_page->'rows')<>20
     or v_page->'rows'->0->>'group_name'<>'Historical resource group'
     or (v_page->'rows'->0 ? 'storage_path') then
    raise exception 'accepted member did not receive a bounded archived-group resource page';
  end if;
  v_page:=public.student_resource_page(null,'note','Revision note',0,20);
  if (v_page->>'total')::integer<>1 or v_page->'rows'->0->>'content'<>'Private note text' then
    raise exception 'kind and title filters omitted the expected private note';
  end if;
  if (public.student_resource_page(null,'file','',0,20)->>'total')::integer<>0 then
    raise exception 'resource kind filter failed';
  end if;
  begin perform public.student_resource_page(null,'unknown','',0,20);
    raise exception 'invalid resource kind was accepted';
  exception when sqlstate '22023' then null; end;
  select count(*) into v_choices from public.student_resource_group_choices('Historical');
  if v_choices<>1 then raise exception 'accepted group search did not return the historical group'; end if;
  select count(*) into v_choices from public.student_resource_group_choices('', '7e100000-0000-4000-8000-000000000021');
  if v_choices<>50 or not exists(select 1 from public.student_resource_group_choices('', '7e100000-0000-4000-8000-000000000021') where id='7e100000-0000-4000-8000-000000000021') then
    raise exception 'selected group beyond the first 50 was not retained in bounded choices';
  end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='7e000000-0000-4000-8000-000000000023';
do $$ begin
  if (public.student_resource_page(null,null,'',0,20)->>'total')::integer<>0 then
    raise exception 'pending student saw another student resource';
  end if;
end $$;
reset role;
rollback;
select 'student resource finder SQL assertions passed' as result;
