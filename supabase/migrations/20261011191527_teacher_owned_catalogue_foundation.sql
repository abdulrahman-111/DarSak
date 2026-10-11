begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon,authenticated;

alter table public.subjects
  add column owner_teacher_id uuid references public.profiles(id) on delete cascade,
  add column archived_at timestamptz,
  add constraint subjects_owned_slug_uuid check(owner_teacher_id is null or slug=id::text),
  add constraint subjects_owned_label_contract check(owner_teacher_id is null or (
    char_length(regexp_replace(name_ar,'^[[:space:]]+|[[:space:]]+$','','g'))<=120 and
    char_length(regexp_replace(name_en,'^[[:space:]]+|[[:space:]]+$','','g'))<=120 and
    (nullif(regexp_replace(name_ar,'^[[:space:]]+|[[:space:]]+$','','g'),'') is not null or
     nullif(regexp_replace(name_en,'^[[:space:]]+|[[:space:]]+$','','g'),'') is not null)
  ));

alter table public.education_nodes
  add column owner_teacher_id uuid references public.profiles(id) on delete cascade,
  add column archived_at timestamptz,
  add constraint education_nodes_owned_shape check(
    owner_teacher_id is null or (parent_id is null and kind in ('custom_year','student_category') and slug=id::text)
  ),
  add constraint education_nodes_owned_label_contract check(owner_teacher_id is null or (
    char_length(regexp_replace(name_ar,'^[[:space:]]+|[[:space:]]+$','','g'))<=120 and
    char_length(regexp_replace(name_en,'^[[:space:]]+|[[:space:]]+$','','g'))<=120 and
    (nullif(regexp_replace(name_ar,'^[[:space:]]+|[[:space:]]+$','','g'),'') is not null or
     nullif(regexp_replace(name_en,'^[[:space:]]+|[[:space:]]+$','','g'),'') is not null)
  ));
alter table public.education_nodes drop constraint education_nodes_kind_check;
alter table public.education_nodes add constraint education_nodes_kind_check
  check((owner_teacher_id is null and kind in ('system','level','grade','university','faculty','department','year'))
     or (owner_teacher_id is not null and kind in ('custom_year','student_category')));

alter table public.offerings
  add column owner_teacher_id uuid references public.profiles(id) on delete cascade,
  add column archived_at timestamptz;

alter table public.offerings drop constraint offerings_node_id_subject_id_key;
create unique index offerings_shared_pair_unique on public.offerings(node_id,subject_id) where owner_teacher_id is null;
create unique index offerings_owner_pair_unique on public.offerings(owner_teacher_id,node_id,subject_id) where owner_teacher_id is not null;
create index subjects_owner_teacher_id_idx on public.subjects(owner_teacher_id);
create index education_nodes_owner_teacher_id_idx on public.education_nodes(owner_teacher_id);
create index offerings_owner_teacher_id_idx on public.offerings(owner_teacher_id);

-- Owned components can be cleaned up with their account. These cascades are
-- guarded below so deleting a shared component keeps its former RESTRICT behavior.
alter table public.offerings drop constraint offerings_subject_id_fkey;
alter table public.offerings add constraint offerings_subject_id_fkey
  foreign key(subject_id) references public.subjects(id) on delete cascade;
alter table public.offerings drop constraint offerings_node_id_fkey;
alter table public.offerings add constraint offerings_node_id_fkey
  foreign key(node_id) references public.education_nodes(id) on delete cascade;

alter table public.groups add column updated_at timestamptz not null default now();

create or replace function public.touch_group_updated_at()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.touch_group_updated_at() from public,anon,authenticated;
create trigger groups_updated_at_touch before insert or update on public.groups
for each row execute function public.touch_group_updated_at();

