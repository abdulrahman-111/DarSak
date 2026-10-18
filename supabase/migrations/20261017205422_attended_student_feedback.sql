begin;
create table dars_private.group_feedback(
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 rating integer not null check(rating between 1 and 5), comment text not null check(length(btrim(comment)) between 20 and 1500),
 status text not null default 'pending' check(status in ('pending','approved','hidden','withdrawn')),
 reply_pending text not null default '' check(length(reply_pending)<=1500), reply_public text not null default '' check(length(reply_public)<=1500),
 admin_note text not null default '' check(length(admin_note)<=1500), version bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(group_id,student_id)
);
create index feedback_moderation_idx on dars_private.group_feedback(status,updated_at desc,id);
create index feedback_group_public_idx on dars_private.group_feedback(group_id,created_at desc,id) where status='approved';
alter table dars_private.group_feedback enable row level security;
revoke all on dars_private.group_feedback from public,anon,authenticated,service_role;
create function dars_private.feedback_eligible(p_group uuid,p_student uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.groups g join public.profiles tp on tp.id=g.teacher_id and tp.role='teacher' and tp.status='active'
 join public.teacher_profiles t on t.id=tp.id and t.approved
 join public.enrollments e on e.group_id=g.id and e.student_id=p_student and e.status='accepted'
 join public.profiles sp on sp.id=e.student_id and sp.role='student' and sp.status='active'
 join public.lessons l on l.group_id=g.id and l.status<>'cancelled' and l.ends_at<=now()
 join public.lesson_attendance a on a.lesson_id=l.id and a.student_id=p_student and a.status in ('present','late')
 where g.id=p_group and g.status='published');
