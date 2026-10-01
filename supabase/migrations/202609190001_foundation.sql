begin;
create extension if not exists pgcrypto;

create type public.user_role as enum ('student','teacher','admin');
create type public.user_status as enum ('active','suspended');
create type public.group_status as enum ('draft','published','archived');
create type public.enrollment_status as enum ('pending','accepted','rejected','cancelled','removed');
create type public.lesson_status as enum ('scheduled','cancelled','completed');
create type public.material_kind as enum ('file','link','note');
create type public.report_status as enum ('open','resolved');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check (length(btrim(full_name)) between 1 and 160),
 role public.user_role not null default 'student',
 status public.user_status not null default 'active',
 preferred_language text not null default 'ar' check (preferred_language in ('ar','en')),
 created_at timestamptz not null default now()
);
create table public.education_nodes (
 id uuid primary key default gen_random_uuid(), parent_id uuid references public.education_nodes(id),
 kind text not null check (kind in ('system','level','grade','university','faculty','department','year')),
 name_ar text not null, name_en text not null,
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), created_at timestamptz not null default now()
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(), name_ar text not null, name_en text not null,
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'), created_at timestamptz not null default now()
);
create table public.offerings (
 id uuid primary key default gen_random_uuid(), node_id uuid not null references public.education_nodes(id),
 subject_id uuid not null references public.subjects(id), created_at timestamptz not null default now(),
 unique(node_id,subject_id)
);
create table public.teacher_profiles (
 id uuid primary key references public.profiles(id) on delete cascade, bio text not null default '',
 headline text not null default '', avatar_path text, approved boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.student_profiles (
 id uuid primary key references public.profiles(id) on delete cascade,
 offering_id uuid references public.offerings(id) on delete set null, created_at timestamptz not null default now()
);
create table public.teacher_specializations (
 teacher_id uuid references public.teacher_profiles(id) on delete cascade,
 offering_id uuid references public.offerings(id), created_at timestamptz not null default now(),
 primary key(teacher_id,offering_id)
);
create table public.groups (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id),
 offering_id uuid not null references public.offerings(id), name text not null, description text not null default '',
 capacity integer not null check(capacity between 1 and 500), status public.group_status not null default 'draft',
 location text not null default '', created_at timestamptz not null default now()
);
create table public.group_schedule_slots (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 weekday integer not null check(weekday between 0 and 6), start_time time not null, end_time time not null,
 timezone text not null default 'Africa/Cairo' check(timezone='Africa/Cairo'), created_at timestamptz not null default now(),
 check(start_time < end_time)
);
create table public.enrollments (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 student_id uuid not null references public.profiles(id), status public.enrollment_status not null default 'pending',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(group_id,student_id)
);
create table public.lessons (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 slot_id uuid references public.group_schedule_slots(id) on delete set null, local_date date,
 title text not null, starts_at timestamptz not null, ends_at timestamptz not null,
 status public.lesson_status not null default 'scheduled', notes text not null default '',
 created_at timestamptz not null default now(), check(starts_at < ends_at)
);
create unique index lessons_generated_once on public.lessons(group_id,slot_id,local_date)
 where slot_id is not null and local_date is not null;
