begin;

create table public.booking_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at and ends_at-starts_at <= interval '4 hours'),
  check (starts_at > created_at and starts_at <= created_at + interval '365 days')
);
create index booking_slots_teacher_idx on public.booking_slots(teacher_id,starts_at desc);
create index booking_slots_group_idx on public.booking_slots(group_id,starts_at);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.booking_slots(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_requests_student_idx on public.booking_requests(student_id,created_at desc);
create index booking_requests_slot_idx on public.booking_requests(slot_id,created_at desc);
create unique index booking_one_accepted_per_slot on public.booking_requests(slot_id) where status='accepted';
create unique index booking_one_active_per_student_slot on public.booking_requests(slot_id,student_id) where status in ('pending','accepted');
create trigger booking_slots_touch before update on public.booking_slots for each row execute function public.touch_updated_at();
create trigger booking_requests_touch before update on public.booking_requests for each row execute function public.touch_updated_at();

create or replace function dars_private.can_read_booking_slot(p_slot uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active') and exists(
  select 1 from public.booking_slots s where s.id=p_slot and
   ((s.teacher_id=auth.uid() and exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved))
    or exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.student_id=auth.uid())))
$$;
create or replace function dars_private.can_read_booking_request(p_request uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active') and exists(
  select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.id=p_request and
   (r.student_id=auth.uid() or (s.teacher_id=auth.uid() and exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=auth.uid() and p.role='teacher' and p.status='active' and t.approved))))
$$;
revoke all on function dars_private.can_read_booking_slot(uuid),dars_private.can_read_booking_request(uuid) from public,anon,authenticated,service_role;
grant execute on function dars_private.can_read_booking_slot(uuid),dars_private.can_read_booking_request(uuid) to authenticated;

alter table public.booking_slots enable row level security;
alter table public.booking_requests enable row level security;
revoke all on public.booking_slots,public.booking_requests from public,anon,authenticated,service_role;
grant select on public.booking_slots,public.booking_requests to authenticated;
create policy booking_slots_private_read on public.booking_slots for select to authenticated using (dars_private.can_read_booking_slot(id));
create policy booking_requests_private_read on public.booking_requests for select to authenticated using (dars_private.can_read_booking_request(id));

create or replace function dars_private.booking_actor(p_role public.user_role)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=p_role and p.status='active')
$$;
create or replace function dars_private.booking_active_teacher(p_teacher uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
 select exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
 where p.id=p_teacher and p.role='teacher' and p.status='active' and t.approved)
