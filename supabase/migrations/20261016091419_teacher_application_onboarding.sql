begin;

create table public.teacher_applications (
  teacher_id uuid primary key references public.teacher_profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','approved','declined')),
  teaching_years integer check (teaching_years is null or teaching_years between 0 and 60),
  admin_phone text not null default '',
  cv_path text,
  supporting_links text[] not null default '{}',
  attested boolean not null default false,
  snapshot jsonb,
  feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  legacy_approved boolean not null default false,
  constraint teacher_application_snapshot_object check (snapshot is null or jsonb_typeof(snapshot)='object'),
  constraint teacher_application_feedback_bound check (feedback is null or length(feedback)<=1000),
  constraint teacher_application_cv_path check (cv_path is null or cv_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$'),
  constraint teacher_application_links_count check (cardinality(supporting_links)<=3)
);

alter table public.teacher_applications enable row level security;
revoke all on public.teacher_applications from public, anon, authenticated, service_role;
grant select on public.teacher_applications to authenticated;
create policy teacher_applications_authorized_read on public.teacher_applications
  for select to authenticated using (
    (teacher_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher' and p.status='active'))
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.status='active')
  );

create or replace function dars_private.touch_teacher_application_updated_at()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin new.updated_at=now(); return new; end $$;
revoke all on function dars_private.touch_teacher_application_updated_at() from public,anon,authenticated;
create trigger teacher_applications_touch_updated_at before update on public.teacher_applications
  for each row execute function dars_private.touch_teacher_application_updated_at();
create or replace function dars_private.protect_teacher_application_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if old.status in ('submitted','approved') and new.snapshot is distinct from old.snapshot then
    raise exception 'submitted teacher application snapshot is immutable';
  end if;
  return new;
end $$;
revoke all on function dars_private.protect_teacher_application_snapshot() from public,anon,authenticated;
create trigger teacher_application_snapshot_immutable before update on public.teacher_applications
  for each row execute function dars_private.protect_teacher_application_snapshot();

insert into public.teacher_applications(teacher_id,status,legacy_approved)
select t.id,case when t.approved then 'approved' else 'draft' end,t.approved
from public.teacher_profiles t on conflict(teacher_id) do nothing;

create or replace function dars_private.initialize_teacher_application()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.teacher_applications(teacher_id,status,legacy_approved)
  values(new.id,case when new.approved then 'approved' else 'draft' end,new.approved)
  on conflict(teacher_id) do nothing;
  return new;
end $$;
revoke all on function dars_private.initialize_teacher_application() from public,anon,authenticated,service_role;
create trigger teacher_application_initialize_after_insert after insert on public.teacher_profiles
  for each row execute function dars_private.initialize_teacher_application();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('teacher-applications','teacher-applications',false,5242880,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf'];

create or replace function public.can_read_teacher_application_cv(p_path text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.status='active'
      and (p.role='admin' or (p.role='teacher' and p.id=split_part(p_path,'/',1)::uuid))
  )
$$;
create or replace function public.can_upload_teacher_application_cv(p_path text,p_metadata jsonb)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select p_path ~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$')
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher' and p.status='active')
    and lower(coalesce(p_metadata->>'mimetype',''))='application/pdf'
    and not exists(select 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=p_path)
$$;
revoke all on function public.can_read_teacher_application_cv(text) from public,anon;
revoke all on function public.can_upload_teacher_application_cv(text,jsonb) from public,anon;
grant execute on function public.can_read_teacher_application_cv(text) to authenticated;
grant execute on function public.can_upload_teacher_application_cv(text,jsonb) to authenticated;

drop policy if exists teacher_application_cv_read on storage.objects;
create policy teacher_application_cv_read on storage.objects for select to authenticated
  using(bucket_id='teacher-applications' and public.can_read_teacher_application_cv(name));
drop policy if exists teacher_application_cv_insert on storage.objects;
create policy teacher_application_cv_insert on storage.objects for insert to authenticated
  with check(bucket_id='teacher-applications' and public.can_upload_teacher_application_cv(name,metadata));
drop policy if exists teacher_application_cv_update on storage.objects;
-- Authenticated deletion is disabled entirely. A row-level delete policy can be
-- evaluated before waiting on the submit transaction's CV row lock, then run
-- after submission commits with stale draft visibility.
drop policy if exists teacher_application_cv_delete on storage.objects;
drop function if exists public.can_change_teacher_application_cv(text);

create or replace function dars_private.teacher_application_snapshot(p_teacher_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,dars_private as $$
  select jsonb_build_object(
    'full_name',p.full_name,'headline',t.headline,'avatar_path',t.avatar_path,
    'specializations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label_ar',s.name_ar||' · '||n.name_ar,'label_en',s.name_en||' · '||n.name_en) order by s.name_en,n.name_en)
      from public.teacher_specializations ts join public.offerings o on o.id=ts.offering_id join public.subjects s on s.id=o.subject_id join public.education_nodes n on n.id=o.node_id where ts.teacher_id=t.id),'[]'::jsonb),
    'profile_details',d.details,'teaching_years',a.teaching_years,'admin_phone',a.admin_phone,
    'supporting_links',to_jsonb(a.supporting_links),'cv_path',a.cv_path,'attested',a.attested
  )
  from public.profiles p join public.teacher_profiles t on t.id=p.id
  join public.teacher_profile_details d on d.teacher_id=t.id
  join public.teacher_applications a on a.teacher_id=t.id
  where t.id=p_teacher_id