create table public.lesson_materials (
 id uuid primary key default gen_random_uuid(), lesson_id uuid not null references public.lessons(id) on delete cascade,
 kind public.material_kind not null, title text not null, storage_path text, url text, content text,
 file_size bigint check(file_size is null or file_size between 1 and 10485760),
 mime_type text check(mime_type is null or mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check((kind='file' and storage_path is not null and file_size is not null and mime_type is not null and url is null and content is null) or
       (kind='link' and url is not null and storage_path is null and content is null) or
       (kind='note' and content is not null and storage_path is null and url is null)),
 check(url is null or url ~* '^https?://')
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null, title_ar text not null, title_en text not null, href text,
 read_at timestamptz, created_at timestamptz not null default now(),
 check(href is null or (left(href,1)='/' and href !~ '^//'))
);
create table public.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id),
 subject text not null, description text not null, status public.report_status not null default 'open',
 admin_note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.platform_settings (
 key text primary key, value jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin new.updated_at=now(); return new; end $$;
create trigger enrollments_touch before update on public.enrollments for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.platform_settings for each row execute function public.touch_updated_at();

create or replace function public.current_role() returns public.user_role language sql stable security definer set search_path=pg_catalog,public as $$
select role from public.profiles where id=auth.uid() and status='active' $$;
create or replace function public.is_active_user(p uuid default auth.uid()) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
select exists(select 1 from public.profiles where id=p and status='active') $$;
create or replace function public.is_group_owner(gid uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
select exists(select 1 from public.groups g join public.profiles p on p.id=g.teacher_id where g.id=gid and g.teacher_id=auth.uid() and p.status='active') $$;
create or replace function public.is_group_member(gid uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
select exists(select 1 from public.enrollments where group_id=gid and student_id=auth.uid() and status='accepted') $$;

create or replace function public.validate_offering_context() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare n public.education_nodes; hs boolean; hl boolean; hu boolean;
begin
 select * into n from public.education_nodes where id=new.node_id;
 if not found or n.kind not in ('grade','university','year') then raise exception 'offering context must be grade, university, or year'; end if;
 with recursive a(id,parent_id,kind) as
 (select id,parent_id,kind from public.education_nodes where id=n.id union all
  select e.id,e.parent_id,e.kind from public.education_nodes e join a on e.id=a.parent_id)
 select bool_or(kind='system'),bool_or(kind='level'),bool_or(kind='university') into hs,hl,hu from a;
 if not coalesce(hs,false) then raise exception 'offering must belong to a system'; end if;
 if n.kind='grade' and not coalesce(hl,false) then raise exception 'grade must belong to a level'; end if;
 if n.kind='year' and not coalesce(hu,false) then raise exception 'year must belong to a university'; end if;
 return new;
end $$;
create trigger offerings_context before insert or update on public.offerings for each row execute function public.validate_offering_context();

create or replace function public.validate_teacher_reference() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=new.teacher_id and p.role='teacher')
 then raise exception 'group owner must be a teacher'; end if; return new;
end $$;
create trigger groups_teacher_reference before insert or update on public.groups for each row execute function public.validate_teacher_reference();
create or replace function public.validate_group_publish() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.status='published' and not exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=new.teacher_id and p.role='teacher' and p.status='active' and t.approved) then
  raise exception 'only an active approved teacher may publish';
 end if;
 return new;
end $$;
create trigger groups_publish_guard before insert or update on public.groups for each row execute function public.validate_group_publish();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare requested text:=new.raw_user_meta_data->>'requested_role';
begin
 if requested not in ('student','teacher') then requested:='student'; end if;
 insert into public.profiles(id,full_name,role) values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'New user'),requested::public.user_role);
 if requested='teacher' then insert into public.teacher_profiles(id) values(new.id); else insert into public.student_profiles(id) values(new.id); end if; return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.prevent_protected_profile_changes() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.role is distinct from old.role or new.status is distinct from old.status then
 if public.current_role() is distinct from 'admin'::public.user_role then raise exception 'role and status are admin-managed'; end if;
 end if; return new;
end $$;
create trigger profiles_protected before update on public.profiles for each row execute function public.prevent_protected_profile_changes();
create or replace function public.prevent_teacher_approval_change() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.approved is distinct from old.approved and public.current_role() is distinct from 'admin'::public.user_role then raise exception 'teacher approval is admin-managed'; end if; return new;
end $$;
create trigger teacher_approval_protected before update on public.teacher_profiles for each row execute function public.prevent_teacher_approval_change();

create or replace function public.request_enrollment(p_group_id uuid) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.enrollments;
begin
 if public.current_role() is distinct from 'student'::public.user_role then raise exception 'only active students may request'; end if;
 if not exists(select 1 from public.groups where id=p_group_id and status='published') then raise exception 'published group not found'; end if;
 insert into public.enrollments(group_id,student_id) values(p_group_id,auth.uid())
 on conflict(group_id,student_id) do update set status=case when public.enrollments.status in ('rejected','cancelled','removed') then 'pending' else public.enrollments.status end,updated_at=now()
 returning * into e; return e.id;
end $$;

