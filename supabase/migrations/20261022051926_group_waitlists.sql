begin;

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','promoted','withdrawn','closed')),
  enrollment_id uuid references public.enrollments(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(group_id,student_id),
  check (status='promoted' or enrollment_id is null)
);
create index waitlist_entries_group_waiting_idx on public.waitlist_entries(group_id,created_at,id) where status='waiting';
create index waitlist_entries_student_created_idx on public.waitlist_entries(student_id,created_at desc,id desc);
alter table public.waitlist_entries enable row level security;
revoke all on public.waitlist_entries from public,anon,authenticated,service_role;
grant select on public.waitlist_entries to authenticated;
create policy waitlist_entries_read on public.waitlist_entries for select to authenticated
  using (student_id=(select auth.uid()) or public.is_group_owner(group_id));

alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check
  check (kind in ('lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed',
    'enrollment_requested','teacher_review_requested','teacher_review_decision','teacher_fee_announcement',
    'enrollment_accepted','booking_updated','waitlist_promoted'));

create or replace function dars_private.close_group_waitlist()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  if old.status is distinct from 'archived'::public.group_status and new.status='archived'::public.group_status then
    -- The group row is already locked by the archive transaction. Keep this
    -- trigger below the group lock in the documented group -> waitlist order.
    update public.waitlist_entries set status='closed',updated_at=statement_timestamp()
      where group_id=new.id and status='waiting';
  end if;
  return new;
end $$;
revoke all on function dars_private.close_group_waitlist() from public,anon,authenticated,service_role;
create trigger close_group_waitlist_after_archive after update of status on public.groups
  for each row execute function dars_private.close_group_waitlist();

create or replace function public.join_group_waitlist(p_group_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare
  v_uid uuid:=auth.uid(); v_teacher uuid; v_group public.groups; v_entry public.waitlist_entries;
  v_enrollment public.enrollments; v_count integer; v_has_entry boolean;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='student' and p.status='active') then
    raise exception 'active student required' using errcode='42501';
  end if;
  select teacher_id into v_teacher from public.groups where id=p_group_id;
  if v_teacher is null then raise exception 'published group unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select * into v_group from public.groups where id=p_group_id for update;
  if not found or v_group.teacher_id is distinct from v_teacher or v_group.status is distinct from 'published'::public.group_status
     or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
       where p.id=v_teacher and p.role='teacher' and p.status='active' and tp.approved and dars_private.teacher_has_access(v_teacher)) then
    raise exception 'published group unavailable';
  end if;
  select * into v_enrollment from public.enrollments where group_id=p_group_id and student_id=v_uid for update;
  if found and v_enrollment.status in ('pending','accepted') then raise exception 'already enrolled'; end if;
  select * into v_entry from public.waitlist_entries where group_id=p_group_id and student_id=v_uid for update;
  v_has_entry:=found;
  if v_has_entry then
    if v_entry.status='waiting' then return v_entry.id; end if;
  end if;
  select count(*) into v_count from public.enrollments where group_id=p_group_id and status='accepted';
  if v_count<v_group.capacity then raise exception 'group has available seats'; end if;
  if v_has_entry then
    update public.waitlist_entries set status='waiting',enrollment_id=null,created_at=statement_timestamp(),updated_at=statement_timestamp()
      where id=v_entry.id returning * into v_entry;
    return v_entry.id;
  end if;
  insert into public.waitlist_entries(group_id,student_id) values(p_group_id,v_uid) returning * into v_entry;
  return v_entry.id;
end $$;

create or replace function public.withdraw_group_waitlist(p_entry_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_group_id uuid; v_entry public.waitlist_entries;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.status='active') then
    raise exception 'active student required' using errcode='42501';
  end if;
  select group_id into v_group_id from public.waitlist_entries where id=p_entry_id and student_id=auth.uid();
  if v_group_id is null then raise exception 'waitlist entry not found'; end if;
  perform 1 from public.groups where id=v_group_id for update;
  select * into v_entry from public.waitlist_entries where id=p_entry_id and student_id=auth.uid() for update;
  if not found then raise exception 'waitlist entry not found'; end if;
  if v_entry.status='waiting' then
    update public.waitlist_entries set status='withdrawn',updated_at=statement_timestamp() where id=p_entry_id;
  elsif v_entry.status<>'withdrawn' then
    raise exception 'waitlist entry is no longer waiting';
  end if;
end $$;