$$;
revoke all on function dars_private.teacher_application_snapshot(uuid) from public,anon,authenticated,service_role;

create or replace function dars_private.teacher_application_snapshot_missing(p_snapshot jsonb)
returns text[] language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_missing text[]:=array[]::text[];
  v_details jsonb:=p_snapshot->'profile_details';
  v_phone text:=coalesce(p_snapshot->>'admin_phone','');
  v_cv_path text:=p_snapshot->>'cv_path';
begin
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'full_name','')))=0 then v_missing:=array_append(v_missing,'full_name'); end if;
  if p_snapshot is null or nullif(btrim(p_snapshot->>'avatar_path'),'') is null then v_missing:=array_append(v_missing,'photo'); end if;
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'headline','')))<5 then v_missing:=array_append(v_missing,'headline'); end if;
  if v_details is null or (coalesce(length(btrim(v_details->'about'->>'ar')),0)<80 and coalesce(length(btrim(v_details->'about'->>'en')),0)<80) then v_missing:=array_append(v_missing,'bio'); end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot->'specializations')<>'array' or jsonb_array_length(coalesce(p_snapshot->'specializations','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'specializations'); end if;
  if v_details is null or jsonb_typeof(v_details->'languages')<>'array' or jsonb_array_length(coalesce(v_details->'languages','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'languages'); end if;
  if v_details is null or not exists(
    select 1 from jsonb_array_elements(coalesce(v_details->'experience','[]'::jsonb)) e
    where length(btrim(coalesce(e->'title'->>'ar','')||coalesce(e->'title'->>'en','')))>0
      and length(btrim(coalesce(e->'organization'->>'ar','')||coalesce(e->'organization'->>'en','')))>0
      and length(btrim(coalesce(e->'description'->>'ar','')||coalesce(e->'description'->>'en','')))>0
      and e->'start_year'<>'null'::jsonb and ((e->>'current')::boolean or e->'end_year'<>'null'::jsonb)
  ) then v_missing:=array_append(v_missing,'experience'); end if;
  if v_details is null or not exists(
    select 1 from jsonb_array_elements(coalesce(v_details->'qualifications','[]'::jsonb)) q
    where length(btrim(coalesce(q->'title'->>'ar','')||coalesce(q->'title'->>'en','')))>0
      and length(btrim(coalesce(q->'organization'->>'ar','')||coalesce(q->'organization'->>'en','')))>0
      and ((q->>'current')::boolean or q->'end_year'<>'null'::jsonb)
  ) then v_missing:=array_append(v_missing,'qualifications'); end if;
  if length(btrim(coalesce(v_details->'approach'->>'ar','')))<40 and length(btrim(coalesce(v_details->'approach'->>'en','')))<40 then v_missing:=array_append(v_missing,'approach'); end if;
  if jsonb_typeof(p_snapshot->'teaching_years')<>'number' or (p_snapshot->>'teaching_years')::integer not between 0 and 60 then v_missing:=array_append(v_missing,'teaching_years'); end if;
  if length(btrim(v_phone)) not between 7 and 30 or v_phone !~ '^[0-9+() -]+$' or length(regexp_replace(v_phone,'[^0-9]','','g'))<7 then v_missing:=array_append(v_missing,'admin_phone'); end if;
  if v_cv_path is null or not exists(select 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=v_cv_path and lower(coalesce(o.metadata->>'mimetype',''))='application/pdf' and case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint end between 1 and 5242880) then v_missing:=array_append(v_missing,'cv'); end if;
  if coalesce(p_snapshot->>'attested','false')<>'true' then v_missing:=array_append(v_missing,'attestation'); end if;
  return v_missing;
end $$;
revoke all on function dars_private.teacher_application_snapshot_missing(jsonb) from public,anon,authenticated,service_role;

create or replace function dars_private.teacher_application_missing(p_teacher_id uuid)
returns text[] language sql stable security definer set search_path=pg_catalog,public,dars_private as $$
  select dars_private.teacher_application_snapshot_missing(dars_private.teacher_application_snapshot(p_teacher_id))
$$;
revoke all on function dars_private.teacher_application_missing(uuid) from public,anon,authenticated,service_role;

create or replace function public.read_teacher_application(p_teacher_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_app public.teacher_applications;
begin
  if p_teacher_id is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active'
      and ((p.id=p_teacher_id and p.role='teacher') or p.role='admin')) then raise exception 'owner or active admin only'; end if;
  select * into v_app from public.teacher_applications where teacher_id=p_teacher_id;
  if not found then return jsonb_build_object('application',null,'missing',dars_private.teacher_application_missing(p_teacher_id)); end if;
  return jsonb_build_object('application',to_jsonb(v_app),'missing',case when v_app.status in ('submitted','approved') then '[]'::jsonb else to_jsonb(dars_private.teacher_application_missing(p_teacher_id)) end);
end $$;
revoke all on function public.read_teacher_application(uuid) from public,anon;
grant execute on function public.read_teacher_application(uuid) to authenticated;

create or replace function public.save_teacher_application(
  p_teaching_years integer,p_admin_phone text,p_cv_path text,p_supporting_links text[],p_attested boolean,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare
  v_teacher_id uuid:=auth.uid(); v_app public.teacher_applications; v_links text[]:=coalesce(p_supporting_links,'{}');
begin
  perform 1 from public.teacher_profiles where id=v_teacher_id for update;
  if not found or not exists(select 1 from public.profiles p where p.id=v_teacher_id and p.role='teacher' and p.status='active') then raise exception 'active teacher only'; end if;
  select * into v_app from public.teacher_applications where teacher_id=v_teacher_id for update;
  if not found then raise exception 'teacher application not found'; end if;
  if v_app.status not in ('draft','changes_requested','declined') then raise exception 'application cannot be edited in this state'; end if;
  if p_expected_updated_at is null or v_app.updated_at is distinct from p_expected_updated_at then raise exception using errcode='PT409',message='teacher application is stale'; end if;
  if p_teaching_years is not null and p_teaching_years not between 0 and 60 then raise exception 'teaching years must be between 0 and 60' using errcode='22023'; end if;
  if cardinality(v_links)>3 or exists(select 1 from unnest(v_links) x where x is null or length(x)>500 or x !~* '^https://[^[:space:]]+$') then raise exception 'supporting links must be up to three HTTPS URLs of at most 500 characters' using errcode='22023'; end if;
  if p_cv_path is not null and (p_cv_path !~ ('^'||v_teacher_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$')
      or not exists(select 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=p_cv_path)) then raise exception 'CV must be an uploaded application PDF owned by this teacher' using errcode='22023'; end if;
  update public.teacher_applications set teaching_years=p_teaching_years,admin_phone=coalesce(p_admin_phone,''),cv_path=p_cv_path,
    supporting_links=v_links,attested=coalesce(p_attested,false),snapshot=null where teacher_id=v_teacher_id;
  return public.read_teacher_application(v_teacher_id);
end $$;
revoke all on function public.save_teacher_application(integer,text,text,text[],boolean,timestamptz) from public,anon;
grant execute on function public.save_teacher_application(integer,text,text,text[],boolean,timestamptz) to authenticated;

create or replace function public.submit_teacher_application(p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare
  v_teacher_id uuid:=auth.uid(); v_app public.teacher_applications; v_state public.teacher_review_state; v_missing text[]; v_request_id uuid;
  v_snapshot jsonb;
begin
  perform 1 from public.teacher_profiles where id=v_teacher_id for update;
  if not found or not exists(select 1 from public.profiles p where p.id=v_teacher_id and p.role='teacher' and p.status='active') then raise exception 'active teacher only'; end if;
  select * into v_state from public.teacher_review_state where teacher_id=v_teacher_id for update;
  select * into v_app from public.teacher_applications where teacher_id=v_teacher_id for update;
  if not found then raise exception 'teacher application not found'; end if;
  if v_app.status='submitted' then return public.read_teacher_application(v_teacher_id); end if;
  if v_app.status='approved' or v_app.legacy_approved then raise exception 'teacher is already approved'; end if;
  if v_app.status not in ('draft','changes_requested','declined') then raise exception 'application cannot be submitted in this state'; end if;
  if p_expected_updated_at is null or v_app.updated_at is distinct from p_expected_updated_at then raise exception using errcode='PT409',message='teacher application is stale'; end if;
  v_snapshot:=dars_private.teacher_application_snapshot(v_teacher_id);
  perform 1 from storage.objects o where o.bucket_id='teacher-applications' and o.name=v_snapshot->>'cv_path' for key share;
  v_missing:=dars_private.teacher_application_snapshot_missing(v_snapshot);
  if cardinality(v_missing)>0 then raise exception using errcode='22023',message='teacher application is incomplete',detail=array_to_string(v_missing,','); end if;
  if v_state.status='pending' then v_request_id:=v_state.request_id;
  else
    v_request_id:=gen_random_uuid();
    update public.teacher_review_state set status='pending',request_id=v_request_id,requested_at=now(),reviewed_at=null,reviewed_by=null,decline_reason=null where teacher_id=v_teacher_id;
    insert into public.teacher_review_events(teacher_id,request_id,kind,actor_user_id,source)
      values(v_teacher_id,v_request_id,'requested',v_teacher_id,'teacher_application');
  end if;
  update public.teacher_applications set status='submitted',snapshot=v_snapshot,submitted_at=now(),reviewed_at=null,reviewed_by=null,feedback=null where teacher_id=v_teacher_id;
  return public.read_teacher_application(v_teacher_id);
end $$;
revoke all on function public.submit_teacher_application(timestamptz) from public,anon;
grant execute on function public.submit_teacher_application(timestamptz) to authenticated;

create or replace function public.request_teacher_application_changes(p_teacher_id uuid,p_expected_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_app public.teacher_applications; v_state public.teacher_review_state; v_actor uuid:=auth.uid(); v_actor_role public.user_role; v_actor_status public.user_status;
begin
  perform 1 from public.teacher_profiles where id=p_teacher_id for update;
  if not found then raise exception 'teacher not found'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  if v_actor_role is distinct from 'admin'::public.user_role or v_actor_status is distinct from 'active'::public.user_status then raise exception 'active admin only'; end if;
  if v_actor=p_teacher_id then raise exception 'administrators cannot review their own teacher account'; end if;
  select * into v_state from public.teacher_review_state where teacher_id=p_teacher_id for update;
  select * into v_app from public.teacher_applications where teacher_id=p_teacher_id for update;
  if v_state.status<>'pending' or v_state.request_id is distinct from p_expected_request_id then raise exception using errcode='40001',message='teacher review request is stale'; end if;
  if v_app.status<>'submitted' or v_app.snapshot is null then raise exception 'only submitted applications can receive change requests'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'reason must be 1 to 1000 characters' using errcode='22023'; end if;
  perform dars_private.apply_teacher_review_decision(p_teacher_id,p_expected_request_id,'declined',p_reason,'admin');
  update public.teacher_applications set status='changes_requested',feedback=btrim(p_reason) where teacher_id=p_teacher_id;
end $$;
revoke all on function public.request_teacher_application_changes(uuid,uuid,text) from public,anon;
grant execute on function public.request_teacher_application_changes(uuid,uuid,text) to authenticated;

-- Extend the one canonical review decision path. Existing locks, request tokens,
-- audit events and compatibility approval update remain in the shared function.
create or replace function dars_private.apply_teacher_review_decision(
  p_teacher_id uuid,p_expected_request_id uuid,p_decision text,p_reason text,p_source text default 'admin'
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare
  v_actor uuid:=auth.uid(); v_actor_role public.user_role; v_actor_status public.user_status;
  v_target_role public.user_role; v_target_status public.user_status; v_state public.teacher_review_state;
  v_app public.teacher_applications; v_event_id uuid; v_reason text:=nullif(btrim(p_reason),'');
begin
  if p_decision not in ('approved','declined') then raise exception 'invalid teacher review decision'; end if;
  if p_source not in ('admin','legacy_admin') then raise exception 'invalid review decision source'; end if;
  if p_decision='declined' and (v_reason is null or length(v_reason)>1000) then raise exception 'decline reason must be 1 to 1000 characters'; end if;
  if p_decision='approved' then v_reason:=null; end if;
  perform 1 from public.teacher_profiles where id=p_teacher_id for update;
  if not found then raise exception 'teacher not found'; end if;
  select p.role,p.status into v_target_role,v_target_status from public.profiles p where p.id=p_teacher_id;
  select p.role,p.status into v_actor_role,v_actor_status from public.profiles p where p.id=v_actor;
  if v_actor is null or v_actor_role is distinct from 'admin'::public.user_role or v_actor_status is distinct from 'active'::public.user_status then raise exception 'active admin only'; end if;
  if p_teacher_id=v_actor then raise exception 'administrators cannot review their own teacher account'; end if;
  if v_target_role is distinct from 'teacher'::public.user_role then raise exception 'target must be a teacher'; end if;
  select * into v_state from public.teacher_review_state where teacher_id=p_teacher_id for update;
  if not found or v_state.status<>'pending' or v_state.request_id is distinct from p_expected_request_id then raise exception using errcode='40001',message='teacher review request is stale'; end if;
  select * into v_app from public.teacher_applications where teacher_id=p_teacher_id for update;
  if p_decision='approved' and not coalesce(v_app.legacy_approved,false)
     and (v_app.status<>'submitted' or v_app.snapshot is null) then
    raise exception 'teacher application must be complete and submitted before approval';
  end if;
  if p_decision='declined' and not coalesce(v_app.legacy_approved,false)
     and (v_app.status<>'submitted' or v_app.snapshot is null) then raise exception 'teacher application must be submitted before review'; end if;
  insert into public.teacher_review_events(teacher_id,request_id,kind,actor_user_id,source,reason)
    values(p_teacher_id,v_state.request_id,p_decision,v_actor,p_source,v_reason) returning id into v_event_id;
  update public.teacher_review_state set status=p_decision,reviewed_at=now(),reviewed_by=v_actor,decline_reason=v_reason where teacher_id=p_teacher_id;
  insert into dars_private.internal_teacher_review_decisions(transaction_id,teacher_id) values(txid_current(),p_teacher_id);
  update public.teacher_profiles set approved=(p_decision='approved') where id=p_teacher_id;
  update public.teacher_applications set status=p_decision,feedback=v_reason,reviewed_at=now(),reviewed_by=v_actor
    where teacher_id=p_teacher_id and not legacy_approved;
  delete from dars_private.internal_teacher_review_decisions where transaction_id=txid_current() and teacher_id=p_teacher_id;
  return v_event_id;
end $$;
revoke all on function dars_private.apply_teacher_review_decision(uuid,uuid,text,text,text) from public,anon,authenticated;

create or replace function dars_private.prevent_unsynchronized_approval_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_app public.teacher_applications;
begin
  if new.approved is distinct from old.approved and new.approved then
    select * into v_app from public.teacher_applications where teacher_id=new.id;
    if not coalesce(v_app.legacy_approved,false) and (v_app.status<>'submitted' or v_app.snapshot is null) then
      raise exception 'teacher application must be complete and submitted before approval';
    end if;
  end if;
  if new.approved is distinct from old.approved
     and coalesce(current_setting('role',true),'none')<>'service_role'
     and not exists(select 1 from dars_private.internal_teacher_review_decisions d where d.transaction_id=txid_current() and d.teacher_id=new.id) then
    raise exception 'teacher approval must use the teacher review workflow';
  end if;
  return new;
end $$;
revoke all on function dars_private.prevent_unsynchronized_approval_change() from public,anon,authenticated;

create or replace function dars_private.sync_operator_approval_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_role text:=current_setting('role',true); v_state public.teacher_review_state; v_request_id uuid; v_reason text;
begin
  if new.approved is not distinct from old.approved or exists(select 1 from dars_private.internal_teacher_review_decisions d where d.transaction_id=txid_current() and d.teacher_id=new.id) then return new; end if;
  if v_role is distinct from 'service_role' then raise exception 'teacher approval must use the teacher review workflow'; end if;
  select * into v_state from public.teacher_review_state where teacher_id=new.id for update;
  if not found then raise exception 'teacher review state not found'; end if;
  v_request_id:=v_state.request_id;
  if v_state.status<>'pending' or exists(select 1 from public.teacher_review_events e where e.teacher_id=new.id and e.request_id=v_state.request_id and e.kind in ('approved','declined')) then v_request_id:=gen_random_uuid(); end if;
  v_reason:=case when new.approved then null else 'An administrator declined this review. Update your profile and request another review.' end;
  update public.teacher_review_state set status=case when new.approved then 'approved' else 'declined' end,request_id=v_request_id,reviewed_at=now(),reviewed_by=auth.uid(),decline_reason=v_reason where teacher_id=new.id;
  insert into public.teacher_review_events(teacher_id,request_id,kind,actor_user_id,source,reason) values(new.id,v_request_id,'operator_sync',auth.uid(),'service_role',v_reason);
  update public.teacher_applications set status=case when new.approved then 'approved' else 'declined' end,reviewed_at=now(),reviewed_by=auth.uid(),feedback=v_reason where teacher_id=new.id and not legacy_approved;
  return new;
end $$;
revoke all on function dars_private.sync_operator_approval_change() from public,anon,authenticated;

commit;