$$;
revoke all on function dars_private.feedback_eligible(uuid,uuid) from public,anon,authenticated,service_role;
create function public.my_group_feedback(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_own jsonb;
begin
 if public.current_role() is distinct from 'student'::public.user_role then raise exception 'student required' using errcode='42501'; end if;
 select jsonb_build_object('id',id,'rating',rating,'comment',comment,'status',status,'version',version) into v_own from dars_private.group_feedback where group_id=p_group_id and student_id=auth.uid();
 return jsonb_build_object('eligible',dars_private.feedback_eligible(p_group_id,auth.uid()),'own',v_own);
end $$;
create function public.save_group_feedback(p_group_id uuid,p_rating integer,p_comment text,p_expected_version bigint default 0)
returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old dars_private.group_feedback; v_next bigint;
begin
 if public.current_role() is distinct from 'student'::public.user_role then raise exception 'student required' using errcode='42501'; end if;
 perform 1 from public.groups where id=p_group_id for update;
 if not dars_private.feedback_eligible(p_group_id,auth.uid()) then raise exception 'accepted attendance required' using errcode='42501'; end if;
 select * into v_old from dars_private.group_feedback where group_id=p_group_id and student_id=auth.uid() for update;
 if coalesce(v_old.version,0) is distinct from p_expected_version then raise exception 'feedback changed' using errcode='40001'; end if;
 insert into dars_private.group_feedback(group_id,student_id,rating,comment)values(p_group_id,auth.uid(),p_rating,btrim(p_comment))
 on conflict(group_id,student_id)do update set rating=excluded.rating,comment=excluded.comment,status='pending',reply_pending='',reply_public='',version=group_feedback.version+1,updated_at=clock_timestamp()
 returning version into v_next;return v_next;
end $$;
create function public.withdraw_group_feedback(p_id uuid,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_next bigint;
begin
 if public.current_role() is distinct from 'student'::public.user_role then raise exception 'student required' using errcode='42501'; end if;
 update dars_private.group_feedback set status='withdrawn',version=version+1,updated_at=clock_timestamp() where id=p_id and student_id=auth.uid() and version=p_expected_version returning version into v_next;
 if v_next is null then raise exception 'feedback changed' using errcode='40001'; end if;return v_next;
end $$;
create function public.teacher_reply_feedback(p_id uuid,p_reply text,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_group uuid; v_next bigint;
begin
 select group_id into v_group from dars_private.group_feedback where id=p_id;
 perform 1 from public.groups g join public.teacher_profiles t on t.id=g.teacher_id where g.id=v_group and g.teacher_id=auth.uid() and g.status='published' and t.approved and public.current_role()='teacher' and dars_private.teacher_has_access(auth.uid()) for update of g;
 if not found then raise exception 'active approved owner required' using errcode='42501'; end if;
 if p_reply is null or length(btrim(p_reply)) not between 1 and 1500 then raise exception 'invalid reply' using errcode='22023'; end if;
 update dars_private.group_feedback set reply_pending=btrim(p_reply),version=version+1,updated_at=clock_timestamp() where id=p_id and status='approved' and version=p_expected_version returning version into v_next;
 if v_next is null then raise exception 'feedback changed' using errcode='40001'; end if;return v_next;
end $$;
create function public.moderate_group_feedback(p_id uuid,p_decision text,p_note text,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row dars_private.group_feedback; v_next bigint;
begin
 if public.current_role() is distinct from 'admin'::public.user_role then raise exception 'active admin required' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approve','hide','approve_reply','hide_reply') or length(coalesce(p_note,''))>1500 then raise exception 'invalid moderation' using errcode='22023'; end if;
 select * into v_row from dars_private.group_feedback where id=p_id for update;
 if not found or v_row.version is distinct from p_expected_version then raise exception 'feedback changed' using errcode='40001'; end if;
 if v_row.status='withdrawn' then raise exception 'feedback withdrawn' using errcode='22023'; end if;
 if p_decision='approve_reply' and (v_row.status<>'approved' or v_row.reply_pending='') then raise exception 'no pending reply' using errcode='22023'; end if;
 update dars_private.group_feedback set
 status=case when p_decision='approve' then 'approved' when p_decision='hide' then 'hidden' else status end,
 reply_public=case when p_decision='approve_reply' then reply_pending when p_decision='hide_reply' then '' else reply_public end,
 reply_pending=case when p_decision in ('approve_reply','hide_reply') then '' else reply_pending end,
 admin_note=coalesce(p_note,''),version=version+1,updated_at=clock_timestamp() where id=p_id returning version into v_next;return v_next;
end $$;
create function public.public_group_feedback(p_group_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;v_count bigint;v_average numeric;
begin
 if p_offset is null or p_offset<0 then raise exception 'invalid page' using errcode='22023'; end if;
 if not exists(select 1 from public.public_group_detail(p_group_id))then return jsonb_build_object('rows','[]'::jsonb,'total',0,'average',null);end if;
 select count(*),round(avg(rating),1)into v_count,v_average from dars_private.group_feedback f join public.profiles p on p.id=f.student_id and p.status='active' where group_id=p_group_id and f.status='approved';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)into v_rows from(select f.id,f.rating,f.comment,f.reply_public,f.created_at from dars_private.group_feedback f join public.profiles p on p.id=f.student_id and p.status='active' where group_id=p_group_id and f.status='approved' order by f.created_at desc,f.id offset p_offset limit 10)x;
 return jsonb_build_object('rows',v_rows,'total',v_count,'average',v_average);
end $$;
create function public.manage_group_feedback_page(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_role public.user_role:=public.current_role();v_rows jsonb;v_count bigint;
begin
 if v_role is null or v_role not in ('admin','teacher') then raise exception 'admin or teacher required' using errcode='42501';end if;
 if p_offset is null or p_offset<0 then raise exception 'invalid page' using errcode='22023';end if;
 select count(*)into v_count from dars_private.group_feedback f join public.groups g on g.id=f.group_id where (v_role='admin' and f.status<>'withdrawn')or(v_role='teacher' and g.teacher_id=auth.uid() and f.status='approved');
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)into v_rows from(select f.id,f.group_id,g.name as group_name,f.rating,f.comment,f.status,f.reply_pending,f.reply_public,f.version,case when v_role='admin' then f.admin_note else null end as admin_note
 from dars_private.group_feedback f join public.groups g on g.id=f.group_id where(v_role='admin' and f.status<>'withdrawn')or(v_role='teacher' and g.teacher_id=auth.uid() and f.status='approved') order by (f.status='pending' or f.reply_pending<>'')desc,f.updated_at desc,f.id offset p_offset limit 20)x;
 return jsonb_build_object('rows',v_rows,'total',v_count);
end $$;
revoke all on function public.my_group_feedback(uuid),public.save_group_feedback(uuid,integer,text,bigint),public.withdraw_group_feedback(uuid,bigint),public.teacher_reply_feedback(uuid,text,bigint),public.moderate_group_feedback(uuid,text,text,bigint),public.manage_group_feedback_page(integer),public.public_group_feedback(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.my_group_feedback(uuid),public.save_group_feedback(uuid,integer,text,bigint),public.withdraw_group_feedback(uuid,bigint),public.teacher_reply_feedback(uuid,text,bigint),public.moderate_group_feedback(uuid,text,text,bigint),public.manage_group_feedback_page(integer) to authenticated;
grant execute on function public.public_group_feedback(uuid,integer) to anon,authenticated;
commit;
