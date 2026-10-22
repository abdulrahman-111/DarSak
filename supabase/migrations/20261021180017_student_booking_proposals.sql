begin;

alter table public.booking_slots
  add column source text not null default 'teacher_published'
    check (source in ('teacher_published','student_proposed')),
  add column proposed_by uuid references public.profiles(id) on delete cascade,
  add constraint booking_slot_source_proposer_check check (
    (source='teacher_published' and proposed_by is null) or
    (source='student_proposed' and proposed_by is not null)
  );

create or replace function public.publish_booking_slot(p_group_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_teacher uuid:=auth.uid(); v_slot uuid;
begin
 if not dars_private.booking_actor('teacher') or not dars_private.booking_teacher_access(v_teacher) then raise exception 'not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if p_starts_at is null or p_ends_at is null or p_starts_at<=statement_timestamp() or p_starts_at>statement_timestamp()+interval '365 days' or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '4 hours' then raise exception 'invalid booking time' using errcode='22023'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and g.teacher_id=v_teacher and g.status='published') then raise exception 'published group not found' using errcode='42501'; end if;
 if exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=v_teacher and l.status<>'cancelled' and l.starts_at<p_ends_at and l.ends_at>p_starts_at)
 or exists(select 1 from public.booking_slots s where s.teacher_id=v_teacher and s.source='teacher_published' and s.status='open' and s.starts_at<p_ends_at and s.ends_at>p_starts_at)
 or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where s.teacher_id=v_teacher and r.status='accepted' and s.starts_at<p_ends_at and s.ends_at>p_starts_at) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
 insert into public.booking_slots(group_id,teacher_id,starts_at,ends_at) values(p_group_id,v_teacher,p_starts_at,p_ends_at) returning id into v_slot;
 return v_slot;
end $$;

create or replace function public.request_booking(p_slot_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_slot public.booking_slots; v_req uuid;
begin
 if not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 select * into v_slot from public.booking_slots where id=p_slot_id;
 if not found or v_slot.source<>'teacher_published' then raise exception 'slot unavailable' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_slot.teacher_id::text,0));
 perform 1 from public.booking_slots where id=p_slot_id and source='teacher_published' and status='open' and starts_at>statement_timestamp() for update;
 if not found then raise exception 'slot unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from public.groups g where g.id=v_slot.group_id and g.status='published' and g.teacher_id=v_slot.teacher_id) or not dars_private.booking_teacher_access(v_slot.teacher_id) then raise exception 'slot unavailable' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_uid::text,0));
 perform 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.group_id=v_slot.group_id and e.student_id=v_uid and e.status='accepted' and p.role='student' and p.status='active' for update of e,p;
 if not found then raise exception 'accepted student membership required' using errcode='42501'; end if;
 if exists(select 1 from public.booking_requests r where r.slot_id=p_slot_id and r.status='accepted') then raise exception 'slot already booked' using errcode='22023'; end if;
 if exists(select 1 from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.student_id=v_uid and e.status='accepted' where l.status<>'cancelled' and l.starts_at<v_slot.ends_at and l.ends_at>v_slot.starts_at)
 or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.student_id=v_uid and r.status='accepted' and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at)
 or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where s.teacher_id=v_slot.teacher_id and r.status='accepted' and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
 insert into public.booking_requests(slot_id,student_id) values(p_slot_id,v_uid) returning id into v_req;
 return v_req;
end $$;