create or replace function public.promote_group_waitlist(p_entry_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare
  v_group_id uuid; v_student_id uuid; v_teacher_id uuid; v_group public.groups;
  v_entry public.waitlist_entries; v_enrollment public.enrollments; v_count integer; v_result uuid;
begin
  select e.group_id,e.student_id,g.teacher_id into v_group_id,v_student_id,v_teacher_id
    from public.waitlist_entries e join public.groups g on g.id=e.group_id where e.id=p_entry_id;
  if v_group_id is null then raise exception 'waitlist entry not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
  select * into v_group from public.groups where id=v_group_id for update;
  if not found or v_group.teacher_id is distinct from v_teacher_id then raise exception 'waitlist entry not found'; end if;
  if auth.uid() is distinct from v_teacher_id or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
       where p.id=v_teacher_id and p.role='teacher' and p.status='active' and tp.approved and dars_private.teacher_has_access(v_teacher_id)) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if v_group.status is distinct from 'published'::public.group_status then raise exception 'published group unavailable'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_student_id and p.role='student' and p.status='active') then
    raise exception 'student unavailable';
  end if;
  -- Lock an existing enrollment before the waitlist row, following the shared
  -- teacher-calendar -> group -> enrollment -> waitlist lock order.
  select * into v_enrollment from public.enrollments where group_id=v_group_id and student_id=v_student_id for update;
  select * into v_entry from public.waitlist_entries where id=p_entry_id for update;
  if not found or v_entry.group_id<>v_group_id or v_entry.student_id<>v_student_id then raise exception 'waitlist entry not found'; end if;
  if v_entry.status='promoted' and v_entry.enrollment_id is not null then
    if v_enrollment.id=v_entry.enrollment_id and v_enrollment.status in ('pending','accepted') then return v_entry.enrollment_id; end if;
    raise exception 'promoted enrollment is no longer active';
  end if;
  if v_entry.status<>'waiting' then raise exception 'waitlist entry is not waiting'; end if;
  select count(*) into v_count from public.enrollments where group_id=v_group_id and status='accepted';
  if v_count>=v_group.capacity then raise exception 'group is full'; end if;
  if v_enrollment.id is not null then
    if v_enrollment.status not in ('rejected','cancelled','removed') then raise exception 'student already has an active enrollment'; end if;
    update public.enrollments set status='pending'::public.enrollment_status,updated_at=statement_timestamp()
      where id=v_enrollment.id returning id into v_result;
  else
    insert into public.enrollments(group_id,student_id,status) values(v_group_id,v_student_id,'pending') returning id into v_result;
  end if;
  update public.waitlist_entries set status='promoted',enrollment_id=v_result,updated_at=statement_timestamp() where id=p_entry_id;
  return v_result;
end $$;

create or replace function public.student_waitlist_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$
declare v_uid uuid:=auth.uid(); v_total bigint; v_rows jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='student' and p.status='active') then raise exception 'active student required' using errcode='42501'; end if;
  select count(*) into v_total from public.waitlist_entries where student_id=v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,
    'status',q.status,'enrollment_id',q.enrollment_id,'created_at',q.created_at,'updated_at',q.updated_at) order by q.created_at desc,q.id desc),'[]'::jsonb)
    into v_rows from (select e.id,e.group_id,g.name group_name,p.full_name teacher_name,e.status,e.enrollment_id,e.created_at,e.updated_at
      from public.waitlist_entries e join public.groups g on g.id=e.group_id join public.profiles p on p.id=g.teacher_id
      where e.student_id=v_uid order by e.created_at desc,e.id desc offset p_offset limit p_limit) q;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.teacher_waitlist_page(p_query text default '',p_group_id uuid default null,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare v_uid uuid:=auth.uid(); v_total bigint; v_rows jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if v_uid is null or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
    where p.id=v_uid and p.role='teacher' and p.status='active' and tp.approved and dars_private.teacher_has_access(v_uid)) then raise exception 'active approved teacher required' using errcode='42501'; end if;
  with matched as (
    select e.id,e.group_id,g.name group_name,e.student_id,sp.full_name student_name,p.full_name teacher_name,
      e.status,e.enrollment_id,e.created_at,e.updated_at,g.capacity,g.status group_status,
      (select count(*) from public.enrollments en where en.group_id=g.id and en.status='accepted') accepted_count,
      tp.approved teacher_approved
    from public.waitlist_entries e join public.groups g on g.id=e.group_id
    join public.profiles sp on sp.id=e.student_id join public.profiles p on p.id=g.teacher_id
    join public.teacher_profiles tp on tp.id=p.id
    where g.teacher_id=v_uid and e.status='waiting' and (p_group_id is null or g.id=p_group_id)
      and (coalesce(btrim(p_query),'')='' or sp.full_name ilike '%'||btrim(p_query)||'%' or g.name ilike '%'||btrim(p_query)||'%')
  )
  select count(*) into v_total from matched;
  with matched as (
    select e.id,e.group_id,g.name group_name,e.student_id,sp.full_name student_name,p.full_name teacher_name,e.status,e.enrollment_id,e.created_at,e.updated_at,
      (g.status='published' and tp.approved and sp.role='student' and sp.status='active'
       and (select count(*) from public.enrollments en where en.group_id=g.id and en.status='accepted')<g.capacity) can_promote
    from public.waitlist_entries e join public.groups g on g.id=e.group_id join public.profiles sp on sp.id=e.student_id
    join public.profiles p on p.id=g.teacher_id join public.teacher_profiles tp on tp.id=p.id
    where g.teacher_id=v_uid and e.status='waiting' and (p_group_id is null or g.id=p_group_id)
      and (coalesce(btrim(p_query),'')='' or sp.full_name ilike '%'||btrim(p_query)||'%' or g.name ilike '%'||btrim(p_query)||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'group_name',q.group_name,'teacher_name',q.teacher_name,
    'student_id',q.student_id,'student_name',q.student_name,'status',q.status,'enrollment_id',q.enrollment_id,
    'created_at',q.created_at,'updated_at',q.updated_at,'can_promote',q.can_promote) order by q.created_at,q.id),'[]'::jsonb)
    into v_rows from (select * from matched order by created_at,id offset p_offset limit p_limit) q;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function dars_private.notify_waitlist_promoted()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_group public.groups;
