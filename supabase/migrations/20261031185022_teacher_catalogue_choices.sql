begin;

create or replace function public.teacher_catalogue_choices()
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_subjects jsonb;
  v_nodes jsonb;
  v_offerings jsonb;
begin
  if v_actor is null
     or not coalesce(public.is_active_user(v_actor), false)
     or public.current_role() is distinct from 'teacher'::public.user_role then
    raise exception 'active teacher required' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', s.id,
    'owner_teacher_id', s.owner_teacher_id,
    'archived_at', s.archived_at,
    'name_ar', s.name_ar,
    'name_en', s.name_en
  ) order by s.id), '[]'::jsonb)
  into v_subjects
  from public.subjects s
  where s.owner_teacher_id is null or s.owner_teacher_id = v_actor;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', n.id,
    'owner_teacher_id', n.owner_teacher_id,
    'archived_at', n.archived_at,
    'parent_id', n.parent_id,
    'kind', n.kind,
    'name_ar', n.name_ar,
    'name_en', n.name_en
  ) order by n.id), '[]'::jsonb)
  into v_nodes
  from public.education_nodes n
  where n.owner_teacher_id is null or n.owner_teacher_id = v_actor;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', o.id,
    'owner_teacher_id', o.owner_teacher_id,
    'archived_at', o.archived_at,
    'node_id', o.node_id,
    'subject_id', o.subject_id
  ) order by o.id), '[]'::jsonb)
  into v_offerings
  from public.offerings o
  where o.owner_teacher_id is null or o.owner_teacher_id = v_actor;

  return pg_catalog.jsonb_build_object(
    'subjects', v_subjects,
    'nodes', v_nodes,
    'offerings', v_offerings
  );
end;
$$;

revoke all on function public.teacher_catalogue_choices() from public, anon;
grant execute on function public.teacher_catalogue_choices() to authenticated;

commit;