$$;
create or replace function dars_private.booking_teacher_access(p_teacher uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
 select dars_private.booking_active_teacher(p_teacher) and dars_private.teacher_has_access(p_teacher)
$$;
revoke all on function dars_private.booking_actor(public.user_role),dars_private.booking_active_teacher(uuid),dars_private.booking_teacher_access(uuid) from public,anon,authenticated,service_role;

create or replace function public.publish_booking_slot(p_group_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_teacher uuid:=auth.uid(); v_slot uuid;
begin
 if not dars_private.booking_actor('teacher') or not dars_private.booking_teacher_access(v_teacher) then raise exception 'not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if p_starts_at is null or p_ends_at is null or p_starts_at<=statement_timestamp() or p_starts_at>statement_timestamp()+interval '365 days' or p_ends_at<=p_starts_at or p_ends_at-p_starts_at>interval '4 hours' then raise exception 'invalid booking time' using errcode='22023'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and g.teacher_id=v_teacher and g.status='published') then raise exception 'published group not found' using errcode='42501'; end if;
 if exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=v_teacher and l.status<>'cancelled' and l.starts_at<p_ends_at and l.ends_at>p_starts_at)
 or exists(select 1 from public.booking_slots s where s.teacher_id=v_teacher and s.status='open' and s.starts_at<p_ends_at and s.ends_at>p_starts_at) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
 insert into public.booking_slots(group_id,teacher_id,starts_at,ends_at) values(p_group_id,v_teacher,p_starts_at,p_ends_at) returning id into v_slot;
 return v_slot;
end $$;

create or replace function public.cancel_booking_slot(p_slot_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_teacher uuid;
begin
 select teacher_id into v_teacher from public.booking_slots where id=p_slot_id;
 if not found or auth.uid() is distinct from v_teacher or not dars_private.booking_actor('teacher') or not dars_private.booking_active_teacher(v_teacher) then raise exception 'not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 update public.booking_slots set status='cancelled' where id=p_slot_id and teacher_id=v_teacher and status='open';
 update public.booking_requests set status='cancelled' where slot_id=p_slot_id and status in ('pending','accepted');
end $$;

create or replace function public.request_booking(p_slot_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_slot public.booking_slots; v_req uuid;
begin
 if not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 select * into v_slot from public.booking_slots where id=p_slot_id;
 if not found then raise exception 'slot unavailable' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_slot.teacher_id::text,0));
 perform 1 from public.booking_slots where id=p_slot_id and status='open' and starts_at>statement_timestamp() for update;
 if not found then raise exception 'slot unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from public.groups g where g.id=v_slot.group_id and g.status='published' and g.teacher_id=v_slot.teacher_id) then raise exception 'slot unavailable' using errcode='P0002'; end if;
 if not dars_private.booking_teacher_access(v_slot.teacher_id) then raise exception 'slot unavailable' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_uid::text,0));
 perform 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.group_id=v_slot.group_id and e.student_id=v_uid and e.status='accepted' and p.role='student' and p.status='active' for update of e,p;
 if not found then raise exception 'accepted student membership required' using errcode='42501'; end if;
 if exists(select 1 from public.booking_requests r where r.slot_id=p_slot_id and r.status='accepted') then raise exception 'slot already booked' using errcode='22023'; end if;
 if exists(select 1 from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.student_id=v_uid and e.status='accepted' where l.status<>'cancelled' and l.starts_at<v_slot.ends_at and l.ends_at>v_slot.starts_at)
 or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.student_id=v_uid and r.status='accepted' and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
 insert into public.booking_requests(slot_id,student_id) values(p_slot_id,v_uid) returning id into v_req;
 return v_req;
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
 if not found or v_status<>'pending' or v_slot.status<>'open' or v_slot.starts_at<=statement_timestamp()
    or not exists(select 1 from public.groups g where g.id=v_slot.group_id and g.teacher_id=v_slot.teacher_id and g.status='published')
    or not dars_private.booking_teacher_access(v_slot.teacher_id) then raise exception 'request is no longer pending' using errcode='22023'; end if;
 if p_accept then
   if exists(select 1 from public.lessons l join public.enrollments e on e.group_id=l.group_id and e.student_id=v_student and e.status='accepted' where l.status<>'cancelled' and l.starts_at<v_slot.ends_at and l.ends_at>v_slot.starts_at)
     or exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.id<>p_request_id and r.status='accepted' and ((s.teacher_id=v_slot.teacher_id and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at) or (r.student_id=v_student and s.starts_at<v_slot.ends_at and s.ends_at>v_slot.starts_at))) then raise exception 'booking time overlaps' using errcode='23P01'; end if;
   update public.booking_requests set status='accepted' where id=p_request_id;
   -- A slot is a single-student appointment. Close competing requests in the
   -- same transaction so they cannot remain actionable after acceptance.
   update public.booking_requests set status='declined'
    where slot_id=v_slot.id and id<>p_request_id and status='pending';
 else update public.booking_requests set status='declined' where id=p_request_id; end if;
end $$;

create or replace function public.cancel_my_booking(p_request_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_slot public.booking_slots; v_student uuid; v_status text;
begin
 select s.* into v_slot from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.id=p_request_id;
 select r.student_id,r.status into v_student,v_status from public.booking_requests r where r.id=p_request_id;
 if not found or auth.uid() is distinct from v_student or not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_slot.teacher_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_student::text,0));
 select * into v_slot from public.booking_slots where id=v_slot.id for update;
 select r.status into v_status from public.booking_requests r where r.id=p_request_id and r.slot_id=v_slot.id and r.student_id=v_student for update;
 update public.booking_requests set status=case when v_status='accepted' then 'cancelled' else 'withdrawn' end where id=p_request_id and student_id=v_student and status in ('pending','accepted');
