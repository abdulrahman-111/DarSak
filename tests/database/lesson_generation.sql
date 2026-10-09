\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regprocedure('public.set_lesson_exclusions(uuid,date[])') is null then
    raise exception 'set_lesson_exclusions(uuid,date[]) is not installed';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('50000000-0000-4000-8000-000000000001','authenticated','authenticated','generation-owner@regression.test','{"full_name":"Generation owner","requested_role":"teacher"}'),
 ('50000000-0000-4000-8000-000000000002','authenticated','authenticated','generation-other@regression.test','{"full_name":"Generation other","requested_role":"teacher"}');
insert into public.groups(id,teacher_id,offering_id,name,capacity)
select g.id,g.teacher_id,o.id,g.name,5 from (values
 ('51000000-0000-4000-8000-000000000001'::uuid,'50000000-0000-4000-8000-000000000001'::uuid,'generation main'),
 ('51000000-0000-4000-8000-000000000002'::uuid,'50000000-0000-4000-8000-000000000001'::uuid,'generation peer'),
 ('51000000-0000-4000-8000-000000000003'::uuid,'50000000-0000-4000-8000-000000000002'::uuid,'generation foreign'),
 ('51000000-0000-4000-8000-000000000004'::uuid,'50000000-0000-4000-8000-000000000001'::uuid,'generation Cairo gap'),
 ('51000000-0000-4000-8000-000000000005'::uuid,'50000000-0000-4000-8000-000000000001'::uuid,'generation Cairo fold')
) as g(id,teacher_id,name) cross join lateral (select id from public.offerings limit 1) o;
insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time) values
 ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',0,'18:00','20:00'),
 ('52000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002',0,'18:00','20:00'),
 ('52000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000003',0,'18:00','20:00'),
 ('52000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000004',5,'00:30','01:00'),
 ('52000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000005',4,'23:30','23:59');
insert into public.lessons(id,group_id,slot_id,local_date,title,starts_at,ends_at,status) values
 ('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002',null,null,'Later batch conflict','2027-03-14 16:30+00','2027-03-14 17:30+00','scheduled'),
 ('53000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','2027-04-11','Cancelled generated conflict','2027-04-11 16:30+00','2027-04-11 17:30+00','cancelled'),
 ('53000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001',null,null,'Cancelled manual restore','2027-03-21 16:30+00','2027-03-21 17:30+00','cancelled'),
 ('53000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000002',null,null,'Restore conflict','2027-04-11 16:45+00','2027-04-11 17:45+00','scheduled');

do $$
declare
  v_group uuid := '51000000-0000-4000-8000-000000000001';
  v_other uuid := '51000000-0000-4000-8000-000000000003';
  v_gap_group uuid := '51000000-0000-4000-8000-000000000004';
  v_fold_group uuid := '51000000-0000-4000-8000-000000000005';
  v_slot uuid := '52000000-0000-4000-8000-000000000001';
  v_signature text;
  v_source text;
  v_advisory_pos integer;
  v_row_lock_pos integer;
  v_lesson uuid;
  v_count integer;
  v_ids uuid[];
