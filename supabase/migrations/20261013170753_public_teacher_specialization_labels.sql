begin;

create or replace function public.public_teacher_specialization_labels(p_teacher_id uuid)
returns table(
  offering_id uuid,
  subject_name_ar text,
  subject_name_en text,
  context_ar text,
  context_en text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
with recursive selected as (
  select
    s.teacher_id,
    s.offering_id,
    offering.node_id,
    offering.subject_id,
    offering.owner_teacher_id as offering_owner,
    subject.owner_teacher_id as subject_owner,
    subject.name_ar as subject_name_ar,
    subject.name_en as subject_name_en,
    leaf.owner_teacher_id as leaf_owner
  from public.teacher_specializations s
  join public.profiles profile on profile.id = s.teacher_id
  join public.teacher_profiles teacher on teacher.id = s.teacher_id
  join public.offerings offering on offering.id = s.offering_id
  join public.subjects subject on subject.id = offering.subject_id
  join public.education_nodes leaf on leaf.id = offering.node_id
  where s.teacher_id = p_teacher_id
    and profile.role = 'teacher'
    and profile.status = 'active'
    and teacher.approved
    and (offering.owner_teacher_id is null or offering.owner_teacher_id = s.teacher_id)
    and (subject.owner_teacher_id is null or subject.owner_teacher_id = s.teacher_id)
    and (leaf.owner_teacher_id is null or leaf.owner_teacher_id = s.teacher_id)
), ancestry(offering_id, teacher_id, id, parent_id, owner_teacher_id, name_ar, name_en, path, cycle) as (
  select
    selected.offering_id,
    selected.teacher_id,
    node.id,
    node.parent_id,
    node.owner_teacher_id,
    node.name_ar,
    node.name_en,
    array[node.id]::uuid[],
    false
  from selected
  join public.education_nodes node on node.id = selected.node_id
  union all
  select
    ancestry.offering_id,
    ancestry.teacher_id,
    parent.id,
    parent.parent_id,
    parent.owner_teacher_id,
    parent.name_ar,
    parent.name_en,
    ancestry.path || parent.id,
    parent.id = any(ancestry.path)
  from ancestry
  join public.education_nodes parent on parent.id = ancestry.parent_id
  where not ancestry.cycle
), projected as (
  select
    selected.offering_id,
    coalesce(nullif(btrim(selected.subject_name_ar), ''), nullif(btrim(selected.subject_name_en), '')) as subject_name_ar,
    coalesce(nullif(btrim(selected.subject_name_en), ''), nullif(btrim(selected.subject_name_ar), '')) as subject_name_en,
    coalesce(string_agg(
      coalesce(nullif(btrim(ancestry.name_ar), ''), nullif(btrim(ancestry.name_en), '')),
      ' › ' order by array_position(ancestry.path, ancestry.id) desc
    ) filter (where coalesce(nullif(btrim(ancestry.name_ar), ''), nullif(btrim(ancestry.name_en), '')) is not null), '') as context_ar,
    coalesce(string_agg(
      coalesce(nullif(btrim(ancestry.name_en), ''), nullif(btrim(ancestry.name_ar), '')),
      ' › ' order by array_position(ancestry.path, ancestry.id) desc
    ) filter (where coalesce(nullif(btrim(ancestry.name_en), ''), nullif(btrim(ancestry.name_ar), '')) is not null), '') as context_en
  from selected
  join ancestry on ancestry.offering_id = selected.offering_id
  group by selected.offering_id, selected.teacher_id, selected.offering_owner, selected.subject_owner,
    selected.leaf_owner, selected.subject_name_ar, selected.subject_name_en
  having not bool_or(ancestry.cycle)
    and not bool_or(ancestry.owner_teacher_id is not null and ancestry.owner_teacher_id <> selected.teacher_id)
    and not bool_or(
      ancestry.parent_id is not null
      and not exists(select 1 from public.education_nodes parent where parent.id = ancestry.parent_id)
    )
)
select projected.offering_id, projected.subject_name_ar, projected.subject_name_en, projected.context_ar, projected.context_en
from projected
where projected.subject_name_ar is not null
  and projected.subject_name_en is not null
order by projected.offering_id;
$$;

revoke all on function public.public_teacher_specialization_labels(uuid) from public, anon, authenticated, service_role;
grant execute on function public.public_teacher_specialization_labels(uuid) to anon, authenticated;

commit;
