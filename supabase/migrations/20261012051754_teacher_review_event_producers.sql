create table dars_private.internal_teacher_review_decisions (
  transaction_id bigint not null,
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  primary key(transaction_id,teacher_id)
);
alter table dars_private.internal_teacher_review_decisions enable row level security;
revoke all on dars_private.internal_teacher_review_decisions from public, anon, authenticated, service_role;

create or replace function dars_private.apply_teacher_review_decision(
  p_teacher_id uuid,
  p_expected_request_id uuid,
  p_decision text,
  p_reason text,
  p_source text default 'admin'
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_target_status public.user_status;
  v_state public.teacher_review_state;
  v_event_id uuid;
  v_reason text := nullif(btrim(p_reason),'');
begin
  if p_decision not in ('approved','declined') then raise exception 'invalid teacher review decision'; end if;
  if p_source not in ('admin','legacy_admin') then raise exception 'invalid review decision source'; end if;
  if p_decision='declined' and (v_reason is null or length(v_reason)>1000) then
    raise exception 'decline reason must be 1 to 1000 characters';
  end if;
  if p_decision='approved' then v_reason := null; end if;

  -- Lock order shared by explicit decisions, the compatibility RPC and operator sync.
  perform 1 from public.teacher_profiles where id=p_teacher_id for update;
  if not found then raise exception 'teacher not found'; end if;
  select p.role,p.status into v_target_role,v_target_status
    from public.profiles p where p.id=p_teacher_id;
  select p.role,p.status into v_actor_role,v_actor_status from public.profiles p where p.id=v_actor;
  if v_actor is null or v_actor_role is distinct from 'admin'::public.user_role
     or v_actor_status is distinct from 'active'::public.user_status then raise exception 'active admin only'; end if;
  if p_teacher_id=v_actor then raise exception 'administrators cannot review their own teacher account'; end if;
  if v_target_role is distinct from 'teacher'::public.user_role then raise exception 'target must be a teacher'; end if;

  select * into v_state from public.teacher_review_state where teacher_id=p_teacher_id for update;
  if not found or v_state.status<>'pending' or v_state.request_id is distinct from p_expected_request_id then
    raise exception using errcode='40001',message='teacher review request is stale';
  end if;
  insert into public.teacher_review_events(teacher_id,request_id,kind,actor_user_id,source,reason)
    values(p_teacher_id,v_state.request_id,p_decision,v_actor,p_source,v_reason)
    returning id into v_event_id;
  update public.teacher_review_state
    set status=p_decision,reviewed_at=now(),reviewed_by=v_actor,decline_reason=v_reason
    where teacher_id=p_teacher_id;
  insert into dars_private.internal_teacher_review_decisions(transaction_id,teacher_id)
    values(txid_current(),p_teacher_id);
  update public.teacher_profiles set approved=(p_decision='approved') where id=p_teacher_id;
  delete from dars_private.internal_teacher_review_decisions
    where transaction_id=txid_current() and teacher_id=p_teacher_id;
  return v_event_id;
end $$;
revoke all on function dars_private.apply_teacher_review_decision(uuid,uuid,text,text,text) from public, anon, authenticated;

create or replace function public.admin_decide_teacher_review(
  p_teacher_id uuid,p_expected_request_id uuid,p_decision text,p_reason text default null
) returns uuid
language sql security definer
set search_path = pg_catalog, public, dars_private
as $$
  select dars_private.apply_teacher_review_decision(p_teacher_id,p_expected_request_id,p_decision,p_reason,'admin')
$$;
revoke all on function public.admin_decide_teacher_review(uuid,uuid,text,text) from public, anon;
grant execute on function public.admin_decide_teacher_review(uuid,uuid,text,text) to authenticated;

create or replace function public.request_teacher_review()
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_role public.user_role;
  v_account_status public.user_status;
  v_state public.teacher_review_state;
  v_request_id uuid;
  v_event_id uuid;
begin
  perform 1 from public.teacher_profiles where id=v_teacher_id for update;
  if not found then raise exception 'teacher profile not found'; end if;
  select p.role,p.status into v_role,v_account_status from public.profiles p where p.id=v_teacher_id;
  if v_teacher_id is null or v_role is distinct from 'teacher'::public.user_role
     or v_account_status is distinct from 'active'::public.user_status then
    raise exception 'active teacher only';
  end if;
  select * into v_state from public.teacher_review_state where teacher_id=v_teacher_id for update;
  if not found then raise exception 'teacher review state not found'; end if;
  if v_state.status='pending' then return v_state.request_id; end if;
  if v_state.status='approved' then raise exception 'teacher is already approved'; end if;

  v_request_id:=gen_random_uuid();
  update public.teacher_review_state set status='pending',request_id=v_request_id,requested_at=now(),
    reviewed_at=null,reviewed_by=null,decline_reason=null where teacher_id=v_teacher_id;
  insert into public.teacher_review_events(teacher_id,request_id,kind,actor_user_id,source)
    values(v_teacher_id,v_request_id,'requested',v_teacher_id,'teacher') returning id into v_event_id;
  return v_request_id;
end $$;
revoke all on function public.request_teacher_review() from public, anon;
grant execute on function public.request_teacher_review() to authenticated;

create or replace function dars_private.initialize_teacher_review()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_status text;
  v_request_id uuid;
begin
  v_status:=case when new.approved then 'approved' else 'pending' end;
  if new.approved then
    insert into public.teacher_review_state(teacher_id,status,request_id,requested_at)
      values(new.id,'approved',null,new.created_at) on conflict(teacher_id) do nothing;
  else
    v_request_id:=gen_random_uuid();
    insert into public.teacher_review_state(teacher_id,status,request_id,requested_at)
      values(new.id,'pending',v_request_id,new.created_at) on conflict(teacher_id) do nothing;
    if found then
      insert into public.teacher_review_events(teacher_id,request_id,kind,source)
        values(new.id,v_request_id,'requested','signup');
    end if;
  end if;
  return new;
end $$;
revoke all on function dars_private.initialize_teacher_review() from public, anon, authenticated;
create trigger teacher_review_initialize_after_insert
  after insert on public.teacher_profiles
  for each row execute function dars_private.initialize_teacher_review();

create or replace function dars_private.prevent_unsynchronized_approval_change()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, dars_private
as $$
begin
  if new.approved is distinct from old.approved
     and coalesce(current_setting('role',true),'none')<>'service_role'
     and not exists(select 1 from dars_private.internal_teacher_review_decisions d
       where d.transaction_id=txid_current() and d.teacher_id=new.id) then
    raise exception 'teacher approval must use the teacher review workflow';
  end if;
  return new;
end $$;
revoke all on function dars_private.prevent_unsynchronized_approval_change() from public, anon, authenticated;
drop trigger if exists teacher_approval_protected on public.teacher_profiles;
create trigger teacher_approval_protected before update of approved on public.teacher_profiles
  for each row execute function dars_private.prevent_unsynchronized_approval_change();

create or replace function dars_private.sync_operator_approval_change()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_role text := current_setting('role',true);
  v_state public.teacher_review_state;
  v_request_id uuid;
  v_reason text;
begin
  if new.approved is not distinct from old.approved
     or exists(select 1 from dars_private.internal_teacher_review_decisions d
       where d.transaction_id=txid_current() and d.teacher_id=new.id) then return new; end if;
  if v_role is distinct from 'service_role' then
    raise exception 'teacher approval must use the teacher review workflow';
  end if;
  select * into v_state from public.teacher_review_state where teacher_id=new.id for update;
  if not found then raise exception 'teacher review state not found'; end if;
  v_request_id:=v_state.request_id;
  if v_state.status<>'pending' or exists(
    select 1 from public.teacher_review_events e where e.teacher_id=new.id and e.request_id=v_state.request_id
      and e.kind in ('approved','declined')
  ) then v_request_id:=gen_random_uuid(); end if;
  v_reason:=case when new.approved then null else
    'An administrator declined this review. Update your profile and request another review.' end;
  update public.teacher_review_state set status=case when new.approved then 'approved' else 'declined' end,
    request_id=v_request_id,reviewed_at=now(),reviewed_by=auth.uid(),decline_reason=v_reason where teacher_id=new.id;
  insert into public.teacher_review_events(teacher_id,request_id,kind,actor_user_id,source,reason)
    values(new.id,v_request_id,'operator_sync',auth.uid(),'service_role',v_reason);
  return new;
end $$;
revoke all on function dars_private.sync_operator_approval_change() from public, anon, authenticated;
create trigger teacher_review_operator_sync_after_update
  after update of approved on public.teacher_profiles
  for each row execute function dars_private.sync_operator_approval_change();

create or replace function public.admin_update_user(p_user_id uuid,p_status text,p_approved boolean default null)
returns void language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_actor uuid:=auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;
  v_target_role public.user_role;
  v_teacher_approved boolean;
  v_state public.teacher_review_state;
  v_desired_status text;
  v_expected uuid;
begin
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  if v_actor is null or v_actor_role is distinct from 'admin'::public.user_role
     or v_actor_status is distinct from 'active'::public.user_status then raise exception 'active admin only'; end if;
  if p_user_id is null or p_user_id=v_actor then raise exception 'administrators cannot target themselves'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid status'; end if;
  select role into v_target_role from public.profiles where id=p_user_id;
  if not found then raise exception 'user not found'; end if;
  if v_target_role='admin' then raise exception 'administrators cannot be targets'; end if;
  if p_approved is not null then
    if v_target_role is distinct from 'teacher'::public.user_role then raise exception 'approval applies only to teachers'; end if;
    perform 1 from public.teacher_profiles where id=p_user_id for update;
    select approved into v_teacher_approved from public.teacher_profiles where id=p_user_id;
    select * into v_state from public.teacher_review_state where teacher_id=p_user_id for update;
    if not found then raise exception 'teacher review state not found'; end if;
    v_desired_status:=case when p_approved then 'approved' else 'declined' end;
    if v_state.status='pending' then
      v_expected:=v_state.request_id;
      perform dars_private.apply_teacher_review_decision(p_user_id,v_expected,v_desired_status,
        case when p_approved then null else 'An administrator declined this review. Update your profile and request another review.' end,'legacy_admin');
    elsif v_state.status<>v_desired_status or v_teacher_approved is distinct from p_approved then
      raise exception 'completed review contradicts legacy approval request; use the explicit review workflow';
    end if;
  end if;
  update public.profiles set status=p_status::public.user_status where id=p_user_id;
end $$;
revoke all on function public.admin_update_user(uuid,text,boolean) from public, anon;
grant execute on function public.admin_update_user(uuid,text,boolean) to authenticated;

