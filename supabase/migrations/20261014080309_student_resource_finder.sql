-- Narrow, bounded student resource discovery. Historical resources remain visible
-- to accepted members of archived groups, matching lesson metadata access.
create or replace function public.student_resource_group_choices(p_query text default '', p_selected_id uuid default null)
returns table(id uuid, name text)
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select g.id, g.name
  from public.groups g
  join public.enrollments e on e.group_id=g.id
  where auth.uid() is not null
    and public.is_active_user(auth.uid())
    and public.current_role()='student'
    and e.student_id=auth.uid()
    and e.status='accepted'
    and (coalesce(btrim(p_query),'')='' or g.name ilike '%'||left(btrim(p_query),100)||'%' or g.id=p_selected_id)
  group by g.id,g.name
  order by (g.id=p_selected_id) desc,g.name,g.id
  limit 50
$$;
revoke all on function public.student_resource_group_choices(text,uuid) from public,anon,authenticated;
grant execute on function public.student_resource_group_choices(text,uuid) to authenticated;

create or replace function public.student_resource_page(
  p_group_id uuid default null,
  p_kind text default null,
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v_query text := left(btrim(coalesce(p_query,'')),100);
  v_limit integer := greatest(1,least(coalesce(p_limit,20),20));
  v_offset integer := greatest(0,least(coalesce(p_offset,0),1000000));
  v_total bigint;
  v_rows jsonb;
begin
  if auth.uid() is null or not public.is_active_user(auth.uid()) or public.current_role()<>'student' then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_kind is not null and p_kind not in ('note','link','file') then
    raise exception 'invalid resource kind' using errcode='22023';
  end if;

  with eligible as (
    select m.id,m.title,m.kind::text as kind,m.lesson_id,l.title as lesson_title,
           l.starts_at,g.id as group_id,g.name as group_name,m.url,m.content
    from public.lesson_materials m
    join public.lessons l on l.id=m.lesson_id
    join public.groups g on g.id=l.group_id
    join public.enrollments e on e.group_id=g.id
    where e.student_id=auth.uid() and e.status='accepted'
      and (p_group_id is null or g.id=p_group_id)
      and (p_kind is null or m.kind::text=p_kind)
      and (v_query='' or m.title ilike '%'||v_query||'%' or g.name ilike '%'||v_query||'%')
  )
  select count(*) into v_total from eligible;

  with eligible as (
    select m.id,m.title,m.kind::text as kind,m.lesson_id,l.title as lesson_title,
           l.starts_at,g.id as group_id,g.name as group_name,m.url,m.content
    from public.lesson_materials m
    join public.lessons l on l.id=m.lesson_id
    join public.groups g on g.id=l.group_id
    join public.enrollments e on e.group_id=g.id
    where e.student_id=auth.uid() and e.status='accepted'
      and (p_group_id is null or g.id=p_group_id)
      and (p_kind is null or m.kind::text=p_kind)
      and (v_query='' or m.title ilike '%'||v_query||'%' or g.name ilike '%'||v_query||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'kind',kind,'lesson_id',lesson_id,'lesson_title',lesson_title,
    'starts_at',starts_at,'group_id',group_id,'group_name',group_name,'url',url,'content',content
  ) order by starts_at desc,id), '[]'::jsonb)
  into v_rows
  from (select * from eligible order by starts_at desc,id limit v_limit offset v_offset) page;

  return jsonb_build_object('rows',v_rows,'total',v_total);
end
$$;
revoke all on function public.student_resource_page(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.student_resource_page(uuid,text,text,integer,integer) to authenticated;