begin
  perform set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
  if has_table_privilege('authenticated','public.group_lesson_exclusions','INSERT,UPDATE,DELETE') then
    raise exception 'authenticated users can directly mutate exclusions';
  end if;
  if not has_function_privilege('authenticated','public.set_lesson_exclusions(uuid,date[])','EXECUTE')
     or has_function_privilege('anon','public.set_lesson_exclusions(uuid,date[])','EXECUTE') then
    raise exception 'exclusion RPC grants are incorrect';
  end if;
  foreach v_signature in array array[
    'public.save_schedule_slot(uuid,integer,time without time zone,time without time zone,uuid)',
    'public.create_lesson(uuid,text,timestamp with time zone,timestamp with time zone,text,uuid)',
    'public.set_lesson_status(uuid,text)',
    'public.set_lesson_exclusions(uuid,date[])',
    'public.generate_lessons(uuid,date,date)'
  ] loop
    select p.prosrc into v_source from pg_proc p where p.oid=v_signature::regprocedure;
    v_advisory_pos := position('pg_advisory_xact_lock' in v_source);
    v_row_lock_pos := position('for update' in v_source);
    if v_advisory_pos=0 or v_row_lock_pos=0 or v_row_lock_pos<v_advisory_pos then
      raise exception 'calendar lock must precede row locks in %',v_signature;
    end if;
  end loop;

  perform public.set_lesson_exclusions(v_group,array['2027-02-14'::date,'2027-02-21'::date,'2027-02-14'::date]);
  if (select count(*) from public.group_lesson_exclusions e where e.group_id=v_group)<>2 then
    raise exception 'exclusions were not saved distinctly';
  end if;
  v_count := public.generate_lessons(v_group,'2027-02-01','2027-02-14');
  if v_count<>1 or (select count(*) from public.lessons l where l.group_id=v_group and l.local_date between '2027-02-01' and '2027-02-14')<>1 then
    raise exception 'generation did not skip the excluded occurrence';
  end if;
  perform public.set_lesson_exclusions(v_group,'{}'::date[]);
  if exists(select 1 from public.group_lesson_exclusions e where e.group_id=v_group) then
    raise exception 'empty exclusion list did not clear exclusions';
  end if;
  v_count := public.generate_lessons(v_group,'2027-02-14','2027-02-14');
  if v_count<>1 then raise exception 'generation after clearing exclusions did not create occurrence'; end if;
  select array_agg(l.id order by l.local_date) into v_ids from public.lessons l where l.group_id=v_group and l.local_date in ('2027-02-07','2027-02-14');

  select l.id into v_lesson from public.lessons l where l.group_id=v_group and l.local_date='2027-02-07';
  perform public.create_lesson(v_group,'Moved generated lesson','2027-02-07 17:00+00','2027-02-07 18:00+00','',v_lesson);
  if not exists(select 1 from public.lessons l where l.id=v_lesson and l.slot_id=v_slot and l.local_date='2027-02-07' and l.starts_at='2027-02-07 17:00+00') then
    raise exception 'rescheduling changed generated occurrence identity';
  end if;
  if public.generate_lessons(v_group,'2027-02-07','2027-02-07')<>0
     or (select array_agg(l.id order by l.local_date) from public.lessons l where l.group_id=v_group and l.local_date in ('2027-02-07','2027-02-14')) is distinct from v_ids then
    raise exception 'generation recreated a rescheduled occurrence';
  end if;
  perform public.set_lesson_status(v_lesson,'completed');
  if public.generate_lessons(v_group,'2027-02-07','2027-02-07')<>0
     or not exists(select 1 from public.lessons l where l.id=v_lesson and l.status='completed') then
    raise exception 'generation recreated a completed occurrence';
  end if;

  begin
    perform public.generate_lessons(v_group,'2027-03-07','2027-03-14');
    raise exception 'generation accepted a later conflict';
  exception when others then
    if sqlerrm='generation accepted a later conflict' then raise; end if;
    if position('generated lesson overlaps' in sqlerrm)=0 then raise; end if;
  end;
  if exists(select 1 from public.lessons l where l.group_id=v_group and l.local_date='2027-03-07') then
    raise exception 'batch conflict left an earlier generated occurrence behind';
  end if;

  begin
    perform public.set_lesson_exclusions(v_group,array(select date '2027-04-01' + n from generate_series(1,367) n));
    raise exception 'more than 366 exclusions were accepted';
  exception when others then
    if sqlerrm='more than 366 exclusions were accepted' then raise; end if;
  end;
  begin
    perform public.set_lesson_exclusions(v_group,array[date '2027-04-01',null]::date[]);
    raise exception 'NULL exclusion was accepted';
  exception when others then
    if sqlerrm='NULL exclusion was accepted' then raise; end if;
  end;
  begin
    perform public.set_lesson_exclusions(v_group,array[date 'infinity',date '-infinity']);
    raise exception 'infinite exclusion dates were accepted';
  exception when others then
    if sqlerrm='infinite exclusion dates were accepted' then raise; end if;
    if position('finite' in lower(sqlerrm))=0 then raise; end if;
  end;
  begin
    perform public.set_lesson_exclusions(v_group,null::date[]);
    raise exception 'NULL exclusion list was accepted';
  exception when others then
    if sqlerrm='NULL exclusion list was accepted' then raise; end if;
  end;
  begin
    perform public.set_lesson_exclusions(v_other,array[]::date[]);
    raise exception 'foreign exclusion write was accepted';
  exception when others then
    if sqlerrm='foreign exclusion write was accepted' then raise; end if;
  end;

  perform public.set_lesson_exclusions(v_gap_group,array['2027-04-30'::date]);
  if public.generate_lessons(v_gap_group,'2027-04-30','2027-04-30')<>0
     or exists(select 1 from public.lessons l where l.group_id=v_gap_group and l.local_date='2027-04-30') then
    raise exception 'excluded Cairo gap occurrence was generated';
  end if;
  perform public.set_lesson_exclusions(v_gap_group,'{}'::date[]);
  begin
    perform public.generate_lessons(v_gap_group,'2027-04-30','2027-04-30');
    raise exception 'generation accepted a nonexistent Cairo local time';
  exception when sqlstate '22007' then null; end;
  begin
    perform public.generate_lessons(v_fold_group,'2027-10-28','2027-10-28');
    raise exception 'generation accepted an ambiguous Cairo local time';
  exception when sqlstate '22007' then null; end;
  begin
    perform public.generate_lessons(v_group,null,'2027-02-07');
    raise exception 'generation accepted a NULL range';
  exception when others then
    if sqlerrm='generation accepted a NULL range' then raise; end if;
  end;
  begin
    perform public.generate_lessons(v_group,'infinity','infinity');
    raise exception 'infinite generation range was accepted';
  exception when others then
    if sqlerrm='infinite generation range was accepted' then raise; end if;
    if position('finite' in lower(sqlerrm))=0 then raise; end if;
  end;
  begin
    perform public.generate_lessons(v_group,'2027-02-08','2027-02-07');
    raise exception 'generation accepted a reversed range';
  exception when others then
    if sqlerrm='generation accepted a reversed range' then raise; end if;
  end;
  begin
    perform public.generate_lessons(v_group,'2027-02-01','2027-05-03');
    raise exception 'generation accepted a range longer than 90 days';
  exception when others then
    if sqlerrm='generation accepted a range longer than 90 days' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
  begin
    perform public.create_lesson(v_other,'Infinite lesson','-infinity','infinity','');
    raise exception 'nonfinite lesson interval was accepted';
  exception when others then
    if sqlerrm='nonfinite lesson interval was accepted' then raise; end if;
    if position('finite' in lower(sqlerrm))=0 then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
  begin
    perform public.set_lesson_status('53000000-0000-4000-8000-000000000002','scheduled');
    raise exception 'cancelled generated lesson was restored into an overlap';
  exception when others then
    if sqlerrm='cancelled generated lesson was restored into an overlap' then raise; end if;
    if position('overlap' in lower(sqlerrm))=0 then raise; end if;
  end;
  begin
    perform public.set_lesson_status('53000000-0000-4000-8000-000000000002','completed');
    raise exception 'cancelled generated lesson was completed into an overlap';
  exception when others then
    if sqlerrm='cancelled generated lesson was completed into an overlap' then raise; end if;
    if position('overlap' in lower(sqlerrm))=0 then raise; end if;
  end;
  perform public.set_lesson_status('53000000-0000-4000-8000-000000000003','scheduled');
  if (select status from public.lessons where id='53000000-0000-4000-8000-000000000003')<>'scheduled' then
    raise exception 'non-overlapping cancelled lesson did not restore';
  end if;
  raise notice 'lesson generation and exclusion assertions passed';
end $$;
rollback;
