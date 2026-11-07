begin;

create function public.student_class_lessons_page(
  p_group_id uuid, p_history boolean default false, p_page integer default 1, p_now timestamptz default now()
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_group jsonb;
  v_total integer;
  v_page integer;
  v_lessons jsonb;
  v_attendance jsonb;
begin
  v_group := public.student_class_detail(p_group_id);
  if v_group is null then return null; end if;
  if p_now is null then raise exception 'invalid page time' using errcode = '22023'; end if;
  select count(*)::integer into v_total from public.lessons l
   where l.group_id=p_group_id and (case when p_history then l.ends_at < p_now else l.ends_at >= p_now end);
  v_page := least(greatest(coalesce(p_page,1),1),50000);
  v_page := least(v_page, greatest(1, ceil(v_total::numeric / 20)::integer));
  select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at desc nulls last, q.id), '[]'::jsonb)
   into v_lessons from (
     select l.id,l.group_id,l.title,l.starts_at,l.ends_at,l.status::text as status,l.notes
     from public.lessons l where l.group_id=p_group_id
       and (case when p_history then l.ends_at < p_now else l.ends_at >= p_now end)
     order by l.starts_at desc nulls last,l.id
     offset (v_page-1)*20 limit 20
   ) q;
  if not p_history then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at, q.id), '[]'::jsonb)
      into v_lessons from (
        select l.id,l.group_id,l.title,l.starts_at,l.ends_at,l.status::text as status,l.notes
        from public.lessons l where l.group_id=p_group_id and l.ends_at >= p_now
        order by l.starts_at,l.id offset (v_page-1)*20 limit 20
      ) q;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('lesson_id',a.lesson_id,'status',a.status::text) order by a.lesson_id), '[]'::jsonb)
    into v_attendance from public.lesson_attendance a
    where a.student_id=auth.uid() and a.lesson_id in (
      select (x->>'id')::uuid from jsonb_array_elements(v_lessons) x
    );
  return jsonb_build_object('group',v_group,'lessons',v_lessons,'attendance',v_attendance,'page',v_page,'total',v_total);
end;
$$;

create function public.student_class_overview(p_group_id uuid, p_now timestamptz default now())
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare v_group jsonb; v_next jsonb; v_slots jsonb; v_announcement jsonb;
begin
  v_group := public.student_class_detail(p_group_id);
  if v_group is null then return null; end if;
  select to_jsonb(q) into v_next from (
    select l.id,l.group_id,l.title,l.starts_at,l.ends_at,l.status::text as status
    from public.lessons l where l.group_id=p_group_id and l.status::text='scheduled' and l.ends_at>p_now
    order by l.starts_at,l.id limit 1
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.weekday,q.start_time),'[]'::jsonb) into v_slots from (
    select s.id,s.group_id,s.weekday,s.start_time,s.end_time,s.timezone from public.group_schedule_slots s
    where s.group_id=p_group_id order by s.weekday,s.start_time limit 100
  ) q;
  select to_jsonb(q) into v_announcement from (
    select a.body,a.edited_at from public.group_pinned_announcements a where a.group_id=p_group_id limit 1
  ) q;
  return jsonb_build_object('group',v_group,'next',v_next,'slots',v_slots,'announcement',v_announcement);
end;
$$;

revoke all on function public.student_class_lessons_page(uuid,boolean,integer,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.student_class_lessons_page(uuid,boolean,integer,timestamptz) to authenticated;
revoke all on function public.student_class_overview(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.student_class_overview(uuid,timestamptz) to authenticated;

commit;
