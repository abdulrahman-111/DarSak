-- Future teacher plans and quota enforcement. Policy is deliberately disabled by default.
begin;
create schema if not exists dars_private;

create table dars_private.teacher_plan_entitlements (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  plan_code text not null check (plan_code in ('standard','pro')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  updated_version bigint not null default 1 check (updated_version > 0),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create table dars_private.teacher_plan_assignments (
  id bigint generated always as identity primary key,
  teacher_id uuid not null,
  plan_code text not null check (plan_code in ('standard','pro')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  transaction_reference text not null unique check (length(btrim(transaction_reference)) between 1 and 200),
  assigned_by uuid not null,
  entitlement_version bigint not null,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create table dars_private.teacher_quota_policy (
  singleton boolean primary key default true check (singleton),
  quotas_enabled boolean not null default false,
  effective_at timestamptz not null default '2026-11-14 22:00:00+00',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into dars_private.teacher_quota_policy(singleton,quotas_enabled,effective_at) values(true,false,'2026-11-14 22:00:00+00');
revoke all on dars_private.teacher_plan_entitlements,dars_private.teacher_plan_assignments,dars_private.teacher_quota_policy from public,anon,authenticated;

create or replace function dars_private.reject_plan_audit_mutation() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin raise exception 'plan assignment audit is append-only'; end $$;
create trigger teacher_plan_assignments_append_only before update or delete on dars_private.teacher_plan_assignments
for each row execute function dars_private.reject_plan_audit_mutation();
revoke all on function dars_private.reject_plan_audit_mutation() from public,anon,authenticated;

create or replace function dars_private.plan_quota_active() returns boolean
language sql volatile security definer set search_path=pg_catalog,dars_private as $$
 select p.quotas_enabled and statement_timestamp() >= p.effective_at
 from dars_private.teacher_quota_policy p where p.singleton
$$;
revoke all on function dars_private.plan_quota_active() from public,anon,authenticated;

create or replace function public.teacher_plan_status()
returns table(plan_code text, plan_active boolean, starts_at timestamptz, expires_at timestamptz,
 updated_version bigint, quotas_enabled boolean, quotas_effective_at timestamptz,
 active_groups bigint, stored_files bigint, stored_bytes bigint, limits jsonb)
language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth,storage as $$
declare v_uid uuid:=auth.uid(); v_code text; v_start timestamptz; v_exp timestamptz; v_ver bigint; v_en boolean; v_at timestamptz;
begin
 if v_uid is null or not public.is_active_user(v_uid) or public.current_role() is distinct from 'teacher'::public.user_role then raise exception 'active teacher only'; end if;
 select e.plan_code,e.starts_at,e.expires_at,e.updated_version into v_code,v_start,v_exp,v_ver from dars_private.teacher_plan_entitlements e where e.teacher_id=v_uid;
 select p.quotas_enabled,p.effective_at into v_en,v_at from dars_private.teacher_quota_policy p where p.singleton;
 return query select coalesce(v_code,'free'),coalesce(v_code is not null and v_start<=statement_timestamp() and v_exp>statement_timestamp(),false),v_start,v_exp,coalesce(v_ver,0),coalesce(v_en,false),v_at,
 (select count(*) from public.groups g where g.teacher_id=v_uid and g.status in ('draft','published')),
 (select count(*) from storage.objects o where o.bucket_id='lesson-materials' and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and lower(split_part(o.name,'/',1))=v_uid::text),
 (select coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 10485760 end),0)::bigint from storage.objects o where o.bucket_id='lesson-materials' and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and lower(split_part(o.name,'/',1))=v_uid::text),
 case when v_code is not null and v_start<=statement_timestamp() and v_exp>statement_timestamp()
   then case when v_code='pro' then jsonb_build_object('groups',20,'files',500,'bytes',1073741824,'file_bytes',10485760) else jsonb_build_object('groups',5,'files',100,'bytes',262144000,'file_bytes',10485760) end
   else jsonb_build_object('groups',0,'files',0,'bytes',0,'file_bytes',10485760) end;
end $$;
revoke all on function public.teacher_plan_status() from public,anon;
grant execute on function public.teacher_plan_status() to authenticated;

create or replace function public.admin_teacher_plan_status(p_teacher_id uuid)
returns table(plan_code text, plan_active boolean, starts_at timestamptz, expires_at timestamptz,
 updated_version bigint, quotas_enabled boolean, quotas_effective_at timestamptz,
 active_groups bigint, stored_files bigint, stored_bytes bigint, limits jsonb)
language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth,storage as $$
declare v_code text; v_start timestamptz; v_exp timestamptz; v_ver bigint; v_en boolean; v_at timestamptz;
begin
 if auth.uid() is null or not public.is_active_user() or public.current_role() is distinct from 'admin'::public.user_role then raise exception 'active admin only'; end if;
 select e.plan_code,e.starts_at,e.expires_at,e.updated_version into v_code,v_start,v_exp,v_ver from dars_private.teacher_plan_entitlements e where e.teacher_id=p_teacher_id;
 select p.quotas_enabled,p.effective_at into v_en,v_at from dars_private.teacher_quota_policy p where p.singleton;
 return query select coalesce(v_code,'free'),coalesce(v_code is not null and v_start<=statement_timestamp() and v_exp>statement_timestamp(),false),v_start,v_exp,coalesce(v_ver,0),coalesce(v_en,false),v_at,
 (select count(*) from public.groups g where g.teacher_id=p_teacher_id and g.status in ('draft','published')),
 (select count(*) from storage.objects o where o.bucket_id='lesson-materials' and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and lower(split_part(o.name,'/',1))=p_teacher_id::text),
 (select coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 10485760 end),0)::bigint from storage.objects o where o.bucket_id='lesson-materials' and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and lower(split_part(o.name,'/',1))=p_teacher_id::text),
 case when v_code is not null and v_start<=statement_timestamp() and v_exp>statement_timestamp()
   then case when v_code='pro' then jsonb_build_object('groups',20,'files',500,'bytes',1073741824,'file_bytes',10485760) else jsonb_build_object('groups',5,'files',100,'bytes',262144000,'file_bytes',10485760) end
   else jsonb_build_object('groups',0,'files',0,'bytes',0,'file_bytes',10485760) end;
end $$;
revoke all on function public.admin_teacher_plan_status(uuid) from public,anon;
grant execute on function public.admin_teacher_plan_status(uuid) to authenticated;

create or replace function public.admin_assign_teacher_plan(p_teacher_id uuid,p_plan_code text,p_expected_version bigint,p_transaction_reference text)
returns table(assignment_id bigint,starts_at timestamptz,expires_at timestamptz,entitlement_version bigint,already_recorded boolean)
language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_old dars_private.teacher_plan_entitlements%rowtype; v_ref dars_private.teacher_plan_assignments%rowtype; v_start timestamptz; v_exp timestamptz; v_ver bigint; v_id bigint; v_policy dars_private.teacher_quota_policy%rowtype;
begin
 if auth.uid() is null or not public.is_active_user() or public.current_role() is distinct from 'admin'::public.user_role then raise exception 'active admin only'; end if;
 if p_plan_code is null or p_plan_code not in ('standard','pro') or p_expected_version is null or p_expected_version<0 or length(btrim(coalesce(p_transaction_reference,''))) not between 1 and 200 then raise exception 'invalid plan assignment' using errcode='22023'; end if;
 select * into v_policy from dars_private.teacher_quota_policy where singleton for share;
 if not v_policy.quotas_enabled or statement_timestamp()<v_policy.effective_at then raise exception 'manual plan assignment is unavailable before quota policy activation' using errcode='55000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_teacher_id::text,0));
 select * into v_ref from dars_private.teacher_plan_assignments a where a.transaction_reference=btrim(p_transaction_reference);
 if found then
   if v_ref.teacher_id<>p_teacher_id or v_ref.plan_code<>p_plan_code then raise exception 'transaction reference already belongs to another assignment' using errcode='23505'; end if;
   return query select v_ref.id,v_ref.starts_at,v_ref.expires_at,v_ref.entitlement_version,true; return;
 end if;
 if not exists(select 1 from public.profiles p where p.id=p_teacher_id and p.role='teacher') then raise exception 'teacher account required'; end if;
 select * into v_old from dars_private.teacher_plan_entitlements e where e.teacher_id=p_teacher_id for update;
 if coalesce(v_old.updated_version,0)<>p_expected_version then raise exception 'plan version conflict' using errcode='40001'; end if;
 if v_old.teacher_id is not null and v_old.expires_at>statement_timestamp() and v_old.plan_code<>p_plan_code then
   raise exception 'cannot change plans before the current plan expires' using errcode='55000';
 end if;
 if v_old.teacher_id is not null and v_old.expires_at>statement_timestamp() and v_old.plan_code=p_plan_code then
   v_start:=v_old.starts_at;
   v_exp:=((v_old.expires_at at time zone 'Africa/Cairo') + interval '1 month') at time zone 'Africa/Cairo';
 else
   v_start:=greatest(statement_timestamp(),coalesce(v_old.expires_at,statement_timestamp()),v_policy.effective_at);
   v_exp:=((v_start at time zone 'Africa/Cairo') + interval '1 month') at time zone 'Africa/Cairo';
 end if;
 v_ver:=coalesce(v_old.updated_version,0)+1;
 insert into dars_private.teacher_plan_entitlements(teacher_id,plan_code,starts_at,expires_at,updated_version,updated_at)
 values(p_teacher_id,p_plan_code,v_start,v_exp,v_ver,now()) on conflict(teacher_id) do update set plan_code=excluded.plan_code,starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_version=excluded.updated_version,updated_at=excluded.updated_at;
 insert into dars_private.teacher_plan_assignments(teacher_id,plan_code,starts_at,expires_at,transaction_reference,assigned_by,entitlement_version)
 values(p_teacher_id,p_plan_code,v_start,v_exp,btrim(p_transaction_reference),auth.uid(),v_ver) returning id into v_id;
 return query select v_id,v_start,v_exp,v_ver,false;
end $$;
revoke all on function public.admin_assign_teacher_plan(uuid,text,bigint,text) from public,anon;
grant execute on function public.admin_assign_teacher_plan(uuid,text,bigint,text) to authenticated;

create or replace function public.admin_set_teacher_quota_policy(p_enabled boolean,p_effective_at timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
begin
 if auth.uid() is null or not public.is_active_user() or public.current_role() is distinct from 'admin'::public.user_role then raise exception 'active admin only'; end if;
 if p_effective_at < '2026-11-14 22:00:00+00'::timestamptz then raise exception 'quota effective date cannot precede 2026-11-15 Africa/Cairo'; end if;
 update dars_private.teacher_quota_policy set quotas_enabled=p_enabled,effective_at=p_effective_at,updated_by=auth.uid(),updated_at=now() where singleton;
end $$;
revoke all on function public.admin_set_teacher_quota_policy(boolean,timestamptz) from public,anon;
grant execute on function public.admin_set_teacher_quota_policy(boolean,timestamptz) to authenticated;

-- Keep approved teachers' existing free access through the promised free phase,
-- without extending pending applications or creating renewal requests. Once the
-- policy is enabled and effective, an active paid entitlement can independently
-- satisfy the existing teaching access predicate.
create or replace function dars_private.teacher_has_access(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,dars_private as $$
 select
   exists(select 1 from dars_private.teacher_access_state s where s.teacher_id=p_teacher_id and s.starts_at<=statement_timestamp() and s.expires_at>statement_timestamp()
      and not exists(select 1 from public.teacher_profiles t join public.profiles p on p.id=t.id where t.id=p_teacher_id and p.status='active' and t.approved and exists(select 1 from dars_private.teacher_quota_policy q where q.singleton and q.quotas_enabled and statement_timestamp()>=q.effective_at)))
   or exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
      where p.id=p_teacher_id and p.role='teacher' and p.status='active' and t.approved
        and not exists(select 1 from dars_private.teacher_quota_policy q where q.singleton and q.quotas_enabled and statement_timestamp()>=q.effective_at))
   or exists(select 1 from dars_private.teacher_plan_entitlements e
      where e.teacher_id=p_teacher_id and e.starts_at<=statement_timestamp() and e.expires_at>statement_timestamp()
        and exists(select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id where p.id=e.teacher_id and p.role='teacher' and p.status='active' and t.approved)
        and dars_private.plan_quota_active());
$$;
revoke all on function dars_private.teacher_has_access(uuid) from public,service_role;
grant execute on function dars_private.teacher_has_access(uuid) to authenticated;
grant execute on function dars_private.teacher_has_access(uuid) to anon;

-- Keep the old endpoint callable during the free phase, but prevent it from
-- extending the legacy grant once paid plan policy activation has begun.
alter function public.renew_teacher_access() set schema dars_private;
alter function dars_private.renew_teacher_access() rename to legacy_renew_teacher_access;
revoke all on function dars_private.legacy_renew_teacher_access() from public,anon,authenticated,service_role;
create or replace function public.renew_teacher_access()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
begin
 if dars_private.plan_quota_active() then raise exception 'teacher renewal is unavailable under active plan policy' using errcode='55000'; end if;
 return dars_private.legacy_renew_teacher_access();
end $$;
revoke all on function public.renew_teacher_access() from public,anon,service_role;
grant execute on function public.renew_teacher_access() to authenticated;

create or replace function public.teacher_access_status()
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_uid uuid:=auth.uid(); v_expires timestamptz; v_starts timestamptz; v_enabled boolean; v_effective timestamptz;
 v_en text; v_ar text; v_pending uuid; v_now timestamptz:=clock_timestamp(); v_can boolean; v_free boolean; v_plan dars_private.teacher_plan_entitlements%rowtype;
begin
 if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='teacher' and p.status='active') then raise exception 'active teacher only' using errcode='42501'; end if;
 select starts_at,expires_at into v_starts,v_expires from dars_private.teacher_access_state where teacher_id=v_uid;
 select fees_enabled,effective_at,announcement_en,announcement_ar into v_enabled,v_effective,v_en,v_ar from dars_private.teacher_access_fee_policy where singleton;
 select id into v_pending from dars_private.teacher_access_requests where teacher_id=v_uid and status='pending';
 select * into v_plan from dars_private.teacher_plan_entitlements e where e.teacher_id=v_uid and e.starts_at<=v_now and e.expires_at>v_now;
 v_free:=exists(select 1 from public.teacher_profiles t join public.profiles p on p.id=t.id where t.id=v_uid and t.approved and p.status='active') and not dars_private.plan_quota_active();
 v_can:=false;
 if v_plan.teacher_id is not null then v_starts:=v_plan.starts_at; v_expires:=v_plan.expires_at;
 elsif v_free then
   v_starts:=coalesce(v_starts,(select p.created_at from public.profiles p where p.id=v_uid),v_now);
   v_expires:=null;
 end if;
 return jsonb_build_object('has_access',dars_private.teacher_has_access(v_uid),'starts_at',v_starts,'expires_at',v_expires,
   'renewal_opens_at',null,
   'can_renew',v_can,'fees_enabled',coalesce(v_enabled,false),'fee_effective_at',v_effective,'announcement_en',v_en,'announcement_ar',v_ar,'pending_request_id',v_pending);
end $$;
revoke all on function public.teacher_access_status() from public,anon;
grant execute on function public.teacher_access_status() to authenticated;

create or replace function dars_private.enforce_group_plan_quota() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_limit integer; v_count bigint; v_increase boolean; v_old_id uuid;
begin
 if not dars_private.plan_quota_active() then return new; end if;
 if tg_op='UPDATE' then v_old_id:=old.id; end if;
 v_increase:=new.status in ('draft','published') and (tg_op='INSERT' or old.status not in ('draft','published') or old.teacher_id is distinct from new.teacher_id);
 if not v_increase then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.teacher_id::text,0));
 select case when e.plan_code='pro' then 20 else 5 end into v_limit from dars_private.teacher_plan_entitlements e where e.teacher_id=new.teacher_id and e.starts_at<=statement_timestamp() and e.expires_at>statement_timestamp();
 v_limit:=coalesce(v_limit,0);
 select count(*) into v_count from public.groups g where g.teacher_id=new.teacher_id and g.status in ('draft','published') and (v_old_id is null or g.id<>v_old_id);
 if v_count>=v_limit then raise exception 'teacher group quota reached' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function dars_private.enforce_group_plan_quota() from public,anon,authenticated;