create or replace function private.catalogue_row_visible(p_table text,p_id uuid)
returns boolean
language plpgsql stable security definer
set search_path=pg_catalog,public,auth
as $$
declare v_owner uuid; v_archived timestamptz; v_shared boolean; v_visible boolean;
begin
  if p_table='subjects' then
    select owner_teacher_id,archived_at into v_owner,v_archived from public.subjects where id=p_id;
  elsif p_table='education_nodes' then
    select owner_teacher_id,archived_at into v_owner,v_archived from public.education_nodes where id=p_id;
  elsif p_table='offerings' then
    select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=p_id;
  else
    return false;
  end if;
  if not found then return false; end if;
  v_shared := v_owner is null;
  if v_shared then return true; end if;
  if public.current_role()='admin'::public.user_role then return true; end if;
  if exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
            where p.id=v_owner and p.id=auth.uid() and p.role='teacher' and p.status='active') then
    return true;
  end if;
  if p_table='subjects' then
    select exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.profiles p on p.id=g.teacher_id join public.teacher_profiles t on t.id=p.id
      where o.subject_id=p_id and g.status='published' and p.role='teacher' and p.status='active' and t.approved
    ) or exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.enrollments e on e.group_id=g.id join public.profiles sp on sp.id=e.student_id
      where o.subject_id=p_id and e.student_id=auth.uid() and e.status='accepted' and sp.role='student' and sp.status='active'
    ) into v_visible;
  elsif p_table='education_nodes' then
    select exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.profiles p on p.id=g.teacher_id join public.teacher_profiles t on t.id=p.id
      where o.node_id=p_id and g.status='published' and p.role='teacher' and p.status='active' and t.approved
    ) or exists(
      select 1 from public.groups g join public.offerings o on o.id=g.offering_id
      join public.enrollments e on e.group_id=g.id join public.profiles sp on sp.id=e.student_id
      where o.node_id=p_id and e.student_id=auth.uid() and e.status='accepted' and sp.role='student' and sp.status='active'
    ) into v_visible;
  else
    select exists(
      select 1 from public.groups g join public.profiles p on p.id=g.teacher_id
      join public.teacher_profiles t on t.id=p.id
      where g.offering_id=p_id and g.status='published' and p.role='teacher' and p.status='active' and t.approved
    ) or exists(
      select 1 from public.groups g join public.enrollments e on e.group_id=g.id join public.profiles sp on sp.id=e.student_id
      where g.offering_id=p_id and e.student_id=auth.uid() and e.status='accepted' and sp.role='student' and sp.status='active'
    ) into v_visible;
  end if;
  return coalesce(v_visible,false);
end
$$;
revoke all on function private.catalogue_row_visible(text,uuid) from public;
grant execute on function private.catalogue_row_visible(text,uuid) to anon,authenticated;

drop policy catalogue_read on public.education_nodes;
drop policy subjects_read on public.subjects;
drop policy offerings_read on public.offerings;
create policy education_nodes_read on public.education_nodes for select to anon,authenticated
using(private.catalogue_row_visible('education_nodes',id));
create policy subjects_read on public.subjects for select to anon,authenticated
using(private.catalogue_row_visible('subjects',id));
create policy offerings_read on public.offerings for select to anon,authenticated
using(private.catalogue_row_visible('offerings',id));

create or replace function private.validate_subject_owner()
returns trigger language plpgsql set search_path=pg_catalog,public,auth as $$
begin
  if tg_op='DELETE' then
    if old.owner_teacher_id is null and exists(select 1 from public.offerings o where o.subject_id=old.id) then
      raise exception 'shared catalogue components with offerings cannot be deleted';
    end if;
    if old.owner_teacher_id is not null and pg_trigger_depth()<=1 then raise exception 'teacher catalogue records cannot be deleted'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if new.owner_teacher_id is distinct from old.owner_teacher_id then raise exception 'catalogue ownership is immutable'; end if;
    if old.owner_teacher_id is not null and auth.uid() is not null and auth.uid() is distinct from old.owner_teacher_id then
      raise exception 'only the catalogue owner may edit owned labels';
    end if;
  end if;
  if new.owner_teacher_id is not null then
    if auth.uid() is not null and auth.uid() is distinct from new.owner_teacher_id then raise exception 'cannot assign another teacher catalogue ownership'; end if;
    if not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=new.owner_teacher_id and p.role='teacher') then
      raise exception 'catalogue owner must be a teacher';
    end if;
    new.name_ar := regexp_replace(coalesce(new.name_ar,''),'^[[:space:]]+|[[:space:]]+$','','g');
    new.name_en := regexp_replace(coalesce(new.name_en,''),'^[[:space:]]+|[[:space:]]+$','','g');
    if char_length(new.name_ar)>120 or char_length(new.name_en)>120 then raise exception 'owned catalogue labels must be at most 120 characters' using errcode='23514'; end if;
    if new.name_ar='' and new.name_en='' then raise exception 'owned catalogue needs one nonempty label' using errcode='23514'; end if;
    if new.slug is distinct from new.id::text then raise exception 'owned subject slug must match its id'; end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_subject_owner() from public;
create trigger subjects_catalogue_guard before insert or update or delete on public.subjects
for each row execute function private.validate_subject_owner();