create or replace function public.decide_enrollment(p_enrollment_id uuid,p_status text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.enrollments; cap int; n int;
begin
 select * into e from public.enrollments where id=p_enrollment_id for update;
 if not found or (public.current_role() is distinct from 'admin'::public.user_role and not public.is_group_owner(e.group_id)) then raise exception 'not authorized'; end if;
 select capacity into cap from public.groups where id=e.group_id for update;
 if p_status='accepted' then
  if e.status<>'pending' then raise exception 'only pending can be accepted'; end if;
  select count(*) into n from public.enrollments where group_id=e.group_id and status='accepted';
  if n>=cap then raise exception 'group is full'; end if;
 elsif p_status='rejected' and e.status<>'pending' then raise exception 'only pending can be rejected';
 elsif p_status='removed' and e.status<>'accepted' then raise exception 'only accepted can be removed';
 elsif p_status not in ('accepted','rejected','removed') then raise exception 'invalid decision';
 end if;
 update public.enrollments set status=p_status::public.enrollment_status where id=e.id;
 insert into public.notifications(user_id,kind,title_ar,title_en,href) values
 (e.student_id,'enrollment_decision',case when p_status='accepted' then 'تم قبول طلب الانضمام' when p_status='removed' then 'تمت إزالة عضويتك' else 'تم رفض طلب الانضمام' end,
 case when p_status='accepted' then 'Your enrollment was accepted' when p_status='removed' then 'Your membership was removed' else 'Your enrollment was rejected' end,'/student/classes');
end $$;

create or replace function public.cancel_enrollment(p_enrollment_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.enrollments where id=p_enrollment_id and student_id=auth.uid() and status in ('pending','accepted')) then raise exception 'not authorized'; end if;
 update public.enrollments set status='cancelled' where id=p_enrollment_id;
end $$;

create or replace function public.save_schedule_slot(p_group_id uuid,p_weekday int,p_start_time time,p_end_time time,p_slot_id uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare teacher uuid; rid uuid; bad boolean;
begin
 if public.current_role() is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
 if p_weekday not between 0 and 6 or p_start_time>=p_end_time then raise exception 'invalid schedule slot'; end if;
 select teacher_id into teacher from public.groups where id=p_group_id;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher::text,0));
 select exists(select 1 from public.group_schedule_slots s join public.groups g on g.id=s.group_id where g.teacher_id=teacher and s.weekday=p_weekday and s.start_time<p_end_time and s.end_time>p_start_time and s.id is distinct from p_slot_id) into bad;
 if bad then raise exception 'teacher recurring schedule overlaps'; end if;
 select exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=teacher and l.status<>'cancelled' and extract(dow from (l.starts_at at time zone 'Africa/Cairo'))::int=p_weekday and (l.starts_at at time zone 'Africa/Cairo')::time<p_end_time and (l.ends_at at time zone 'Africa/Cairo')::time>p_start_time) into bad;
 if bad then raise exception 'schedule overlaps existing lesson'; end if;
 if p_slot_id is null then insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values(p_group_id,p_weekday,p_start_time,p_end_time) returning id into rid;
 else update public.group_schedule_slots set group_id=p_group_id,weekday=p_weekday,start_time=p_start_time,end_time=p_end_time where id=p_slot_id returning id into rid; if rid is null then raise exception 'slot not found'; end if; end if;
 return rid;
end $$;

create or replace function public.create_lesson(p_group_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_notes text default '',p_lesson_id uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare teacher uuid; rid uuid; bad boolean;
begin
 if public.current_role() is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
 if p_starts_at>=p_ends_at then raise exception 'invalid lesson interval'; end if;
 select teacher_id into teacher from public.groups where id=p_group_id;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher::text,0));
 select exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=teacher and l.status<>'cancelled' and l.id is distinct from p_lesson_id and l.starts_at<p_ends_at and l.ends_at>p_starts_at) into bad;
 if bad then raise exception 'teacher dated lesson overlaps'; end if;
 if p_lesson_id is null then insert into public.lessons(group_id,title,starts_at,ends_at,notes,local_date) values(p_group_id,p_title,p_starts_at,p_ends_at,p_notes,(p_starts_at at time zone 'Africa/Cairo')::date) returning id into rid;
 else update public.lessons set group_id=p_group_id,title=p_title,starts_at=p_starts_at,ends_at=p_ends_at,notes=p_notes,local_date=(p_starts_at at time zone 'Africa/Cairo')::date where id=p_lesson_id returning id into rid; if rid is null then raise exception 'lesson not found'; end if; end if;
 return rid;
end $$;

