\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regprocedure('public.preview_lesson_generation(uuid,date,date)') is null then
    raise exception 'preview_lesson_generation(uuid,date,date) is not installed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('40000000-0000-4000-8000-000000000001','authenticated','authenticated','preview-owner@regression.test','{"full_name":"Preview owner","requested_role":"teacher"}'),
 ('40000000-0000-4000-8000-000000000002','authenticated','authenticated','preview-other@regression.test','{"full_name":"Other owner","requested_role":"teacher"}'),
 ('40000000-0000-4000-8000-000000000003','authenticated','authenticated','preview-admin@regression.test','{"full_name":"Preview admin","requested_role":"student"}');
set local session_replication_role = replica;
update public.profiles set role='admin' where id='40000000-0000-4000-8000-000000000003';
set local session_replication_role = origin;

insert into public.groups(id,teacher_id,offering_id,name,capacity) select g.id,g.teacher_id,o.id,g.name,g.capacity from (values
 ('41000000-0000-4000-8000-000000000001'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner main',5),
 ('41000000-0000-4000-8000-000000000002'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner conflict peer',5),
 ('41000000-0000-4000-8000-000000000003'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner empty',5),
 ('41000000-0000-4000-8000-000000000004'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner gap',5),
 ('41000000-0000-4000-8000-000000000005'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner overlap',5),
 ('41000000-0000-4000-8000-000000000006'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'foreign owner',5),
 ('41000000-0000-4000-8000-000000000007'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner excluded gap',5),
 ('41000000-0000-4000-8000-000000000008'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner midnight end',5),
 ('41000000-0000-4000-8000-000000000009'::uuid,'40000000-0000-4000-8000-000000000001'::uuid,'owner manual only',5)
) as g(id,teacher_id,name,capacity) cross join lateral (select id from public.offerings limit 1) o;

insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',0,'18:00','19:00'),
 ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002',0,'18:00','19:00'),
 ('42000000-0000-4000-8000-000000000006','41000000-0000-4000-8000-000000000006',0,'18:00','19:00'),
 ('42000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000004',5,'00:30','01:00'),
 ('42000000-0000-4000-8000-000000000005','41000000-0000-4000-8000-000000000005',4,'23:30','23:59'),
 ('42000000-0000-4000-8000-000000000007','41000000-0000-4000-8000-000000000007',5,'00:30','01:00'),
 ('42000000-0000-4000-8000-000000000008','41000000-0000-4000-8000-000000000008',0,'23:00','24:00'),
 ('42000000-0000-4000-8000-000000000009','41000000-0000-4000-8000-000000000009',0,'18:00','19:00');

insert into public.lessons(id,group_id,slot_id,local_date,title,starts_at,ends_at,status) values
 ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','2027-02-07','Completed generated','2027-02-07 15:01+00','2027-02-07 16:01+00','completed'),
 ('43000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','2027-03-07','Cancelled generated','2027-03-07 14:00+00','2027-03-07 15:00+00','cancelled'),
 ('43000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000001',null,null,'Manual overlap','2027-02-14 16:30+00','2027-02-14 16:45+00','scheduled'),
 ('43000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000002',null,null,'Cross group overlap','2027-02-14 16:20+00','2027-02-14 16:40+00','scheduled'),
 ('43000000-0000-4000-8000-000000000005','41000000-0000-4000-8000-000000000001',null,null,'Adjacent endpoint','2027-02-28 15:00+00','2027-02-28 16:00+00','scheduled'),
 ('43000000-0000-4000-8000-000000000006','41000000-0000-4000-8000-000000000009',null,null,'Same group manual overlap','2027-03-14 16:30+00','2027-03-14 16:45+00','scheduled');
insert into public.group_lesson_exclusions(group_id,local_date) values
 ('41000000-0000-4000-8000-000000000001','2027-02-21'),
 ('41000000-0000-4000-8000-000000000001','2027-02-07'),
 ('41000000-0000-4000-8000-000000000001','2027-03-07'),
 ('41000000-0000-4000-8000-000000000007','2027-04-30');

do $$
declare before_count bigint;
begin
  if not exists(select 1 from pg_namespace where nspname='dars_private') then raise exception 'private schema missing'; end if;
  -- RLS needs this narrow boolean predicate to evaluate published-group eligibility.
  -- Namespace USAGE alone exposes no private rows; only the predicate is executable.
  if not has_schema_privilege('anon','dars_private','USAGE') or not has_schema_privilege('authenticated','dars_private','USAGE')
     or not has_function_privilege('anon','dars_private.teacher_has_access(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','dars_private.teacher_has_access(uuid)','EXECUTE') then
    raise exception 'private eligibility predicate grants are incorrect';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='dars_private' and c.relkind in ('r','p','v','m','f')
      and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT') or has_table_privilege('anon',c.oid,'UPDATE') or has_table_privilege('anon',c.oid,'DELETE')
        or has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT') or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))) then
    raise exception 'private table or view privileges are exposed';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='dars_private' and p.proname<>'teacher_has_access'
      and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then
    raise exception 'an unexpected private function is directly executable';
  end if;
  if has_function_privilege('anon','public.preview_lesson_generation(uuid,date,date)','EXECUTE')
     or not has_function_privilege('authenticated','public.preview_lesson_generation(uuid,date,date)','EXECUTE') then
    raise exception 'preview execution grants are incorrect';
  end if;
  if has_function_privilege('anon','dars_private.lesson_generation_candidates(uuid,date,date)','EXECUTE')
     or has_function_privilege('authenticated','dars_private.lesson_generation_candidates(uuid,date,date)','EXECUTE') then
    raise exception 'internal candidates are directly executable';
  end if;
  if not (select prosecdef from pg_proc where oid='public.preview_lesson_generation(uuid,date,date)'::regprocedure) then
    raise exception 'preview RPC must use security definer for private candidate access';
  end if;
  if has_table_privilege('authenticated','public.group_lesson_exclusions','INSERT,UPDATE,DELETE') then
    raise exception 'authenticated users can directly mutate exclusions';
  end if;

  select count(*) into before_count from public.lessons;
  perform set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
  set local role authenticated;
  if (select count(*) from public.preview_lesson_generation('41000000-0000-4000-8000-000000000003','2027-02-07','2027-02-07')) <> 0 then
    raise exception 'zero-slot group returned candidates';
  end if;
  if (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-07','2027-02-07')) <> 'already_generated'
     or (select starts_at from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-07','2027-02-07')) <> '2027-02-07 15:01+00'::timestamptz then
    raise exception 'completed generated identity and exclusion precedence did not preserve its stored time';
  end if;
  if (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-03-07','2027-03-07')) <> 'already_generated'
     or (select starts_at from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-03-07','2027-03-07')) <> '2027-03-07 14:00+00'::timestamptz then
    raise exception 'cancelled generated identity and exclusion precedence did not preserve its stored time';
  end if;
  if (select count(*) from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-07','2027-02-07')) <> 1 then
    raise exception 'inclusive single date should return one occurrence';
  end if;
  if (select starts_at from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-07-04','2027-07-04')) <> '2027-07-04 15:00+00'::timestamptz then
    raise exception 'summer Cairo timestamp should be 15:00 UTC';
  end if;
  if (select starts_at from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-28','2027-02-28')) <> '2027-02-28 16:00+00'::timestamptz
     or (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-28','2027-02-28')) <> 'ready' then
    raise exception 'adjacent manual lesson endpoint should remain ready';
  end if;
  if (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-14','2027-02-14')) <> 'conflicting'
     or (select conflict_lesson_id from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-14','2027-02-14')) <> '43000000-0000-4000-8000-000000000004'::uuid then
    raise exception 'cross group manual overlap needs deterministic conflict selection';
  end if;
  if (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000009','2027-03-14','2027-03-14')) <> 'conflicting'
     or (select conflict_lesson_id from public.preview_lesson_generation('41000000-0000-4000-8000-000000000009','2027-03-14','2027-03-14')) <> '43000000-0000-4000-8000-000000000006'::uuid then
    raise exception 'same group manual NULL-slot overlap was not returned as the conflict';
  end if;
  if (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-21','2027-02-21')) <> 'excluded' then
    raise exception 'saved exclusion should be returned without conversion';
  end if;
  if (select state from public.preview_lesson_generation('41000000-0000-4000-8000-000000000007','2027-04-30','2027-04-30')) <> 'excluded'
     or (select starts_at from public.preview_lesson_generation('41000000-0000-4000-8000-000000000007','2027-04-30','2027-04-30')) is not null then
    raise exception 'excluded DST gap date should skip conversion and have null timestamps';
  end if;
  reset role;

  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001',null,'2027-02-07');
    raise exception 'null range start was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-08','2027-02-07');
    raise exception 'reversed range was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000001','2027-02-01','2027-05-03');
    raise exception 'range longer than 90 days was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000004','2027-04-30','2027-04-30');
    raise exception 'nonexistent Cairo local time was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000005','2027-10-28','2027-10-28');
    raise exception 'ambiguous Cairo local time was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000008','2027-01-03','2027-01-03');
    raise exception '24:00 local end time was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    perform * from public.preview_lesson_generation('41000000-0000-4000-8000-000000000006','2027-02-07','2027-02-07');
    raise exception 'foreign preview was authorized';
  exception when sqlstate '42501' then null; end;
  if (select count(*) from public.lessons) <> before_count then raise exception 'preview inserted or changed lessons'; end if;
  raise notice 'lesson preview assertions passed';
end $$;

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$
begin
  if (select count(*) from public.preview_lesson_generation('41000000-0000-4000-8000-000000000006','2027-02-07','2027-02-07')) <> 1 then
    raise exception 'admin cannot preview another teacher group';
  end if;
end $$;
reset role;

rollback;