create or replace function public.propose_booking_time(p_group_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_teacher uuid; v_current_teacher uuid; v_request uuid;
begin
 if not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 select teacher_id into v_teacher from public.groups where id=p_group_id and status='published';
 if v_teacher is null then raise exception 'published group not found' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_uid::text,0));
 select teacher_id into v_current_teacher from public.groups where id=p_group_id and status='published' for share;
 if not found or v_current_teacher is distinct from v_teacher then raise exception 'published group not found' using errcode='42501'; end if;
 perform 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.group_id=p_group_id and e.student_id=v_uid and e.status='accepted' and p.role='student' and p.status='active' for update of e,p;
 if not found or not dars_private.booking_teacher_access(v_teacher) then raise exception 'accepted student membership required' using errcode='42501'; end if;
 if p_starts_at is null or p_ends_at is null or p_starts_at<=statement_timestamp() or p_starts_at>statement_timestamp()+interval '365 days' or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '4 hours' then raise exception 'invalid booking time' using errcode='22023'; end if;
 select r.id into v_request from public.booking_requests r join public.booking_slots s on s.id=r.slot_id
 where r.student_id=v_uid and r.status in ('pending','accepted') and s.group_id=p_group_id and s.teacher_id=v_teacher and s.source='student_proposed' and s.status='open' and s.starts_at=p_starts_at and s.ends_at=p_ends_at limit 1;
 if v_request is not null then return v_request; end if;
 if exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=v_teacher and l.status<>'cancelled' and l.starts_at<p_ends_at and l.ends_at>p_starts_at)
 or exists(select 1 from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.student_id=v_uid and e.status='accepted' where l.status<>'cancelled' and l.starts_at<p_ends_at and l.ends_at>p_starts_at)
 or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.status='accepted' and ((s.teacher_id=v_teacher and s.starts_at<p_ends_at and s.ends_at>p_starts_at) or (r.student_id=v_uid and s.starts_at<p_ends_at and s.ends_at>p_starts_at))) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
 if (select count(*) from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.student_id=v_uid and r.status='pending' and s.source='student_proposed' and s.status='open' and s.starts_at>statement_timestamp())>=20 then raise exception 'proposal limit reached' using errcode='22023'; end if;
 insert into public.booking_slots(group_id,teacher_id,starts_at,ends_at,source,proposed_by) values(p_group_id,v_teacher,p_starts_at,p_ends_at,'student_proposed',v_uid) returning id into v_request;
 insert into public.booking_requests(slot_id,student_id) values(v_request,v_uid) returning id into v_request;
 return v_request;
end $$;

create or replace function public.decide_booking(p_request_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_slot public.booking_slots; v_student uuid; v_status text;
begin
 select s.* into v_slot from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.id=p_request_id;
 select r.student_id,r.status into v_student,v_status from public.booking_requests r where r.id=p_request_id;
 if not found or auth.uid() is distinct from v_slot.teacher_id or not dars_private.booking_actor('teacher') or not dars_private.booking_teacher_access(v_slot.teacher_id) then raise exception 'not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_slot.teacher_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_student::text,0));
 select * into v_slot from public.booking_slots where id=v_slot.id for update;
 perform 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.group_id=v_slot.group_id and e.student_id=v_student and e.status='accepted' and p.role='student' and p.status='active' for update of e,p;
 if not found then raise exception 'accepted student membership required' using errcode='42501'; end if;
 select r.status into v_status from public.booking_requests r where r.id=p_request_id and r.slot_id=v_slot.id and r.student_id=v_student for update;
 if not found or v_status<>'pending' or v_slot.status<>'open' or v_slot.starts_at<=statement_timestamp() or not exists(select 1 from public.groups g where g.id=v_slot.group_id and g.teacher_id=v_slot.teacher_id and g.status='published') or not dars_private.booking_teacher_access(v_slot.teacher_id) then raise exception 'request is no longer pending' using errcode='22023'; end if;
 if p_accept then
  if exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=v_slot.teacher_id and l.status<>'cancelled' and l.starts_at<v_slot.ends_at and l.ends_at>v_slot.starts_at)
  or exists(select 1 from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.student_id=v_student and e.status='accepted' where l.status<>'cancelled' and l.starts_at<v_slot.ends_at and l.ends_at>v_slot.starts_at)
  or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.id<>p_request_id and r.status='accepted' and ((s.teacher_id=v_slot.teacher_id and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at) or (r.student_id=v_student and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at))) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
  update public.booking_requests set status='accepted' where id=p_request_id;
  update public.booking_requests set status='declined' where slot_id=v_slot.id and id<>p_request_id and status='pending';
 else update public.booking_requests set status='declined' where id=p_request_id; end if;
end $$;