create or replace function private.validate_category_owner()
returns trigger language plpgsql set search_path=pg_catalog,public,auth as $$
begin
  if tg_op='DELETE' then
    if old.owner_teacher_id is null and exists(select 1 from public.offerings o where o.node_id=old.id) then
      raise exception 'shared catalogue components with offerings cannot be deleted';
    end if;
    if old.owner_teacher_id is not null and pg_trigger_depth()<=1 then raise exception 'teacher catalogue records cannot be deleted'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if new.owner_teacher_id is distinct from old.owner_teacher_id then raise exception 'catalogue ownership is immutable'; end if;
    if old.owner_teacher_id is not null and (new.kind is distinct from old.kind or new.parent_id is distinct from old.parent_id) then
      raise exception 'teacher category kind and parent are immutable';
    end if;
    if old.owner_teacher_id is not null and auth.uid() is not null and auth.uid() is distinct from old.owner_teacher_id then
      raise exception 'only the catalogue owner may edit owned labels';
    end if;
  end if;
  if new.owner_teacher_id is not null then
    if auth.uid() is not null and auth.uid() is distinct from new.owner_teacher_id then raise exception 'cannot assign another teacher catalogue ownership'; end if;
    if not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=new.owner_teacher_id and p.role='teacher') then
      raise exception 'catalogue owner must be a teacher';
    end if;
    new.name_ar := regexp_replace(coalesce(new.name_ar,''),'^[[:space:]]+|[[:space:]]+$','','g');
    new.name_en := regexp_replace(coalesce(new.name_en,''),'^[[:space:]]+|[[:space:]]+$','','g');
    if char_length(new.name_ar)>120 or char_length(new.name_en)>120 then raise exception 'owned catalogue labels must be at most 120 characters' using errcode='23514'; end if;
    if new.name_ar='' and new.name_en='' then raise exception 'owned catalogue needs one nonempty label' using errcode='23514'; end if;
    if new.kind not in ('custom_year','student_category') or new.parent_id is not null then raise exception 'owned categories must be custom roots'; end if;
    if new.slug is distinct from new.id::text then raise exception 'owned category slug must match its id'; end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_category_owner() from public;
create trigger education_nodes_catalogue_guard before insert or update or delete on public.education_nodes
for each row execute function private.validate_category_owner();

create or replace function private.validate_offering_owner()
returns trigger language plpgsql set search_path=pg_catalog,public,auth as $$
begin
  if tg_op='DELETE' then
    if old.owner_teacher_id is not null and pg_trigger_depth()<=1 then raise exception 'teacher catalogue records cannot be deleted'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if new.owner_teacher_id is distinct from old.owner_teacher_id then raise exception 'catalogue ownership is immutable'; end if;
    if old.owner_teacher_id is not null and (new.node_id is distinct from old.node_id or new.subject_id is distinct from old.subject_id) then
      raise exception 'teacher offering components are immutable';
    end if;
  end if;
  if new.owner_teacher_id is not null then
    if auth.uid() is not null and auth.uid() is distinct from new.owner_teacher_id then raise exception 'cannot assign another teacher catalogue ownership'; end if;
    if not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=new.owner_teacher_id and p.role='teacher') then
      raise exception 'catalogue owner must be a teacher';
    end if;
    if not exists(select 1 from public.education_nodes n where n.id=new.node_id and (n.owner_teacher_id is null or n.owner_teacher_id=new.owner_teacher_id)) then
      raise exception 'owned offering category must be shared or owned by the same teacher';
    end if;
    if not exists(select 1 from public.subjects s where s.id=new.subject_id and (s.owner_teacher_id is null or s.owner_teacher_id=new.owner_teacher_id)) then
      raise exception 'owned offering subject must be shared or owned by the same teacher';
    end if;
  elsif exists(select 1 from public.education_nodes n where n.id=new.node_id and n.owner_teacher_id is not null)
     or exists(select 1 from public.subjects s where s.id=new.subject_id and s.owner_teacher_id is not null) then
    raise exception 'shared offerings require shared components';
  end if;
  return new;
end $$;
revoke all on function private.validate_offering_owner() from public;
create trigger offerings_catalogue_guard before insert or update or delete on public.offerings
for each row execute function private.validate_offering_owner();