end $$;

create or replace function public.booking_page(p_scope text,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if p_scope not in ('teacher','student') or not dars_private.booking_actor(case when p_scope='teacher' then 'teacher'::public.user_role else 'student'::public.user_role end)
   or (p_scope='teacher' and not dars_private.booking_active_teacher(auth.uid())) then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into v_total from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where (p_scope='teacher' and s.teacher_id=auth.uid()) or (p_scope='student' and r.student_id=auth.uid());
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'slot_id',q.slot_id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,'student_name',q.student_name,'starts_at',q.starts_at,'ends_at',q.ends_at,'status',q.status) order by q.created_at desc),'[]'::jsonb) into v_rows from (
 select r.id,r.slot_id,s.group_id,g.name group_name,tp.full_name teacher_name,case when p_scope='teacher' then sp.full_name else null end student_name,s.starts_at,s.ends_at,r.status,r.created_at
 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id join public.groups g on g.id=s.group_id join public.profiles tp on tp.id=s.teacher_id join public.profiles sp on sp.id=r.student_id
 where (p_scope='teacher' and s.teacher_id=auth.uid()) or (p_scope='student' and r.student_id=auth.uid()) order by r.created_at desc offset p_offset limit p_limit
 ) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.student_available_booking_slots(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if not dars_private.booking_actor('student') then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into v_total from public.booking_slots s join public.groups g on g.id=s.group_id join public.enrollments e on e.group_id=g.id and e.student_id=auth.uid() and e.status='accepted'
 where s.status='open' and s.starts_at>statement_timestamp() and g.status='published' and dars_private.booking_teacher_access(s.teacher_id)
 and not exists(select 1 from public.lessons l join public.enrollments se on se.group_id=l.group_id and se.student_id=auth.uid() and se.status='accepted' where l.status<>'cancelled' and l.starts_at<s.ends_at and l.ends_at>s.starts_at)
 and not exists(select 1 from public.booking_requests r join public.booking_slots a on a.id=r.slot_id where r.student_id=auth.uid() and r.status='accepted' and a.starts_at<s.ends_at and a.ends_at>s.starts_at)
 and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.status='accepted') and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.student_id=auth.uid() and r.status in ('pending','accepted'));
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,'starts_at',q.starts_at,'ends_at',q.ends_at,'status',q.status) order by q.starts_at),'[]'::jsonb) into v_rows from (
 select s.id,g.id group_id,g.name group_name,p.full_name teacher_name,s.starts_at,s.ends_at,s.status from public.booking_slots s join public.groups g on g.id=s.group_id join public.profiles p on p.id=s.teacher_id join public.enrollments e on e.group_id=g.id and e.student_id=auth.uid() and e.status='accepted'
 where s.status='open' and s.starts_at>statement_timestamp() and g.status='published' and dars_private.booking_teacher_access(s.teacher_id)
 and not exists(select 1 from public.lessons l join public.enrollments se on se.group_id=l.group_id and se.student_id=auth.uid() and se.status='accepted' where l.status<>'cancelled' and l.starts_at<s.ends_at and l.ends_at>s.starts_at)
 and not exists(select 1 from public.booking_requests r join public.booking_slots a on a.id=r.slot_id where r.student_id=auth.uid() and r.status='accepted' and a.starts_at<s.ends_at and a.ends_at>s.starts_at)
 and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.status='accepted') and not exists(select 1 from public.booking_requests r where r.slot_id=s.id and r.student_id=auth.uid() and r.status in ('pending','accepted')) order by s.starts_at offset p_offset limit p_limit
 ) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.teacher_booking_slots(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if not dars_private.booking_actor('teacher') or not dars_private.booking_active_teacher(auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
 select count(*) into v_total from public.booking_slots where teacher_id=auth.uid();
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,'starts_at',q.starts_at,'ends_at',q.ends_at,'status',q.status) order by q.starts_at desc),'[]'::jsonb) into v_rows from (
 select s.id,g.id group_id,g.name group_name,p.full_name teacher_name,s.starts_at,s.ends_at,s.status from public.booking_slots s join public.groups g on g.id=s.group_id join public.profiles p on p.id=s.teacher_id where s.teacher_id=auth.uid() order by s.starts_at desc offset p_offset limit p_limit
 ) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

