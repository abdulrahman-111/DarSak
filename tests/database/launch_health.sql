\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data)values('99000000-0000-4000-8000-000000000001','authenticated','authenticated','health-admin@example.test','{"full_name":"Health admin","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set role='admin' where id='99000000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role service_role;
select public.record_launch_operation('signup','failed','provider',2500);
reset role;
set local role anon;
do $$begin
 begin perform public.record_launch_operation('signup','success','none',1);raise exception 'anon wrote counters';exception when insufficient_privilege then null;end;
 begin perform public.admin_launch_health();raise exception 'anon read health';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='99000000-0000-4000-8000-000000000001';
do $$declare h jsonb;begin
 h:=public.admin_launch_health();
 if not(h->'operations' @> '[{"operation":"signup","failed":1,"slow":1}]'::jsonb) then raise exception 'health aggregates wrong';end if;
 if h::text like '%payload%' or h::text like '%example.test%' then raise exception 'health leaked profile';end if;
 begin perform public.record_launch_operation('signup','success','none',1);raise exception 'admin forged counters';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'launch health regression passed';rollback;
