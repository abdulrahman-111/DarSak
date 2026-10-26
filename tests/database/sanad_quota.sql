\set ON_ERROR_STOP on
begin;

do $$ begin
  if not (select bool_and(relrowsecurity) from pg_class where oid in (
      'private.sanad_pilot_testers'::regclass,'private.sanad_user_daily_usage'::regclass,
      'private.sanad_global_daily_usage'::regclass,'private.sanad_request_leases'::regclass))
     or has_table_privilege('authenticated','private.sanad_pilot_testers','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','private.sanad_user_daily_usage','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','private.sanad_request_leases','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Sanad private tables must use RLS and have no direct API table grants';
  end if;
  if not has_schema_privilege('anon','private','USAGE')
     or not has_schema_privilege('authenticated','private','USAGE')
     or not has_function_privilege('anon','private.catalogue_row_visible(text,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','private.catalogue_row_visible(text,uuid)','EXECUTE') then
    raise exception 'existing private schema/catalogue RLS grants were changed';
  end if;
  if has_function_privilege('public','public.sanad_reserve_request()','EXECUTE')
     or has_function_privilege('anon','public.sanad_reserve_request()','EXECUTE')
     or has_function_privilege('service_role','public.sanad_reserve_request()','EXECUTE')
     or not has_function_privilege('authenticated','public.sanad_reserve_request()','EXECUTE')
     or has_function_privilege('anon','public.sanad_release_request(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.sanad_release_request(uuid)','EXECUTE') then
    raise exception 'Sanad RPC grants are unsafe';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a8200000-0000-4000-8000-000000000001','authenticated','authenticated','sanad-one@test.invalid','{"full_name":"Sanad One","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000002','authenticated','authenticated','sanad-two@test.invalid','{"full_name":"Sanad Two","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000003','authenticated','authenticated','sanad-three@test.invalid','{"full_name":"Sanad Three","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000004','authenticated','authenticated','sanad-four@test.invalid','{"full_name":"Sanad Four","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000005','authenticated','authenticated','sanad-five@test.invalid','{"full_name":"Sanad Five","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000006','authenticated','authenticated','sanad-six@test.invalid','{"full_name":"Sanad Six","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000007','authenticated','authenticated','sanad-suspended@test.invalid','{"full_name":"Sanad Suspended","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000008','authenticated','authenticated','sanad-eight@test.invalid','{"full_name":"Sanad Eight","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000009','authenticated','authenticated','sanad-nine@test.invalid','{"full_name":"Sanad Nine","requested_role":"student"}');
set local role service_role;
update public.profiles set status='suspended' where id='a8200000-0000-4000-8000-000000000007';
reset role;
insert into private.sanad_pilot_testers(user_id) values
 ('a8200000-0000-4000-8000-000000000001'),('a8200000-0000-4000-8000-000000000002'),
 ('a8200000-0000-4000-8000-000000000003'),('a8200000-0000-4000-8000-000000000004'),
 ('a8200000-0000-4000-8000-000000000005'),('a8200000-0000-4000-8000-000000000008'),
 ('a8200000-0000-4000-8000-000000000009'),
 ('a8200000-0000-4000-8000-000000000007');

set local role anon;
do $$ declare v_denied boolean:=false; begin
  begin perform public.sanad_reserve_request();
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'anon executed Sanad reserve RPC'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000006';
do $$ begin
  if public.sanad_reserve_request() is not null then raise exception 'non-enrolled user reserved'; end if;
  begin perform 1 from private.sanad_pilot_testers;
    raise exception 'authenticated role read enrollment list';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000007';
do $$ begin
  if public.sanad_reserve_request() is not null then raise exception 'suspended user reserved'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='';
do $$ begin
  if public.sanad_reserve_request() is not null then raise exception 'missing auth.uid reserved'; end if;
end $$;
reset role;

-- Lease ownership, single in-flight request per user, expiry, and no refund.
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
do $$ declare a uuid; b uuid; n integer; begin
  a:=public.sanad_reserve_request();
  if a is null or public.sanad_reserve_request() is not null then raise exception 'user in-flight cap failed'; end if;
  perform public.sanad_release_request(a);
  select accepted_requests into n from private.sanad_user_daily_usage where user_id=auth.uid();
  if n<>1 then raise exception 'release refunded request budget'; end if;
  a:=public.sanad_reserve_request(); perform public.sanad_release_request(a);
  b:=public.sanad_reserve_request();
  perform set_config('request.jwt.claim.sub','a8200000-0000-4000-8000-000000000002',true);
  perform public.sanad_release_request(b);
  if not exists(select 1 from private.sanad_request_leases where lease_id=b and user_id='a8200000-0000-4000-8000-000000000001') then
    raise exception 'another user released an owned lease'; end if;
  perform set_config('request.jwt.claim.sub','a8200000-0000-4000-8000-000000000001',true);
  perform public.sanad_release_request(a);
  if not exists(select 1 from private.sanad_request_leases where lease_id=b and user_id=auth.uid()) then
    raise exception 'release deleted a foreign lease'; end if;
  update private.sanad_request_leases set expires_at=clock_timestamp()-interval '1 second' where lease_id=b;
  a:=public.sanad_reserve_request();
  if a is null or exists(select 1 from private.sanad_request_leases where lease_id=b) then raise exception 'expired lease not pruned'; end if;
  perform public.sanad_release_request(a);
end $$;
reset role;

-- Ten per UTC minute, then 100 per UTC day. The stale minute bucket isolates
-- the daily assertion from the minute cap.
delete from private.sanad_user_daily_usage where user_id='a8200000-0000-4000-8000-000000000001';
delete from private.sanad_user_daily_usage where user_id='a8200000-0000-4000-8000-000000000002';
delete from private.sanad_global_daily_usage; delete from private.sanad_request_leases;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000002';
do $$ declare i int; a uuid; begin
  for i in 1..10 loop
    a:=public.sanad_reserve_request(); if a is null then raise exception 'minute quota rejected %',i; end if;
    perform public.sanad_release_request(a);
  end loop;
  if public.sanad_reserve_request() is not null then raise exception '11th minute request accepted'; end if;
end $$;
update private.sanad_user_daily_usage set minute_start=minute_start-interval '2 minutes',minute_requests=0 where user_id='a8200000-0000-4000-8000-000000000001';
delete from private.sanad_global_daily_usage; delete from private.sanad_request_leases;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
do $$ declare i int; a uuid; d date:=(clock_timestamp() at time zone 'UTC')::date; begin
  for i in 1..100 loop
    a:=public.sanad_reserve_request(); if a is null then raise exception 'daily quota rejected %',i; end if;
    perform public.sanad_release_request(a);
    update private.sanad_user_daily_usage set minute_start=minute_start-interval '2 minutes',minute_requests=0 where user_id=auth.uid();
  end loop;
  if public.sanad_reserve_request() is not null then raise exception '101st daily request accepted'; end if;
  if (select accepted_requests from private.sanad_user_daily_usage where user_id=auth.uid() and utc_day=d)<>100 then raise exception 'daily count mismatch'; end if;
end $$;

-- Five simultaneous leases across users, then the global in-flight cap denies.
delete from private.sanad_user_daily_usage where user_id in (
 'a8200000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000003',
 'a8200000-0000-4000-8000-000000000004','a8200000-0000-4000-8000-000000000005',
 'a8200000-0000-4000-8000-000000000008');
delete from private.sanad_global_daily_usage; delete from private.sanad_request_leases;
do $$ declare u uuid; a uuid; begin
 foreach u in array array[
 'a8200000-0000-4000-8000-000000000002'::uuid,'a8200000-0000-4000-8000-000000000003'::uuid,
 'a8200000-0000-4000-8000-000000000004'::uuid,'a8200000-0000-4000-8000-000000000005'::uuid,
 'a8200000-0000-4000-8000-000000000008'::uuid] loop
   perform set_config('request.jwt.claim.sub',u::text,true); a:=public.sanad_reserve_request();
   if a is null then raise exception 'global lease unexpectedly denied'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub','a8200000-0000-4000-8000-000000000009',true);
 if public.sanad_reserve_request() is not null then raise exception 'sixth global in-flight request accepted'; end if;
end $$;

-- Seed counters at 499 without charging 499 test calls, then prove global 500.
delete from private.sanad_request_leases; delete from private.sanad_global_daily_usage;
delete from private.sanad_user_daily_usage where user_id='a8200000-0000-4000-8000-000000000003';
insert into private.sanad_global_daily_usage(utc_day,accepted_requests)
values ((clock_timestamp() at time zone 'UTC')::date,499);
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000003';
do $$ declare a uuid; begin
 a:=public.sanad_reserve_request(); if a is null then raise exception 'global 500th request denied'; end if;
 perform public.sanad_release_request(a);
 if public.sanad_reserve_request() is not null then raise exception '501st global request accepted'; end if;
end $$;

-- Runtime day rollover: old daily budgets are discarded, while an outstanding
-- lease still blocks a request until its owner releases it.
delete from private.sanad_request_leases;
delete from private.sanad_user_daily_usage;
delete from private.sanad_global_daily_usage;
insert into private.sanad_user_daily_usage(user_id,utc_day,accepted_requests,minute_start,minute_requests)
values ('a8200000-0000-4000-8000-000000000009',
        (clock_timestamp() at time zone 'UTC')::date-1,100,clock_timestamp(),10);
insert into private.sanad_global_daily_usage(utc_day,accepted_requests)
values ((clock_timestamp() at time zone 'UTC')::date-1,500);
insert into private.sanad_request_leases(user_id,expires_at)
values ('a8200000-0000-4000-8000-000000000009',clock_timestamp()+interval '45 seconds');
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000009';
do $$ declare a uuid; d date:=(clock_timestamp() at time zone 'UTC')::date; begin
  if public.sanad_reserve_request() is not null then raise exception 'active lease did not survive UTC day rollover'; end if;
  if not exists(select 1 from private.sanad_request_leases where user_id=auth.uid()) then raise exception 'day rollover cleared active lease'; end if;
  if exists(select 1 from private.sanad_user_daily_usage where user_id=auth.uid() and utc_day<d)
     or exists(select 1 from private.sanad_global_daily_usage where utc_day<d) then raise exception 'old UTC day counters were not pruned'; end if;
  perform public.sanad_release_request((select lease_id from private.sanad_request_leases where user_id=auth.uid()));
  a:=public.sanad_reserve_request(); if a is null then raise exception 'fresh UTC day quota was not available'; end if;
  if (select accepted_requests from private.sanad_user_daily_usage where user_id=auth.uid() and utc_day=d)<>1
     or (select accepted_requests from private.sanad_global_daily_usage where utc_day=d)<>1 then
    raise exception 'new UTC day did not start at one accepted request'; end if;
  perform public.sanad_release_request(a);
end $$;

rollback;
select 'Sanad quota permissions, lease ownership, and rate limit assertions passed' as result;