create or replace function public.generate_lessons(p_group_id uuid,p_from date,p_until date) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare teacher uuid; d date; s record; a timestamptz; b timestamptz; bad boolean; made int:=0;
begin
 if public.current_role() is distinct from 'admin'::public.user_role and not public.is_group_owner(p_group_id) then raise exception 'not authorized'; end if;
 if p_until<p_from or p_until-p_from>90 then raise exception 'range must be 0 to 90 days'; end if;
 select teacher_id into teacher from public.groups where id=p_group_id;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher::text,0));
 for d in select generate_series(p_from,p_until,'1 day'::interval)::date loop
  for s in select * from public.group_schedule_slots where group_id=p_group_id and weekday=extract(dow from d)::int loop
   a := (d+s.start_time) at time zone 'Africa/Cairo'; b := (d+s.end_time) at time zone 'Africa/Cairo';
   select exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where g.teacher_id=teacher and l.status<>'cancelled' and l.starts_at<b and l.ends_at>a and not(l.group_id=p_group_id and l.slot_id=s.id and l.local_date=d)) into bad;
   if bad then raise exception 'generated lesson overlaps on %',d; end if;
   insert into public.lessons(group_id,slot_id,local_date,title,starts_at,ends_at) values(p_group_id,s.id,d,'Scheduled lesson',a,b) on conflict(group_id,slot_id,local_date) do nothing;
   if found then made:=made+1; end if;
  end loop;
 end loop; return made;
end $$;

create or replace function public.admin_update_user(p_user_id uuid,p_status text,p_approved boolean default null) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if public.current_role() is distinct from 'admin'::public.user_role then raise exception 'admin only'; end if;
 if p_status not in ('active','suspended') then raise exception 'invalid status'; end if;
 update public.profiles set status=p_status::public.user_status where id=p_user_id;
 if p_approved is not null then update public.teacher_profiles set approved=p_approved where id=p_user_id; end if;
end $$;
create or replace function public.group_students(p_group_id uuid) returns table(enrollment_id uuid,student_id uuid,full_name text,status text) language sql security definer set search_path=pg_catalog,public as $$
select e.id,e.student_id,p.full_name,e.status::text from public.enrollments e join public.profiles p on p.id=e.student_id
where e.group_id=p_group_id and (public.current_role()='admin' or public.is_group_owner(p_group_id)) order by p.full_name $$;
create or replace function public.public_teachers() returns table(id uuid,full_name text,headline text,bio text,avatar_path text) language sql stable security definer set search_path=pg_catalog,public as $$
select p.id,p.full_name,t.headline,t.bio,t.avatar_path from public.profiles p join public.teacher_profiles t on t.id=p.id where p.role='teacher' and p.status='active' and t.approved=true $$;

revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
grant usage on schema public to anon,authenticated;
grant select on public.education_nodes,public.subjects,public.offerings,public.groups,public.group_schedule_slots to anon,authenticated;
grant select on public.profiles,public.teacher_profiles,public.student_profiles,public.teacher_specializations,public.groups,public.group_schedule_slots,public.enrollments,public.lessons,public.lesson_materials,public.notifications,public.reports to authenticated;
grant insert,update on public.profiles,public.teacher_profiles,public.student_profiles,public.teacher_specializations,public.groups,public.group_schedule_slots,public.lesson_materials,public.reports to authenticated;
grant update on public.enrollments,public.notifications to authenticated;
revoke all on function public.current_role(),public.is_active_user(uuid),public.is_group_owner(uuid),public.is_group_member(uuid) from public,anon,authenticated;
grant execute on function public.public_teachers() to anon,authenticated;
grant execute on function public.request_enrollment(uuid),public.decide_enrollment(uuid,text),public.cancel_enrollment(uuid),public.save_schedule_slot(uuid,int,time,time,uuid),public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid),public.generate_lessons(uuid,date,date),public.admin_update_user(uuid,text,boolean),public.group_students(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.education_nodes enable row level security;
alter table public.subjects enable row level security;
alter table public.offerings enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.teacher_specializations enable row level security;
alter table public.groups enable row level security;
alter table public.group_schedule_slots enable row level security;
alter table public.enrollments enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.platform_settings enable row level security;

create policy catalogue_read on public.education_nodes for select using(true);
create policy subjects_read on public.subjects for select using(true);
create policy offerings_read on public.offerings for select using(true);
create policy profile_self_read on public.profiles for select using(id=auth.uid() or public.current_role()='admin');
create policy profile_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy teacher_read on public.teacher_profiles for select using((approved=true and exists(select 1 from public.profiles p where p.id=id and p.status='active')) or id=auth.uid() or public.current_role()='admin');
create policy teacher_update on public.teacher_profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy student_read on public.student_profiles for select using(id=auth.uid() or public.current_role()='admin');
create policy student_update on public.student_profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy specialization_all on public.teacher_specializations for all using(teacher_id=auth.uid() or public.current_role()='admin') with check(teacher_id=auth.uid() or public.current_role()='admin');
create policy groups_read on public.groups for select using((status='published' and exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=teacher_id and p.status='active' and t.approved=true)) or (teacher_id=auth.uid() and public.is_active_user()) or public.current_role()='admin' or public.is_group_member(id));
create policy groups_write on public.groups for all using((teacher_id=auth.uid() and public.is_active_user()) or public.current_role()='admin') with check((teacher_id=auth.uid() and public.is_active_user()) or public.current_role()='admin');
create policy slots_read on public.group_schedule_slots for select using(exists(select 1 from public.groups g where g.id=group_id and ((g.teacher_id=auth.uid() and public.is_active_user()) or g.status='published' or public.current_role()='admin' or public.is_group_member(g.id))));
create policy slots_write on public.group_schedule_slots for all using(exists(select 1 from public.groups g where g.id=group_id and ((g.teacher_id=auth.uid() and public.is_active_user()) or public.current_role()='admin'))) with check(exists(select 1 from public.groups g where g.id=group_id and ((g.teacher_id=auth.uid() and public.is_active_user()) or public.current_role()='admin')));
create policy enrollment_read on public.enrollments for select using(student_id=auth.uid() or public.is_group_owner(group_id) or public.current_role()='admin');
create policy lesson_read on public.lessons for select using(public.is_group_member(group_id) or public.is_group_owner(group_id) or public.current_role()='admin');
create policy material_read on public.lesson_materials for select using(exists(select 1 from public.lessons l where l.id=lesson_id and (public.is_group_member(l.group_id) or public.is_group_owner(l.group_id) or public.current_role()='admin')));
create policy material_write on public.lesson_materials for all using((uploaded_by=auth.uid() and public.is_active_user()) or public.current_role()='admin') with check(public.current_role()='admin' or (uploaded_by=auth.uid() and public.is_active_user() and storage_path ~ ('^'||auth.uid()::text||'/'||lesson_id::text||'/[^/]+$') and exists(select 1 from public.lessons l join public.groups g on g.id=l.group_id where l.id=lesson_id and g.teacher_id=auth.uid())));
create policy notification_read on public.notifications for select using(user_id=auth.uid() or public.current_role()='admin');
create policy notification_update on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy report_read on public.reports for select using(reporter_id=auth.uid() or public.current_role()='admin');
create policy report_insert on public.reports for insert with check(reporter_id=auth.uid() and public.is_active_user());
create policy report_admin on public.reports for update using(public.current_role()='admin') with check(public.current_role()='admin');
create policy settings_admin on public.platform_settings for all using(public.current_role()='admin') with check(public.current_role()='admin');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lesson-materials','lesson-materials',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.storage_lesson_access(object_name text,write_access boolean default false) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
select exists(select 1 from public.lesson_materials m join public.lessons l on l.id=m.lesson_id join public.groups g on g.id=l.group_id join public.profiles p on p.id=g.teacher_id
where m.storage_path=object_name and p.status='active' and ((write_access and (g.teacher_id=auth.uid() or public.current_role()='admin')) or (not write_access and (g.teacher_id=auth.uid() or public.is_group_member(g.id) or public.current_role()='admin')))) $$;
revoke all on function public.storage_lesson_access(text,boolean) from public,anon,authenticated;
create policy lesson_objects_read on storage.objects for select using(bucket_id='lesson-materials' and public.storage_lesson_access(name,false));
create policy lesson_objects_insert on storage.objects for insert with check(bucket_id='lesson-materials' and split_part(name,'/',1)::uuid=auth.uid() and public.storage_lesson_access(name,true));
create policy lesson_objects_update on storage.objects for update using(bucket_id='lesson-materials' and public.storage_lesson_access(name,true)) with check(bucket_id='lesson-materials' and public.storage_lesson_access(name,true));
create policy lesson_objects_delete on storage.objects for delete using(bucket_id='lesson-materials' and public.storage_lesson_access(name,true));
commit;