-- Calendar writers and bookings serialize against the same per-teacher lock.
create or replace function dars_private.booking_guard_lesson()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_teacher uuid; v_student uuid;
begin
 select teacher_id into v_teacher from public.groups where id=new.group_id;
 if v_teacher is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if new.status<>'cancelled' then
  if exists(select 1 from public.booking_slots s where s.teacher_id=v_teacher and s.status='open' and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'lesson overlaps booking slot' using errcode='23P01'; end if;
  for v_student in select e.student_id from public.enrollments e where e.group_id=new.group_id and e.status='accepted' order by e.student_id loop
   perform pg_advisory_xact_lock(hashtextextended('student-booking:'||v_student::text,0));
   if exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.student_id=v_student and r.status='accepted' and s.starts_at<new.ends_at and s.ends_at>new.starts_at) then raise exception 'lesson conflicts with accepted booking' using errcode='23P01'; end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function dars_private.booking_guard_lesson() from public,anon,authenticated,service_role;
create trigger booking_guard_lesson before insert or update of group_id,starts_at,ends_at,status on public.lessons for each row execute function dars_private.booking_guard_lesson();

create or replace function dars_private.booking_guard_enrollment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_teacher uuid; v_lesson record;
begin
 if new.status='accepted' and (tg_op='INSERT' or old.status is distinct from new.status) then
  select teacher_id into v_teacher from public.groups where id=new.group_id;
  if v_teacher is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  perform pg_advisory_xact_lock(hashtextextended('student-booking:'||new.student_id::text,0));
  for v_lesson in select starts_at,ends_at from public.lessons where group_id=new.group_id and status<>'cancelled' and ends_at>statement_timestamp() order by starts_at loop
   if exists(select 1 from public.booking_requests r join public.booking_slots s on s.id=r.slot_id where r.student_id=new.student_id and r.status='accepted' and s.starts_at<v_lesson.ends_at and s.ends_at>v_lesson.starts_at) then raise exception 'enrollment conflicts with accepted booking' using errcode='23P01'; end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function dars_private.booking_guard_enrollment() from public,anon,authenticated,service_role;
create trigger booking_guard_enrollment before insert or update of status on public.enrollments for each row execute function dars_private.booking_guard_enrollment();

