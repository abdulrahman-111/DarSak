begin;

create or replace function public.duplicate_group(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_source public.groups;
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_actor_role public.user_role;
  v_teacher_role public.user_role;
  v_teacher_status public.user_status;
  v_name_prefix text;
  v_duplicate_name text;
  v_duplicate_id uuid;
begin
  select g.* into v_source from public.groups g where g.id=p_group_id;
  if not found then raise exception 'group not found'; end if;
  v_teacher_id:=v_source.teacher_id;
  v_actor_role:=public.current_role();
  if v_actor_role is null or (v_actor_role is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id)) then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.* into v_source
  from public.groups g where g.id=p_group_id for update;
  if not found or v_source.teacher_id is distinct from v_teacher_id then
    raise exception 'group teacher changed';
  end if;
  v_locked_teacher_id:=v_source.teacher_id;

  v_actor_role:=public.current_role();
  if v_actor_role is null or (v_actor_role is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id)) then
    raise exception 'not authorized';
  end if;
  select p.role,p.status into v_teacher_role,v_teacher_status
  from public.profiles p where p.id=v_locked_teacher_id;
  if v_teacher_role is distinct from 'teacher'::public.user_role
     or v_teacher_status is distinct from 'active'::public.user_status then
    raise exception 'source teacher must be active';
  end if;

  v_name_prefix:=rtrim(left(btrim(v_source.name),113));
  if v_name_prefix='' then v_name_prefix:='Group'; end if;
  v_duplicate_name:=v_name_prefix||' (copy)';

  insert into public.groups(teacher_id,offering_id,name,description,capacity,status,location)
  values(v_locked_teacher_id,v_source.offering_id,v_duplicate_name,v_source.description,v_source.capacity,'draft'::public.group_status,v_source.location)
  returning id into v_duplicate_id;
  return v_duplicate_id;
end
$$;

revoke all on function public.duplicate_group(uuid) from public,anon,authenticated,service_role;
grant execute on function public.duplicate_group(uuid) to authenticated;

commit;