drop trigger if exists groups_plan_quota_guard on public.groups;
create trigger groups_plan_quota_guard before insert or update of status,teacher_id on public.groups for each row execute function dars_private.enforce_group_plan_quota();

create or replace function dars_private.enforce_lesson_object_quota() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,dars_private,storage as $$
declare v_teacher uuid; v_count bigint; v_bytes bigint; v_newbytes bigint; v_old_id uuid; v_old_teacher uuid; v_old_bytes bigint; v_countlimit integer; v_bylimit bigint;
begin
 if tg_table_name <> 'objects' or new.bucket_id is distinct from 'lesson-materials' then return new; end if;
 if tg_op='UPDATE' and new.metadata is not distinct from old.metadata and new.name is not distinct from old.name and new.bucket_id is not distinct from old.bucket_id then return new; end if;
 if not dars_private.plan_quota_active() then return new; end if;
 if new.name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' then raise exception 'invalid lesson storage path'; end if;
 v_teacher:=split_part(new.name,'/',1)::uuid;
 -- Storage may insert an object before size metadata is populated. Count an unknown
 -- size at the existing per-object cap so upload completion cannot bypass quota.
 v_newbytes:=case when new.metadata->>'size' ~ '^[0-9]+$' then (new.metadata->>'size')::bigint else 10485760 end;
 if v_newbytes<1 or v_newbytes>10485760 then raise exception 'lesson file size limit exceeded'; end if;
 if tg_op='UPDATE' then
   v_old_id:=old.id; v_old_teacher:=case when old.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then split_part(old.name,'/',1)::uuid end;
   v_old_bytes:=case when old.metadata->>'size' ~ '^[0-9]+$' then (old.metadata->>'size')::bigint else 10485760 end;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
 select case when e.plan_code='pro' then 500 else 100 end,case when e.plan_code='pro' then 1073741824 else 262144000 end into v_countlimit,v_bylimit from dars_private.teacher_plan_entitlements e where e.teacher_id=v_teacher and e.starts_at<=statement_timestamp() and e.expires_at>statement_timestamp();
 v_countlimit:=coalesce(v_countlimit,0); v_bylimit:=coalesce(v_bylimit,0);
 select count(*),coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 10485760 end),0) into v_count,v_bytes from storage.objects o where o.bucket_id='lesson-materials' and split_part(o.name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and lower(split_part(o.name,'/',1))=v_teacher::text and (v_old_id is null or o.id<>v_old_id);
 if tg_op='INSERT' and (v_count+1>v_countlimit or v_bytes+v_newbytes>v_bylimit) then raise exception 'teacher storage quota reached' using errcode='23514'; end if;
 if tg_op='UPDATE' and (old.bucket_id is distinct from 'lesson-materials' or v_old_teacher is distinct from v_teacher or v_newbytes>coalesce(v_old_bytes,0)) and (v_count+1>v_countlimit or v_bytes+v_newbytes>v_bylimit) then raise exception 'teacher storage quota reached' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function dars_private.enforce_lesson_object_quota() from public,anon,authenticated;
drop trigger if exists storage_lesson_plan_quota_guard on storage.objects;
create trigger storage_lesson_plan_quota_guard before insert or update on storage.objects for each row execute function dars_private.enforce_lesson_object_quota();
commit;