begin
  if new.status<>'promoted' or (tg_op='UPDATE' and old.status='promoted') then return new; end if;
  select * into v_group from public.groups where id=new.group_id;
  if not found then return new; end if;
  perform dars_private.add_user_notification(new.student_id,'waitlist_promoted','waitlist-promoted:'||new.id::text||':'||new.updated_at::text||':'||txid_current()::text,
    jsonb_build_object('waitlist_id',new.id,'enrollment_id',new.enrollment_id,'group_id',v_group.id,'group_name',v_group.name,
      'route','/student/classes'));
  return new;
end $$;
revoke all on function dars_private.notify_waitlist_promoted() from public,anon,authenticated,service_role;
create trigger user_notifications_waitlist_promoted after insert or update of status on public.waitlist_entries
  for each row execute function dars_private.notify_waitlist_promoted();

create or replace function dars_private.notify_enrollment_requested()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$ declare v_group public.groups; v_student text; begin
  if new.status<>'pending' or (tg_op='UPDATE' and old.status='pending') then return new; end if;
  select * into v_group from public.groups where id=new.group_id;
  if not found or auth.uid()=v_group.teacher_id then return new; end if;
  select full_name into v_student from public.profiles where id=new.student_id and role='student' and status='active';
  if v_student is null then return new; end if;
  perform dars_private.add_user_notification(v_group.teacher_id,'enrollment_requested','enrollment:'||new.id::text||':'||txid_current(),jsonb_build_object('student_name',v_student,'group_name',v_group.name,'group_id',v_group.id));
  return new;
end $$;

create or replace function dars_private.email_enrollment_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_teacher uuid; v_group_name text; v_student_name text; v_transition text;
begin
  if new.status<>'pending'::public.enrollment_status then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select g.teacher_id,g.name,p.full_name into v_teacher,v_group_name,v_student_name
    from public.groups g join public.profiles p on p.id=new.student_id where g.id=new.group_id;
  if v_teacher is null or auth.uid()=v_teacher then return new; end if;
  v_transition:=txid_current()::text;
  perform dars_private.enqueue_email('enrollment-request:'||new.id::text||':'||v_transition,'enrollment_requested',v_teacher,false,
    jsonb_build_object('enrollment_id',new.id,'teacher_id',v_teacher,'group_id',new.group_id,
      'student_name',left(coalesce(v_student_name,''),160),'group_name',left(coalesce(v_group_name,''),160)));
  return new;
end $$;

create or replace function public.request_enrollment(p_group_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare v_uid uuid:=auth.uid(); v_teacher uuid; v_group public.groups; v_enrollment public.enrollments; v_count integer;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='student' and p.status='active') then raise exception 'only active students may request'; end if;
  select teacher_id into v_teacher from public.groups where id=p_group_id;
  if v_teacher is null then raise exception 'published group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select * into v_group from public.groups where id=p_group_id for update;
  if not found or v_group.teacher_id is distinct from v_teacher or v_group.status is distinct from 'published'::public.group_status
     or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id
       where p.id=v_teacher and p.role='teacher' and p.status='active' and tp.approved and dars_private.teacher_has_access(v_teacher)) then raise exception 'published group not found'; end if;
  select * into v_enrollment from public.enrollments where group_id=p_group_id and student_id=v_uid for update;
  if found and v_enrollment.status in ('pending','accepted') then return v_enrollment.id; end if;
  if exists(select 1 from public.waitlist_entries where group_id=p_group_id and student_id=v_uid and status='waiting' for update) then
    raise exception 'withdraw from waitlist first';
  end if;
  select count(*) into v_count from public.enrollments where group_id=p_group_id and status='accepted';
  if v_count>=v_group.capacity then raise exception 'group full; join waitlist'; end if;
  insert into public.enrollments(group_id,student_id) values(p_group_id,v_uid)
    on conflict(group_id,student_id) do update set status='pending'::public.enrollment_status,updated_at=statement_timestamp()
      where public.enrollments.status in ('rejected','cancelled','removed')
    returning * into v_enrollment;
  if not found then raise exception 'enrollment request unavailable'; end if;
  return v_enrollment.id;
end $$;

revoke all on function public.join_group_waitlist(uuid),public.withdraw_group_waitlist(uuid),public.promote_group_waitlist(uuid),
  public.student_waitlist_page(integer,integer),public.teacher_waitlist_page(text,uuid,integer,integer),public.request_enrollment(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.join_group_waitlist(uuid),public.withdraw_group_waitlist(uuid),public.promote_group_waitlist(uuid),
  public.student_waitlist_page(integer,integer),public.teacher_waitlist_page(text,uuid,integer,integer),public.request_enrollment(uuid)
  to authenticated;
commit;