create or replace function public.booking_page(p_scope text,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if p_scope not in ('teacher','student') or not dars_private.booking_actor(case when p_scope='teacher' then 'teacher'::public.user_role else 'student'::public.user_role end) or (p_scope='teacher' and not dars_private.booking_active_teacher(auth.uid())) then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into v_total from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where (p_scope='teacher' and s.teacher_id=auth.uid()) or (p_scope='student' and r.student_id=auth.uid());
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'slot_id',q.slot_id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,'student_name',q.student_name,'starts_at',q.starts_at,'ends_at',q.ends_at,'status',q.status,'source',q.source) order by q.created_at desc),'[]'::jsonb) into v_rows from (select r.id,r.slot_id,s.group_id,g.name group_name,tp.full_name teacher_name,case when p_scope='teacher' then sp.full_name else null end student_name,s.starts_at,s.ends_at,r.status,r.created_at,s.source from public.booking_requests r join public.booking_slots s on s.id=r.slot_id join public.groups g on g.id=s.group_id join public.profiles tp on tp.id=s.teacher_id join public.profiles sp on sp.id=r.student_id where (p_scope='teacher' and s.teacher_id=auth.uid()) or (p_scope='student' and r.student_id=auth.uid()) order by r.created_at desc offset p_offset limit p_limit) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.student_available_booking_slots(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into v_total from public.booking_slots s join public.groups g on g.id=s.group_id join public.enrollments e on e.group_id=g.id and e.student_id=auth.uid() and e.status='accepted' where s.source='teacher_published' and s.status='open' and s.starts_at>statement_timestamp() and g.status='published' and dars_private.booking_teacher_access(s.teacher_id) and not exists(select 1 from public.lessons l join public.enrollments se on se.group_id=l.group_id and se.student_id=auth.uid() and se.status='accepted' where l.status<>'cancelled' and l.starts_at<s.ends_at and l.ends_at>s.starts_at) and not exists(select 1 from public.booking_requests r join public.booking_slots a on a.id=r.slot_id where r.status='accepted' and ((r.student_id=auth.uid() and a.starts_at<s.ends_at and a.ends_at>s.starts_at) or (a.teacher_id=s.teacher_id and a.starts_at<s.ends_at and a.ends_at>s.starts_at))) and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.status='accepted') and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.student_id=auth.uid() and r.status in ('pending','accepted'));
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,'starts_at',q.starts_at,'ends_at',q.ends_at,'status',q.status) order by q.starts_at),'[]'::jsonb) into v_rows from (select s.id,g.id group_id,g.name group_name,p.full_name teacher_name,s.starts_at,s.ends_at,s.status from public.booking_slots s join public.groups g on g.id=s.group_id join public.profiles p on p.id=s.teacher_id join public.enrollments e on e.group_id=g.id and e.student_id=auth.uid() and e.status='accepted' where s.source='teacher_published' and s.status='open' and s.starts_at>statement_timestamp() and g.status='published' and dars_private.booking_teacher_access(s.teacher_id) and not exists(select 1 from public.lessons l join public.enrollments se on se.group_id=l.group_id and se.student_id=auth.uid() and se.status='accepted' where l.status<>'cancelled' and l.starts_at<s.ends_at and l.ends_at>s.starts_at) and not exists(select 1 from public.booking_requests r join public.booking_slots a on a.id=r.slot_id where r.status='accepted' and ((r.student_id=auth.uid() and a.starts_at<s.ends_at and a.ends_at>s.starts_at) or (a.teacher_id=s.teacher_id and a.starts_at<s.ends_at and a.ends_at>s.starts_at))) and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.status='accepted') and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.student_id=auth.uid() and r.status in ('pending','accepted')) order by s.starts_at offset p_offset limit p_limit) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.teacher_booking_slots(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if not dars_private.booking_actor('teacher') or not dars_private.booking_active_teacher(auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into v_total from public.booking_slots where teacher_id=auth.uid() and source='teacher_published';
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,'starts_at',q.starts_at,'ends_at',q.ends_at,'status',q.status) order by q.starts_at desc),'[]'::jsonb) into v_rows from (select s.id,g.id group_id,g.name group_name,p.full_name teacher_name,s.starts_at,s.ends_at,s.status from public.booking_slots s join public.groups g on g.id=s.group_id join public.profiles p on p.id=s.teacher_id where s.teacher_id=auth.uid() and s.source='teacher_published' order by s.starts_at desc offset p_offset limit p_limit) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.student_booking_group_choices(p_query text default '',p_selected uuid default null)
returns table(id uuid,name text,teacher_name text) language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
begin
 if not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 return query select g.id,g.name,p.full_name from public.groups g join public.profiles p on p.id=g.teacher_id join public.enrollments e on e.group_id=g.id and e.student_id=auth.uid() and e.status='accepted' where g.status='published' and dars_private.booking_teacher_access(g.teacher_id) and (g.id=p_selected or p_query is null or btrim(p_query)='' or g.name ilike '%'||btrim(p_query)||'%') order by (g.id=p_selected) desc,g.name limit 50;
