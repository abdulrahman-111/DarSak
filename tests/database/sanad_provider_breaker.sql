\set ON_ERROR_STOP on
begin;
do $$begin
  if to_regclass('dars_private.sanad_provider_circuit') is null
     or to_regclass('dars_private.sanad_provider_attempts') is null
     or to_regprocedure('public.sanad_provider_claim()') is null
     or to_regprocedure('public.sanad_provider_finish(uuid,text)') is null then
    raise exception 'provider breaker schema is incomplete';
  end if;
  if has_table_privilege('anon','dars_private.sanad_provider_circuit','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','dars_private.sanad_provider_circuit','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.sanad_provider_circuit','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','dars_private.sanad_provider_attempts','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','dars_private.sanad_provider_attempts','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role','dars_private.sanad_provider_attempts','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'provider breaker tables have direct role grants';
  end if;
  if not (select relrowsecurity from pg_class where oid='dars_private.sanad_provider_circuit'::regclass)
     or not (select relrowsecurity from pg_class where oid='dars_private.sanad_provider_attempts'::regclass) then
    raise exception 'provider breaker tables must have RLS enabled';
  end if;
  if has_function_privilege('anon','public.sanad_provider_claim()','EXECUTE')
     or has_function_privilege('authenticated','public.sanad_provider_claim()','EXECUTE')
     or has_function_privilege('anon','public.sanad_provider_finish(uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.sanad_provider_finish(uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','public.sanad_provider_claim()','EXECUTE')
     or not has_function_privilege('service_role','public.sanad_provider_finish(uuid,text)','EXECUTE') then
    raise exception 'provider breaker RPC grants are unsafe';
  end if;
  if not (select prosecdef from pg_proc where oid='public.sanad_provider_claim()'::regprocedure)
     or not (select prosecdef from pg_proc where oid='public.sanad_provider_finish(uuid,text)'::regprocedure)
     or not (select proconfig @> array['search_path=pg_catalog, public, dars_private, auth'] from pg_proc where oid='public.sanad_provider_claim()'::regprocedure)
     or not (select proconfig @> array['search_path=pg_catalog, public, dars_private, auth'] from pg_proc where oid='public.sanad_provider_finish(uuid,text)'::regprocedure) then
    raise exception 'provider breaker RPCs need fixed definer paths';
  end if;
end$$;

set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare c jsonb; a uuid; b uuid; v_open timestamptz; i integer;
begin
  update dars_private.sanad_provider_circuit set generation=1,quota_failures=0,open_until=null,probe_attempt=null,probe_lease_until=null where singleton;
  delete from dars_private.sanad_provider_attempts;

  for i in 1..2 loop
    c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
    perform public.sanad_provider_finish(a,'quota_error');
  end loop;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
  perform public.sanad_provider_finish(a,'success');
  if (select quota_failures from dars_private.sanad_provider_circuit where singleton)<>0 then raise exception 'success did not reset quota failure streak'; end if;

  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid; perform public.sanad_provider_finish(a,'other_error');
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid; perform public.sanad_provider_finish(a,'cancelled');
  for i in 1..4 loop
    c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid; perform public.sanad_provider_finish(a,'quota_error');
  end loop;
  if (select quota_failures from dars_private.sanad_provider_circuit where singleton)<>4
     or (select open_until from dars_private.sanad_provider_circuit where singleton) is not null then raise exception 'circuit opened before five quota errors'; end if;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid; perform public.sanad_provider_finish(a,'quota_error');
  select open_until into v_open from dars_private.sanad_provider_circuit where singleton;
  if v_open is null or v_open<clock_timestamp()+interval '14 minutes 59 seconds' or v_open>clock_timestamp()+interval '15 minutes 1 second' then raise exception 'fifth quota failure did not open circuit for 15 minutes'; end if;
  perform public.sanad_provider_finish(a,'success');
  if (select open_until from dars_private.sanad_provider_circuit where singleton)is distinct from v_open then raise exception 'replayed attempt changed opened circuit'; end if;
  c:=public.sanad_provider_claim();
  if (c->>'allowed')::boolean or (c->>'attempt') is not null or (c->>'retry_after')::integer<1 then raise exception 'open circuit did not deny claim with retry delay'; end if;

  update dars_private.sanad_provider_circuit set open_until=clock_timestamp()-interval '1 second' where singleton;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
  if not (c->>'allowed')::boolean or a is null then raise exception 'recovery probe was not allowed'; end if;
  c:=public.sanad_provider_claim();
  if (c->>'allowed')::boolean or (c->>'attempt') is not null or (c->>'retry_after')::integer<1 then raise exception 'second recovery claim bypassed probe lease'; end if;
  update dars_private.sanad_provider_circuit set probe_lease_until=clock_timestamp()-interval '1 second' where singleton;
  c:=public.sanad_provider_claim(); b:=(c->>'attempt')::uuid;
  if not (c->>'allowed')::boolean or b is null or b=a then raise exception 'expired probe lease was not recovered'; end if;
  perform public.sanad_provider_finish(a,'success');
  if (select probe_attempt from dars_private.sanad_provider_circuit where singleton)is distinct from b
     or (select open_until from dars_private.sanad_provider_circuit where singleton)is null then raise exception 'stale probe completion cleared current circuit'; end if;

  perform public.sanad_provider_finish(b,'cancelled');
  if (select probe_attempt from dars_private.sanad_provider_circuit where singleton)is not null
     or (select open_until from dars_private.sanad_provider_circuit where singleton)>=clock_timestamp() then raise exception 'cancelled probe did not release lease without extending cooldown'; end if;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
  if not (c->>'allowed')::boolean or a is null then raise exception 'cancelled probe did not permit immediate new probe'; end if;
  perform public.sanad_provider_finish(a,'other_error');
  if (select open_until from dars_private.sanad_provider_circuit where singleton)<clock_timestamp()+interval '14 minutes 59 seconds'
     or (select probe_attempt from dars_private.sanad_provider_circuit where singleton)is not null then raise exception 'unsuccessful probe did not release and restart cooldown'; end if;

  update dars_private.sanad_provider_circuit set open_until=clock_timestamp()-interval '1 second' where singleton;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid; perform public.sanad_provider_finish(a,'success');
  if (select open_until from dars_private.sanad_provider_circuit where singleton)is not null
     or (select quota_failures from dars_private.sanad_provider_circuit where singleton)<>0 then raise exception 'successful probe did not close circuit'; end if;

  -- A regular attempt from an older generation cannot undo a newer open circuit.
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
  for i in 1..5 loop
    c:=public.sanad_provider_claim(); b:=(c->>'attempt')::uuid;
    perform public.sanad_provider_finish(b,'quota_error');
  end loop;
  select open_until into v_open from dars_private.sanad_provider_circuit where singleton;
  perform public.sanad_provider_finish(a,'success');
  if (select open_until from dars_private.sanad_provider_circuit where singleton)is distinct from v_open then raise exception 'stale regular success cleared newer open circuit'; end if;

  -- Expired regular and probe attempts are harmless, even if their generation/token still matches.
  update dars_private.sanad_provider_circuit set open_until=null,probe_attempt=null,probe_lease_until=null,quota_failures=0 where singleton;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
  update dars_private.sanad_provider_attempts set expires_at=clock_timestamp()-interval '1 second' where attempt_id=a;
  perform public.sanad_provider_finish(a,'quota_error');
  if (select quota_failures from dars_private.sanad_provider_circuit where singleton)<>0 then raise exception 'expired regular attempt changed failure count'; end if;
  update dars_private.sanad_provider_circuit set open_until=clock_timestamp()-interval '1 second' where singleton;
  c:=public.sanad_provider_claim(); a:=(c->>'attempt')::uuid;
  update dars_private.sanad_provider_attempts set expires_at=clock_timestamp()-interval '1 second' where attempt_id=a;
  perform public.sanad_provider_finish(a,'success');
  if (select probe_attempt from dars_private.sanad_provider_circuit where singleton)is distinct from a
     or (select open_until from dars_private.sanad_provider_circuit where singleton)>=clock_timestamp() then raise exception 'expired probe changed circuit state'; end if;

  begin perform public.sanad_provider_finish(gen_random_uuid(),'quota_error');
  exception when others then raise exception 'unknown attempt should be a harmless replay'; end;
  begin perform public.sanad_provider_finish(gen_random_uuid(),null); raise exception 'NULL outcome accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.sanad_provider_finish(gen_random_uuid(),'unbounded'); raise exception 'invalid outcome accepted';
  exception when invalid_parameter_value then null; end;
end$$;

set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}';
set local role authenticated;
do $$begin
  begin perform public.sanad_provider_claim(); raise exception 'authenticated role claimed breaker'; exception when insufficient_privilege then null; end;
  begin perform public.sanad_provider_finish(gen_random_uuid(),'quota_error'); raise exception 'authenticated role recorded failure'; exception when insufficient_privilege then null; end;
  begin perform 1 from dars_private.sanad_provider_circuit; raise exception 'authenticated role read private state'; exception when insufficient_privilege then null; end;
end$$;
reset role;
-- EXECUTE privilege alone is insufficient when the JWT role claim is not service_role.
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}';
set local role service_role;
do $$begin
  begin perform public.sanad_provider_claim(); raise exception 'service_role connection with authenticated JWT passed claim guard'; exception when insufficient_privilege then null; end;
  begin perform public.sanad_provider_finish(gen_random_uuid(),'quota_error'); raise exception 'service_role connection with authenticated JWT passed finish guard'; exception when insufficient_privilege then null; end;
end$$;
reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$begin
  begin perform public.sanad_provider_claim(); raise exception 'anon claimed breaker'; exception when insufficient_privilege then null; end;
  begin perform 1 from dars_private.sanad_provider_attempts; raise exception 'anon read private attempts'; exception when insufficient_privilege then null; end;
end$$;
reset role;
rollback;
