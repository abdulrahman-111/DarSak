begin;

create or replace function public.delete_schedule_slot(
  p_group_id uuid,
  p_slot_id uuid
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_group_status public.group_status;
  v_slot_group_id uuid;
  v_slot_count integer;
begin
  select g.teacher_id into v_teacher_id
  from public.groups g
  where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));

  select g.teacher_id,g.status into v_locked_teacher_id,v_group_status
  from public.groups g
  where g.id=p_group_id
  for update;
  if v_locked_teacher_id is null or v_locked_teacher_id is distinct from v_teacher_id then
    raise exception 'group teacher changed';
  end if;
  if public.current_role() is distinct from 'admin'::public.user_role
     and not public.is_group_owner(p_group_id) then
    raise exception 'not authorized';
  end if;

  select s.group_id into v_slot_group_id
  from public.group_schedule_slots s
  where s.id=p_slot_id
  for update;
  if v_slot_group_id is null then raise exception 'slot not found'; end if;
  if v_slot_group_id is distinct from p_group_id then
    raise exception 'slot belongs to another group';
  end if;

  if exists(select 1 from public.lessons l where l.slot_id=p_slot_id) then
    raise exception 'schedule slot has generated lessons';
  end if;

  if v_group_status='published'::public.group_status then
    select count(*) into v_slot_count
    from public.group_schedule_slots s
    where s.group_id=p_group_id;
    if v_slot_count<=1 then
      raise exception 'published group must keep at least one schedule slot';
    end if;
  end if;

  delete from public.group_schedule_slots s
  where s.id=p_slot_id and s.group_id=p_group_id;
  if not found then raise exception 'slot not found'; end if;
end
$$;

revoke all on function public.delete_schedule_slot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_schedule_slot(uuid,uuid) to authenticated;

commit;