end $$;

create or replace function dars_private.booking_guard_lesson()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_teacher uuid; v_student uuid;
begin
 select teacher_id into v_teacher from public.groups where id=new.group_id;
 if v_teacher is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if new.status<>'cancelled' then
  if exists(select 1 from public.booking_slots s where s.teacher_id=v_teacher and s.source='teacher_published' and s.status='open' and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'lesson overlaps booking slot' using errcode='23P01'; end if;
  for v_student in select e.student_id from public.enrollments e where e.group_id=new.group_id and e.status='accepted' order by e.student_id loop
   perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_student::text,0));
   if exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.student_id=v_student and r.status='accepted' and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'lesson conflicts with accepted booking' using errcode='23P01'; end if;
  end loop;
  if exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where s.teacher_id=v_teacher and r.status='accepted' and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'lesson conflicts with accepted booking' using errcode='23P01'; end if;
 end if;
 return new;
end $$;

create or replace function dars_private.notify_booking_update()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_slot public.booking_slots; v_group text; v_student text; v_event text; v_payload jsonb; v_recipient uuid;
begin
 if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
 select * into v_slot from public.booking_slots where id=new.slot_id;
 if not found then return new; end if;
 select name into v_group from public.groups where id=v_slot.group_id;
 select full_name into v_student from public.profiles where id=new.student_id;
 v_event:='booking:'||new.id::text||':'||new.status||':'||txid_current();
 v_payload:=jsonb_build_object('group_id',v_slot.group_id,'group_name',v_group,'booking_id',new.id,'status',new.status,'starts_at',v_slot.starts_at,'student_name',v_student,'source',v_slot.source);
 if tg_op='INSERT' and new.status='pending' then perform dars_private.add_user_notification(v_slot.teacher_id,'booking_updated',v_event,v_payload); return new; end if;
 if tg_op='UPDATE' and new.status in ('accepted','declined') then perform dars_private.add_user_notification(new.student_id,'booking_updated',v_event,v_payload); return new; end if;
 if tg_op='UPDATE' and new.status='withdrawn' then perform dars_private.add_user_notification(v_slot.teacher_id,'booking_updated',v_event,v_payload); return new; end if;
 if tg_op='UPDATE' and new.status in ('cancelled') then
  if auth.uid() is null or public.current_role()='admin'::public.user_role then
   perform dars_private.add_user_notification(new.student_id,'booking_updated',v_event,v_payload);
   perform dars_private.add_user_notification(v_slot.teacher_id,'booking_updated',v_event,v_payload);
  elsif auth.uid()=new.student_id then perform dars_private.add_user_notification(v_slot.teacher_id,'booking_updated',v_event,v_payload);
  elsif auth.uid()=v_slot.teacher_id then perform dars_private.add_user_notification(new.student_id,'booking_updated',v_event,v_payload);
  end if;
 end if;
 return new;
end $$;

-- Delete only legacy pending alerts incorrectly sent to the request author.
delete from public.user_notifications n using public.booking_requests r join public.booking_slots s on s.id=r.slot_id
where n.recipient_id=r.student_id and n.kind='booking_updated' and n.payload->>'status'='pending' and n.payload->>'booking_id'=r.id::text;

revoke all on function public.propose_booking_time(uuid,timestamptz,timestamptz),public.student_booking_group_choices(text,uuid) from public,anon,service_role;
grant execute on function public.propose_booking_time(uuid,timestamptz,timestamptz),public.student_booking_group_choices(text,uuid) to authenticated;
revoke all on function public.publish_booking_slot(uuid,timestamptz,timestamptz),public.request_booking(uuid),public.decide_booking(uuid,boolean),public.booking_page(text,integer,integer),public.student_available_booking_slots(integer,integer),public.teacher_booking_slots(integer,integer) from public,anon,service_role;
grant execute on function public.publish_booking_slot(uuid,timestamptz,timestamptz),public.request_booking(uuid),public.decide_booking(uuid,boolean),public.booking_page(text,integer,integer),public.student_available_booking_slots(integer,integer),public.teacher_booking_slots(integer,integer) to authenticated;
commit;
