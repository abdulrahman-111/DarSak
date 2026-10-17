begin;
create table public.group_learning_details (
 group_id uuid primary key references public.groups(id) on delete cascade,
 outcomes text not null default '' check(length(outcomes)<=2000),
 prerequisites text not null default '' check(length(prerequisites)<=1500),
 delivery_mode text check(delivery_mode in ('online','in_person','hybrid')),
 fee_egp numeric(10,2) check(fee_egp between 0 and 100000),
 fee_basis text check(fee_basis in ('lesson','month','semester','course')),
 fee_includes text not null default '' check(length(fee_includes)<=1000),
 updated_at timestamptz not null default clock_timestamp(),
 check((fee_egp is null)=(fee_basis is null))
);
alter table public.group_learning_details enable row level security;
revoke all on public.group_learning_details from public,anon,authenticated;
grant select on public.group_learning_details to anon,authenticated;
create function public.can_read_group_learning_details(p_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.public_group_detail(p_id)) or exists(
 select 1 from public.groups g where g.id=p_id and (public.current_role()='admin' or (g.teacher_id=auth.uid() and public.current_role()='teacher'))
 );
$$;
revoke all on function public.can_read_group_learning_details(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_read_group_learning_details(uuid) to anon,authenticated;
create policy learning_details_read on public.group_learning_details for select to anon,authenticated
using(public.can_read_group_learning_details(group_id));
create function public.save_group_learning_details(p_group_id uuid,p_values jsonb,p_expected_updated_at timestamptz default null)
returns timestamptz language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_group public.groups; v_old timestamptz; v_next timestamptz; v_fee numeric; v_mode text; v_basis text;
begin
 select * into v_group from public.groups where id=p_group_id for update;
 if not found or v_group.teacher_id is distinct from auth.uid() or not exists(
 select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved
 ) or not dars_private.teacher_has_access(auth.uid()) then raise exception 'active approved owner required' using errcode='42501'; end if;
 if v_group.status='archived' then raise exception 'group archived' using errcode='22023'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or (p_values - array['outcomes','prerequisites','delivery_mode','fee_egp','fee_basis','fee_includes'])<>'{}'::jsonb then raise exception 'invalid values' using errcode='22023'; end if;
 select updated_at into v_old from public.group_learning_details where group_id=p_group_id for update;
 if v_old is distinct from p_expected_updated_at then raise exception 'details changed' using errcode='40001'; end if;
 v_mode:=nullif(p_values->>'delivery_mode',''); v_basis:=nullif(p_values->>'fee_basis',''); v_fee:=nullif(p_values->>'fee_egp','')::numeric;
 if v_fee<>round(v_fee,2) then raise exception 'fee precision' using errcode='22023'; end if;
 insert into public.group_learning_details(group_id,outcomes,prerequisites,delivery_mode,fee_egp,fee_basis,fee_includes)
 values(p_group_id,btrim(coalesce(p_values->>'outcomes','')),btrim(coalesce(p_values->>'prerequisites','')),v_mode,v_fee,v_basis,btrim(coalesce(p_values->>'fee_includes','')))
 on conflict(group_id) do update set outcomes=excluded.outcomes,prerequisites=excluded.prerequisites,delivery_mode=excluded.delivery_mode,fee_egp=excluded.fee_egp,fee_basis=excluded.fee_basis,fee_includes=excluded.fee_includes,updated_at=clock_timestamp()
 returning updated_at into v_next;
 return v_next;
end $$;
revoke all on function public.save_group_learning_details(uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.save_group_learning_details(uuid,jsonb,timestamptz) to authenticated;
create or replace function public.duplicate_group(p_group_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_source public.groups; v_teacher uuid; v_actor_role public.user_role; v_node uuid; v_subject uuid; v_owner uuid; v_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz; v_subject_owner uuid; v_subject_archived timestamptz; v_name text; v_duplicate uuid;
begin
 select * into v_source from public.groups where id=p_group_id;
 if not found then raise exception 'group not found'; end if;
 v_teacher:=v_source.teacher_id;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 select * into v_source from public.groups where id=p_group_id for update;
 if not found or v_source.teacher_id<>v_teacher then raise exception 'group teacher changed'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'source teacher must be active'; end if;
 select node_id,subject_id into v_node,v_subject from public.offerings where id=v_source.offering_id;
 perform 1 from public.subjects where id=v_subject for update;
 perform 1 from public.education_nodes where id=v_node for update;
 select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=v_source.offering_id for update;
 select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=v_subject;
 select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=v_node;
 if (v_owner is not null and v_owner<>v_teacher) or (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher) then raise exception 'source selection belongs to another teacher'; end if;
 if v_archived is not null or v_subject_archived is not null or v_node_archived is not null then raise exception 'Update the original catalogue selection before duplicating this group.'; end if;
 v_name:=rtrim(left(btrim(v_source.name),113)); if v_name='' then v_name:='Group'; end if;
 insert into public.groups(teacher_id,offering_id,name,description,capacity,status,location)
 values(v_teacher,v_source.offering_id,v_name||' (copy)',v_source.description,v_source.capacity,'draft',v_source.location)
 returning id into v_duplicate;
 insert into public.group_learning_details(group_id,outcomes,prerequisites,delivery_mode,fee_egp,fee_basis,fee_includes)
 select v_duplicate,outcomes,prerequisites,delivery_mode,fee_egp,fee_basis,fee_includes from public.group_learning_details where group_id=p_group_id;
 return v_duplicate;
end
$$;
revoke all on function public.duplicate_group(uuid) from public,anon,authenticated,service_role;
grant execute on function public.duplicate_group(uuid) to authenticated;


commit;
