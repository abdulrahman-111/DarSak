begin;

create or replace function public.validate_group_publish()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_teacher_role public.user_role;
  v_teacher_status public.user_status;
  v_teacher_approved boolean;
  v_publish_owner name;
begin
  if new.status='published'::public.group_status then
    if tg_op='INSERT' or old.status is distinct from new.status then
      select pg_get_userbyid(p.proowner) into v_publish_owner
      from pg_catalog.pg_proc p
      where p.oid='public.publish_group(uuid,date,date)'::regprocedure;
      if v_publish_owner is null or current_user is distinct from v_publish_owner::text then
        raise exception 'published groups must be changed through publish_group';
      end if;
    end if;

    select p.role,p.status,t.approved
    into v_teacher_role,v_teacher_status,v_teacher_approved
    from public.profiles p
    join public.teacher_profiles t on t.id=p.id
    where p.id=new.teacher_id;
    if v_teacher_role is distinct from 'teacher'::public.user_role
       or v_teacher_status is distinct from 'active'::public.user_status
       or v_teacher_approved is distinct from true then
      raise exception 'only an active approved teacher may publish';
    end if;
    if new.name is null or btrim(new.name)='' then raise exception 'group name is required'; end if;
    if new.capacity not between 1 and 500 then raise exception 'group capacity is invalid'; end if;
    if not exists(select 1 from public.offerings o where o.id=new.offering_id) then raise exception 'group offering is invalid'; end if;
    if not exists(select 1 from public.group_schedule_slots s where s.group_id=new.id) then
      raise exception 'a schedule slot is required before publishing';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.publish_group(p_group_id uuid,p_from date default null,p_until date default null)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_actor_role public.user_role;
  v_teacher_role public.user_role;
  v_teacher_status public.user_status;
  v_teacher_approved boolean;
  v_name text;
  v_capacity integer;
  v_offering_id uuid;
  v_generated integer:=0;
begin
  if (p_from is null) is distinct from (p_until is null) then
    raise exception 'publication range must provide both dates or neither';
  end if;

  select g.teacher_id into v_teacher_id from public.groups g where g.id=p_group_id;
  if v_teacher_id is null then raise exception 'group not found'; end if;
  v_actor_role:=public.current_role();
  if v_actor_role is null or (v_actor_role is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id)) then
    raise exception 'not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select g.teacher_id,g.name,g.capacity,g.offering_id
    into v_locked_teacher_id,v_name,v_capacity,v_offering_id
  from public.groups g where g.id=p_group_id for update;
  if v_locked_teacher_id is null or v_locked_teacher_id<>v_teacher_id then raise exception 'group teacher changed'; end if;

  v_actor_role:=public.current_role();
  if v_actor_role is null or (v_actor_role is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id)) then
    raise exception 'not authorized';
  end if;
  select p.role,p.status,t.approved into v_teacher_role,v_teacher_status,v_teacher_approved
  from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=v_locked_teacher_id;
  if v_teacher_role is distinct from 'teacher'::public.user_role
     or v_teacher_status is distinct from 'active'::public.user_status
     or v_teacher_approved is distinct from true then
    raise exception 'only an active approved teacher may publish';
  end if;
  if v_name is null or btrim(v_name)='' then raise exception 'group name is required'; end if;
  if v_capacity not between 1 and 500 then raise exception 'group capacity is invalid'; end if;
  if not exists(select 1 from public.offerings o where o.id=v_offering_id) then raise exception 'group offering is invalid'; end if;
  if not exists(select 1 from public.group_schedule_slots s where s.group_id=p_group_id) then
    raise exception 'a schedule slot is required before publishing';
  end if;

  if p_from is not null then
    v_generated:=public.generate_lessons(p_group_id,p_from,p_until);
  end if;
  update public.groups set status='published'::public.group_status where id=p_group_id;
  return v_generated;
end
$$;

drop trigger if exists groups_publish_guard on public.groups;
create trigger groups_publish_guard before insert or update on public.groups
for each row execute function public.validate_group_publish();

revoke all on function public.publish_group(uuid,date,date) from public,anon,authenticated;
grant execute on function public.publish_group(uuid,date,date) to authenticated;

commit;
