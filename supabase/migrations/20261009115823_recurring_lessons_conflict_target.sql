create or replace function public.generate_lessons(p_group_id uuid,p_from date,p_until date) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare teacher uuid; d date; s record; a timestamptz; b timestamptz; bad boolean; made int:=0;
begin
 if public.current_role() is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
 if p_until<p_from or p_until-p_from>90 then raise exception 'range must be 0 to 90 days'; end if;
 select teacher_id into teacher from public.groups where id=p_group_id;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher::text,0));
 for d in select generate_series(p_from,p_until,'1 day'::interval)::date loop
  for s in select * from public.group_schedule_slots where group_id=p_group_id and weekday=extract(dow from d)::int loop
   a := (d+s.start_time) at time zone 'Africa/Cairo'; b := (d+s.end_time) at time zone 'Africa/Cairo';
   select exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=teacher and l.status<>'cancelled' and l.starts_at<b and l.ends_at>a and not(l.group_id=p_group_id and l.slot_id=s.id and l.local_date=d)) into bad;
   if bad then raise exception 'generated lesson overlaps on %',d; end if;
   insert into public.lessons(group_id,slot_id,local_date,title,starts_at,ends_at) values(p_group_id,s.id,d,'Scheduled lesson',a,b)
    on conflict(group_id,slot_id,local_date) where slot_id is not null and local_date is not null do nothing;
   if found then made:=made+1; end if;
  end loop;
 end loop; return made;
end $$;
