\set ON_ERROR_STOP on
begin;

do $$ begin
  if not (select bool_and(relrowsecurity) from pg_class where oid in (
      'dars_private.sandak_settings'::regclass,'dars_private.sandak_user_daily_usage'::regclass,
      'dars_private.sandak_global_daily_usage'::regclass,'dars_private.sandak_request_leases'::regclass))
     or has_table_privilege('authenticated','dars_private.sandak_settings','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','dars_private.sandak_user_daily_usage','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.sandak_request_leases','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'SanDai private tables must use RLS and have no direct API table grants';
  end if;
  if has_function_privilege('public','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE')
     or has_function_privilege('service_role','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.sanad_reserve_request(integer,integer,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.sanad_release_request(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.sanad_release_request(uuid)','EXECUTE') then
    raise exception 'SanDai RPC grants are unsafe';
  end if;
  if (select (user_daily_limit,user_minute_limit,global_daily_limit,global_concurrency)
        from dars_private.sandak_settings) is distinct from row(60,10,3000,10) then
    raise exception 'SanDai default limits are not 60/10/3000/10';
  end if;
end $$;

-- 1 student, 2 student, 3 student, 4 student, 5 student, 6 teacher, 7 suspended, 8 admin.
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a8200000-0000-4000-8000-000000000001','authenticated','authenticated','sandak-one@test.invalid','{"full_name":"SanDai One","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000002','authenticated','authenticated','sandak-two@test.invalid','{"full_name":"SanDai Two","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000003','authenticated','authenticated','sandak-three@test.invalid','{"full_name":"SanDai Three","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000004','authenticated','authenticated','sandak-four@test.invalid','{"full_name":"SanDai Four","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000005','authenticated','authenticated','sandak-five@test.invalid','{"full_name":"SanDai Five","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000006','authenticated','authenticated','sandak-teacher@test.invalid','{"full_name":"SanDai Teacher","requested_role":"teacher"}'),
 ('a8200000-0000-4000-8000-000000000007','authenticated','authenticated','sandak-suspended@test.invalid','{"full_name":"SanDai Suspended","requested_role":"student"}'),
 ('a8200000-0000-4000-8000-000000000008','authenticated','authenticated','sandak-admin@test.invalid','{"full_name":"SanDai Admin","requested_role":"student"}');
set local session_replication_role=replica;
update public.profiles set status='suspended' where id='a8200000-0000-4000-8000-000000000007';
update public.profiles set role='admin' where id='a8200000-0000-4000-8000-000000000008';
set local session_replication_role=origin;

set local role anon;
do $$ declare v_denied boolean:=false; begin
  begin perform public.sanad_reserve_request();
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'anon executed SanDai reserve RPC'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000007';
do $$ begin
  if public.sanad_reserve_request() is not null then raise exception 'suspended user reserved'; end if;
  begin perform 1 from dars_private.sandak_settings;
    raise exception 'authenticated role read SanDai settings';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000008';
do $$ begin
  if public.sanad_reserve_request() is not null then raise exception 'admin reserved'; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='';
do $$ begin
  if public.sanad_reserve_request() is not null then raise exception 'missing auth.uid reserved'; end if;
end $$;
reset role;

-- Any active student or teacher is eligible without an allowlist.
set local role authenticated;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000006';
do $$ declare a uuid; begin
  a:=public.sanad_reserve_request();
  if a is null then raise exception 'active teacher was not eligible'; end if;
  perform public.sanad_release_request(a);
end $$;
reset role;

-- Lease ownership, single in-flight request per user, expiry, and no refund.
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
do $$ declare a uuid; b uuid; n integer; begin
  a:=public.sanad_reserve_request();
  if a is null or public.sanad_reserve_request() is not null then raise exception 'user in-flight cap failed'; end if;
  perform public.sanad_release_request(a);
  select accepted_requests into n from dars_private.sandak_user_daily_usage where user_id=auth.uid();
  if n<>1 then raise exception 'release refunded request budget'; end if;
  a:=public.sanad_reserve_request(); perform public.sanad_release_request(a);
  b:=public.sanad_reserve_request();
  perform set_config('request.jwt.claim.sub','a8200000-0000-4000-8000-000000000002',true);
  perform public.sanad_release_request(b);
  perform set_config('request.jwt.claim.sub','a8200000-0000-4000-8000-000000000001',true);
  if not exists(select 1 from dars_private.sandak_request_leases where lease_id=b and user_id=auth.uid()) then
    raise exception 'another user released an owned lease'; end if;
  update dars_private.sandak_request_leases set expires_at=clock_timestamp()-interval '1 second' where lease_id=b;
  a:=public.sanad_reserve_request();
  if a is null or exists(select 1 from dars_private.sandak_request_leases where lease_id=b) then raise exception 'expired lease not pruned'; end if;
  perform public.sanad_release_request(a);
end $$;

-- Defaults: ten per UTC minute, then 60 per UTC day. The stale minute bucket
-- isolates the daily assertion from the minute cap.
delete from dars_private.sandak_user_daily_usage;
delete from dars_private.sandak_global_daily_usage; delete from dars_private.sandak_request_leases;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000002';
do $$ declare i int; a uuid; begin
  for i in 1..10 loop
    a:=public.sanad_reserve_request(); if a is null then raise exception 'minute quota rejected %',i; end if;
    perform public.sanad_release_request(a);
  end loop;
  if public.sanad_reserve_request() is not null then raise exception '11th minute request accepted'; end if;
end $$;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000001';
do $$ declare i int; a uuid; d date:=(clock_timestamp() at time zone 'UTC')::date; begin
  for i in 1..60 loop
    a:=public.sanad_reserve_request(); if a is null then raise exception 'daily quota rejected %',i; end if;
    perform public.sanad_release_request(a);
    update dars_private.sandak_user_daily_usage set minute_start=minute_start-interval '2 minutes',minute_requests=0 where user_id=auth.uid();
  end loop;
  if public.sanad_reserve_request() is not null then raise exception '61st daily request accepted'; end if;
  if (select accepted_requests from dars_private.sandak_user_daily_usage where user_id=auth.uid() and utc_day=d)<>60 then raise exception 'daily count mismatch'; end if;
end $$;

-- Explicit (environment) limits override the defaults, and are clamped to at least one.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000003';
do $$ declare a uuid; begin
  a:=public.sanad_reserve_request(5,2,100,5); perform public.sanad_release_request(a);
  a:=public.sanad_reserve_request(5,2,100,5); perform public.sanad_release_request(a);
  if public.sanad_reserve_request(5,2,100,5) is not null then raise exception 'explicit minute limit ignored'; end if;
  if public.sanad_reserve_request(0,0,0,0) is not null then raise exception 'zero limits did not clamp to one'; end if;
end $$;

-- Global in-flight cap (explicit limit of 3 with three users), then the default global daily limit.
delete from dars_private.sandak_user_daily_usage; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_request_leases;
do $$ declare u uuid; a uuid; begin
 foreach u in array array['a8200000-0000-4000-8000-000000000001'::uuid,'a8200000-0000-4000-8000-000000000002'::uuid,'a8200000-0000-4000-8000-000000000003'::uuid] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
      a:=public.sanad_reserve_request(60,10,3000,3);
   if a is null then raise exception 'global lease unexpectedly denied'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub','a8200000-0000-4000-8000-000000000004',true);
  if public.sanad_reserve_request(60,10,3000,3) is not null then raise exception 'fourth global in-flight request accepted'; end if;
end $$;

delete from dars_private.sandak_request_leases; delete from dars_private.sandak_global_daily_usage;
delete from dars_private.sandak_user_daily_usage;
insert into dars_private.sandak_global_daily_usage(utc_day,accepted_requests)
values ((clock_timestamp() at time zone 'UTC')::date,2999);
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000005';
do $$ declare a uuid; begin
 a:=public.sanad_reserve_request(); if a is null then raise exception 'global 3000th request denied'; end if;
 perform public.sanad_release_request(a);
 if public.sanad_reserve_request() is not null then raise exception '3001st global request accepted'; end if;
end $$;

-- Runtime day rollover: old daily budgets are discarded, while an outstanding
-- lease still blocks a request until its owner releases it.
delete from dars_private.sandak_request_leases;
delete from dars_private.sandak_user_daily_usage;
delete from dars_private.sandak_global_daily_usage;
insert into dars_private.sandak_user_daily_usage(user_id,utc_day,accepted_requests,minute_start,minute_requests)
values ('a8200000-0000-4000-8000-000000000004',(clock_timestamp() at time zone 'UTC')::date-1,60,clock_timestamp(),10);
insert into dars_private.sandak_global_daily_usage(utc_day,accepted_requests)
values ((clock_timestamp() at time zone 'UTC')::date-1,3000);
insert into dars_private.sandak_request_leases(user_id,expires_at)
values ('a8200000-0000-4000-8000-000000000004',clock_timestamp()+interval '45 seconds');
set local request.jwt.claim.sub='a8200000-0000-4000-8000-000000000004';
do $$ declare a uuid; d date:=(clock_timestamp() at time zone 'UTC')::date; begin
  if public.sanad_reserve_request() is not null then raise exception 'active lease did not survive UTC day rollover'; end if;
  if not exists(select 1 from dars_private.sandak_request_leases where user_id=auth.uid()) then raise exception 'day rollover cleared active lease'; end if;
  if exists(select 1 from dars_private.sandak_user_daily_usage where user_id=auth.uid() and utc_day<d)
     or exists(select 1 from dars_private.sandak_global_daily_usage where utc_day<d) then raise exception 'old UTC day counters were not pruned'; end if;
  perform public.sanad_release_request((select lease_id from dars_private.sandak_request_leases where user_id=auth.uid()));
  a:=public.sanad_reserve_request(); if a is null then raise exception 'fresh UTC day quota was not available'; end if;
  if (select accepted_requests from dars_private.sandak_user_daily_usage where user_id=auth.uid() and utc_day=d)<>1
     or (select accepted_requests from dars_private.sandak_global_daily_usage where utc_day=d)<>1 then
    raise exception 'new UTC day did not start at one accepted request'; end if;
  perform public.sanad_release_request(a);
end $$;

rollback;
select 'SanDai quota permissions, eligibility, lease ownership, and rate limit assertions passed' as result;
