\set ON_ERROR_STOP on
begin;
do $$
declare
  v_teacher_id uuid := gen_random_uuid();
  v_group_id uuid := gen_random_uuid();
  v_slot_id uuid := gen_random_uuid();
  v_offering_id uuid;
  inserted integer;
  repeated integer;
  v_cancelled_id uuid;
  v_saved_ids uuid[];
begin
  select id into v_offering_id from public.offerings limit 1;
  if v_offering_id is null then raise exception 'seed an offering before recurring generation test'; end if;

  insert into auth.users(id,aud,role,email,raw_user_meta_data)
  values(v_teacher_id,'authenticated','authenticated',v_teacher_id::text||'@recurrence.test',
         jsonb_build_object('full_name','Recurring generation test','requested_role','teacher'));
  perform set_config('request.jwt.claim.sub',v_teacher_id::text,true);
  insert into public.groups(id,teacher_id,offering_id,name,capacity)
  values(v_group_id,v_teacher_id,v_offering_id,'Recurring generation regression',1);
  insert into public.group_schedule_slots(id,group_id,weekday,start_time,end_time)
  values(v_slot_id,v_group_id,0,'18:00','20:00');

  inserted := public.generate_lessons(v_group_id,'2027-02-01','2027-02-14');
  if inserted <> 2 then raise exception 'first generation inserted %, expected 2',inserted; end if;
  if (select array_agg(l.local_date order by l.local_date) from public.lessons l where l.group_id=v_group_id)
     is distinct from array['2027-02-07'::date,'2027-02-14'::date] then
    raise exception 'generated local dates did not match the Sunday schedule';
  end if;
  if not exists(select 1 from public.lessons l where l.group_id=v_group_id and l.local_date='2027-02-07'
                and starts_at='2027-02-07 16:00:00+00'::timestamptz and ends_at='2027-02-07 18:00:00+00'::timestamptz) then
    raise exception 'generated timestamp did not match Africa/Cairo';
  end if;
  select array_agg(l.id order by l.local_date) into v_saved_ids from public.lessons l where l.group_id=v_group_id;

  repeated := public.generate_lessons(v_group_id,'2027-02-01','2027-02-14');
  if repeated <> 0 then raise exception 'repeat generation inserted %, expected 0',repeated; end if;
  if (select array_agg(l.id order by l.local_date) from public.lessons l where l.group_id=v_group_id) is distinct from v_saved_ids then
    raise exception 'repeat generation changed occurrence IDs';
  end if;

  select l.id into v_cancelled_id from public.lessons l where l.group_id=v_group_id and l.local_date='2027-02-14';
  perform public.set_lesson_status(v_cancelled_id,'cancelled');
  repeated := public.generate_lessons(v_group_id,'2027-02-14','2027-02-21');
  if repeated <> 1 then raise exception 'overlapping range inserted %, expected only Feb 21',repeated; end if;
  if not exists(select 1 from public.lessons l where l.id=v_cancelled_id and l.status='cancelled' and l.local_date='2027-02-14') then
    raise exception 'generation restored a cancelled occurrence';
  end if;
  if (select count(*) from public.lessons l where l.group_id=v_group_id) <> 3 then
    raise exception 'overlapping generation created duplicate occurrences';
  end if;
  raise notice 'recurring generation assertions passed';
end $$;
rollback;