-- The legacy enrollment decision locks group then enrollment. Booking and
-- lesson writers lock teacher calendar first, so acquire that lock before the
-- group row here to keep enrollment acceptance in the same order.
create or replace function public.decide_enrollment(p_enrollment_id uuid,p_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_group_id uuid; v_teacher uuid; v_group public.groups; v_enrollment public.enrollments; v_count integer;
begin
 if public.current_role()='teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()),false) then raise exception 'teacher teaching access expired' using errcode='42501'; end if;
 select group_id into v_group_id from public.enrollments where id=p_enrollment_id;
 if not found then raise exception 'not authorized'; end if;
 select teacher_id into v_teacher from public.groups where id=v_group_id;
 if not found then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 select * into v_group from public.groups where id=v_group_id for update;
 if not found then raise exception 'not authorized'; end if;
 select * into v_enrollment from public.enrollments where id=p_enrollment_id and group_id=v_group_id for update;
 if not found or (public.current_role() is distinct from 'admin'::public.user_role and not public.is_group_owner(v_group_id)) then raise exception 'not authorized'; end if;
 if p_status='accepted' then
  if v_group.status is distinct from 'published'::public.group_status then raise exception 'cannot accept enrollment for archived or unpublished group'; end if;
  if v_enrollment.status<>'pending' then raise exception 'only pending can be accepted'; end if;
  select count(*) into v_count from public.enrollments where group_id=v_group_id and status='accepted'::public.enrollment_status;
  if v_count>=v_group.capacity then raise exception 'group is full'; end if;
 elsif p_status='rejected' and v_enrollment.status<>'pending' then raise exception 'only pending can be rejected';
 elsif p_status='removed' and v_enrollment.status<>'accepted' then raise exception 'only accepted can be removed';
 elsif p_status not in ('accepted','rejected','removed') then raise exception 'invalid decision'; end if;
 update public.enrollments set status=p_status::public.enrollment_status where id=v_enrollment.id;
 insert into public.notifications(user_id,kind,title_ar,title_en,href) values
  (v_enrollment.student_id,'enrollment_decision',case when p_status='accepted' then 'تم قبول طلب الانضمام' when p_status='removed' then 'تمت إزالة عضويتك' else 'تم رفض طلب الانضمام' end,
   case when p_status='accepted' then 'Your enrollment was accepted' when p_status='removed' then 'Your membership was removed' else 'Your enrollment was rejected' end,'/student/classes');
end $$;

create or replace function dars_private.cancel_group_bookings()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
 if new.status='archived' and old.status is distinct from new.status then
  update public.booking_slots set status='cancelled' where group_id=new.id and status='open';
  update public.booking_requests r set status='cancelled' from public.booking_slots s where r.slot_id=s.id and s.group_id=new.id and r.status in ('pending','accepted');
 end if;
 return new;
end $$;
revoke all on function dars_private.cancel_group_bookings() from public,anon,authenticated,service_role;
create trigger booking_cancel_on_archive after update of status on public.groups for each row execute function dars_private.cancel_group_bookings();

create or replace function dars_private.cancel_membership_bookings()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
 if old.status='accepted' and new.status<>'accepted' then
  update public.booking_requests r set status='cancelled' from public.booking_slots s where r.slot_id=s.id and s.group_id=new.group_id and r.student_id=new.student_id and r.status in ('pending','accepted');
 end if;
 return new;
end $$;
revoke all on function dars_private.cancel_membership_bookings() from public,anon,authenticated,service_role;
create trigger booking_cancel_on_membership_change after update of status on public.enrollments for each row execute function dars_private.cancel_membership_bookings();

alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check check(kind in (
 'lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed','enrollment_requested','teacher_review_requested','teacher_review_decision','teacher_fee_announcement','enrollment_accepted','booking_updated'));
create or replace function dars_private.notify_booking_update()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_slot public.booking_slots; v_event text; v_payload jsonb;
begin
 if old.status is not distinct from new.status then return new; end if;
 select * into v_slot from public.booking_slots where id=new.slot_id;
 if not found then return new; end if;
 v_event:='booking:'||new.id::text||':'||new.status||':'||txid_current();
 v_payload:=jsonb_build_object('group_id',v_slot.group_id,'booking_id',new.id,'status',new.status);
 perform dars_private.add_user_notification(new.student_id,'booking_updated',v_event,v_payload);
 perform dars_private.add_user_notification(v_slot.teacher_id,'booking_updated',v_event,v_payload);
 return new;
end $$;
revoke all on function dars_private.notify_booking_update() from public,anon,authenticated,service_role;
create trigger booking_request_notification after update of status on public.booking_requests for each row execute function dars_private.notify_booking_update();
create trigger booking_request_notification_insert after insert on public.booking_requests for each row execute function dars_private.notify_booking_update();

revoke all on function public.publish_booking_slot(uuid,timestamptz,timestamptz),public.cancel_booking_slot(uuid),public.request_booking(uuid),public.decide_booking(uuid,boolean),public.cancel_my_booking(uuid),public.booking_page(text,integer,integer),public.student_available_booking_slots(integer,integer),public.teacher_booking_slots(integer,integer) from public,anon,service_role;
grant execute on function public.publish_booking_slot(uuid,timestamptz,timestamptz),public.cancel_booking_slot(uuid),public.request_booking(uuid),public.decide_booking(uuid,boolean),public.cancel_my_booking(uuid),public.booking_page(text,integer,integer),public.student_available_booking_slots(integer,integer),public.teacher_booking_slots(integer,integer) to authenticated;

commit;