create or replace function public.validate_offering_context()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare n public.education_nodes; hs boolean; hl boolean; hu boolean;
begin
  select * into n from public.education_nodes where id=new.node_id;
  if not found then raise exception 'offering category not found'; end if;
  if n.owner_teacher_id is not null then
    if n.kind not in ('custom_year','student_category') or n.parent_id is not null or new.owner_teacher_id is distinct from n.owner_teacher_id then
      raise exception 'owned category must be a custom root belonging to the offering owner';
    end if;
    return new;
  end if;
  if n.kind not in ('grade','university','year') then raise exception 'offering context must be grade, university, or year'; end if;
  with recursive a(id,parent_id,kind) as
    (select id,parent_id,kind from public.education_nodes where id=n.id union all
     select e.id,e.parent_id,e.kind from public.education_nodes e join a on e.id=a.parent_id)
  select bool_or(kind='system'),bool_or(kind='level'),bool_or(kind='university') into hs,hl,hu from a;
  if not coalesce(hs,false) then raise exception 'offering must belong to a system'; end if;
  if n.kind='grade' and not coalesce(hl,false) then raise exception 'grade must belong to a level'; end if;
  if n.kind='year' and not coalesce(hu,false) then raise exception 'year must belong to a university'; end if;
  return new;
end $$;

create or replace function private.validate_group_catalogue_selection()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_owner uuid; v_archived timestamptz; v_node uuid; v_subject uuid; v_locked_node uuid; v_locked_subject uuid; v_node_owner uuid; v_subject_owner uuid; v_node_archived timestamptz; v_subject_archived timestamptz;
begin
  select node_id,subject_id into v_locked_node,v_locked_subject from public.offerings where id=new.offering_id;
  if not found then raise exception 'group offering not found'; end if;
  perform 1 from public.subjects where id=v_locked_subject for share;
  if not found then raise exception 'group subject is not selectable'; end if;
  perform 1 from public.education_nodes where id=v_locked_node for share;
  if not found then raise exception 'group category is not selectable'; end if;
  select owner_teacher_id,archived_at,node_id,subject_id into v_owner,v_archived,v_node,v_subject
  from public.offerings where id=new.offering_id for share;
  if not found then raise exception 'group offering not found'; end if;
  if v_node is distinct from v_locked_node or v_subject is distinct from v_locked_subject then
    raise exception 'catalogue changed during group selection; retry' using errcode='40001';
  end if;
  select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=v_node;
  select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=v_subject;
  if v_owner is not null and v_owner is distinct from new.teacher_id then raise exception 'group offering belongs to another teacher'; end if;
  if v_node_owner is not null and v_node_owner is distinct from new.teacher_id then raise exception 'group category belongs to another teacher'; end if;
  if v_subject_owner is not null and v_subject_owner is distinct from new.teacher_id then raise exception 'group subject belongs to another teacher'; end if;
  if tg_op='INSERT' or new.offering_id is distinct from old.offering_id or new.teacher_id is distinct from old.teacher_id then
    if v_archived is not null or v_node_archived is not null or v_subject_archived is not null then raise exception 'archived catalogue selections cannot be newly selected'; end if;
    if not exists(select 1 from public.profiles p where p.id=new.teacher_id and p.role='teacher' and p.status='active') then raise exception 'group teacher must be active'; end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_group_catalogue_selection() from public;
create trigger groups_catalogue_selection_guard before insert or update of teacher_id,offering_id on public.groups
for each row execute function private.validate_group_catalogue_selection();

create or replace function private.validate_specialization_catalogue_selection()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_owner uuid; v_archived timestamptz; v_node uuid; v_subject uuid; v_locked_node uuid; v_locked_subject uuid; v_node_owner uuid; v_subject_owner uuid; v_node_archived timestamptz; v_subject_archived timestamptz;
begin
  select node_id,subject_id into v_locked_node,v_locked_subject from public.offerings where id=new.offering_id;
  if not found then raise exception 'specialization offering not found'; end if;
  perform 1 from public.subjects where id=v_locked_subject for share;
  if not found then raise exception 'specialization subject is not selectable'; end if;
  perform 1 from public.education_nodes where id=v_locked_node for share;
  if not found then raise exception 'specialization category is not selectable'; end if;
  select owner_teacher_id,archived_at,node_id,subject_id into v_owner,v_archived,v_node,v_subject from public.offerings where id=new.offering_id for share;
  if not found then raise exception 'specialization offering not found'; end if;
  if v_node is distinct from v_locked_node or v_subject is distinct from v_locked_subject then
    raise exception 'catalogue changed during specialization selection; retry' using errcode='40001';
  end if;
  select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=v_node;
  select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=v_subject;
  if v_owner is not null and v_owner is distinct from new.teacher_id then raise exception 'specialization offering belongs to another teacher'; end if;
  if v_node_owner is not null and v_node_owner is distinct from new.teacher_id then raise exception 'specialization category belongs to another teacher'; end if;
  if v_subject_owner is not null and v_subject_owner is distinct from new.teacher_id then raise exception 'specialization subject belongs to another teacher'; end if;
  if tg_op='INSERT' or new.offering_id is distinct from old.offering_id or new.teacher_id is distinct from old.teacher_id then
    if v_archived is not null or v_node_archived is not null or v_subject_archived is not null then raise exception 'archived catalogue selections cannot be newly selected'; end if;
    if not exists(select 1 from public.profiles p where p.id=new.teacher_id and p.role='teacher' and p.status='active') then raise exception 'specialization teacher must be active'; end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_specialization_catalogue_selection() from public;
create trigger teacher_specializations_catalogue_guard before insert or update on public.teacher_specializations
for each row execute function private.validate_specialization_catalogue_selection();

create or replace function private.validate_student_catalogue_selection()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_node uuid; v_subject uuid; v_locked_node uuid; v_locked_subject uuid; v_owner uuid; v_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz; v_subject_owner uuid; v_subject_archived timestamptz;
begin
  if new.offering_id is null or (tg_op='UPDATE' and new.offering_id is not distinct from old.offering_id) then return new; end if;
  select node_id,subject_id into v_locked_node,v_locked_subject from public.offerings where id=new.offering_id;
  if not found then raise exception 'student offering is not selectable'; end if;
  perform 1 from public.subjects where id=v_locked_subject for share;
  if not found then raise exception 'student subject is not selectable'; end if;
  perform 1 from public.education_nodes where id=v_locked_node for share;
  if not found then raise exception 'student category is not selectable'; end if;
  select owner_teacher_id,archived_at,node_id,subject_id into v_owner,v_archived,v_node,v_subject from public.offerings where id=new.offering_id for share;
  if not found or v_node is distinct from v_locked_node or v_subject is distinct from v_locked_subject then
    raise exception 'catalogue changed during student selection; retry' using errcode='40001';
  end if;
  select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=v_node;
  select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=v_subject;
  if v_owner is not null or v_node_owner is not null or v_subject_owner is not null
     or v_archived is not null or v_node_archived is not null or v_subject_archived is not null then
    raise exception 'student profile selections must be active shared offerings';
  end if;
  return new;
end $$;
revoke all on function private.validate_student_catalogue_selection() from public;
create trigger student_profiles_catalogue_selection_guard before insert or update of offering_id on public.student_profiles
for each row execute function private.validate_student_catalogue_selection();

create or replace function public.public_teacher_specializations(p_teacher_id uuid)
returns table(offering_id uuid)
language sql stable security definer set search_path=pg_catalog,public,auth as $$
select s.offering_id
from public.teacher_specializations s
join public.teacher_profiles t on t.id=s.teacher_id
join public.profiles p on p.id=t.id
join public.offerings o on o.id=s.offering_id
where s.teacher_id=p_teacher_id and p.role='teacher' and p.status='active' and t.approved
  and (o.owner_teacher_id is null or exists(
    select 1 from public.groups g where g.teacher_id=s.teacher_id and g.offering_id=o.id and g.status='published'
  ))
$$;
revoke all on function public.public_teacher_specializations(uuid) from public;
grant execute on function public.public_teacher_specializations(uuid) to anon,authenticated;

create or replace function public.public_discovery_catalogue()
returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
with eligible_groups as (
  select g.offering_id from public.groups g
  join public.profiles p on p.id=g.teacher_id
  join public.teacher_profiles t on t.id=p.id
  where g.status='published' and p.role='teacher' and p.status='active' and t.approved
), subjects_out as (
  select s.id,s.name_ar,s.name_en from public.subjects s where s.owner_teacher_id is null
  union
  select s.id,s.name_ar,s.name_en from public.subjects s join public.offerings o on o.subject_id=s.id
  join eligible_groups eg on eg.offering_id=o.id where s.owner_teacher_id is not null
), nodes_out as (
  select n.id,n.parent_id,n.kind,n.name_ar,n.name_en from public.education_nodes n where n.owner_teacher_id is null
  union
  select n.id,n.parent_id,n.kind,n.name_ar,n.name_en from public.education_nodes n join public.offerings o on o.node_id=n.id
  join eligible_groups eg on eg.offering_id=o.id where n.owner_teacher_id is not null
)
select jsonb_build_object(
  'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar,'name_en',name_en) order by id) from subjects_out),'[]'::jsonb),
  'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_id',parent_id,'kind',kind,'name_ar',name_ar,'name_en',name_en) order by id) from nodes_out),'[]'::jsonb)
)
$$;
revoke all on function public.public_discovery_catalogue() from public;
grant execute on function public.public_discovery_catalogue() to anon,authenticated;

commit;
