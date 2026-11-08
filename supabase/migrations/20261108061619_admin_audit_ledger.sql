begin;

create schema if not exists dars_private;
revoke all on schema dars_private from public, anon, authenticated;

create or replace function dars_private.audit_metadata_valid(p_action text,p_metadata jsonb)
returns boolean language plpgsql immutable
set search_path=pg_catalog,dars_private as $$
declare v text;
begin
  if p_action is null or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>2048 then return false; end if;
  case p_action
    when 'user_suspended' then return p_metadata=jsonb_build_object('status','suspended');
    when 'user_reactivated' then return p_metadata=jsonb_build_object('status','active');
    when 'teacher_access_approved' then return p_metadata=jsonb_build_object('status','approved');
    when 'teacher_access_declined' then return p_metadata=jsonb_build_object('status','declined');
    when 'report_resolved' then return p_metadata=jsonb_build_object('status','resolved');
    when 'report_reopened' then return p_metadata=jsonb_build_object('status','open');
    when 'admin_granted' then return p_metadata=jsonb_build_object('role','admin');
    when 'admin_revoked' then return coalesce(p_metadata=jsonb_build_object('role',p_metadata->>'role') and p_metadata->>'role' in ('student','teacher'),false);
    when 'fee_policy_changed','quota_policy_changed' then return jsonb_typeof(p_metadata->'policy_enabled')='boolean' and p_metadata=jsonb_build_object('policy_enabled',p_metadata->'policy_enabled');
    when 'teacher_plan_assigned' then return jsonb_typeof(p_metadata->'plan_code')='string' and p_metadata->>'plan_code' in ('standard','pro') and p_metadata=jsonb_build_object('plan_code',p_metadata->'plan_code');
    when 'account_deletion_started' then return p_metadata=jsonb_build_object('state','queued');
    when 'account_deletion_completed' then return p_metadata=jsonb_build_object('state','completed');
    when 'audit_purged' then
      v:=p_metadata->>'deleted_count';
      return jsonb_typeof(p_metadata->'deleted_count')='number' and v ~ '^[0-9]{1,18}$' and p_metadata=jsonb_build_object('deleted_count',p_metadata->'deleted_count');
    else return p_metadata='{}'::jsonb;
  end case;
end $$;
revoke all on function dars_private.audit_metadata_valid(text,jsonb) from public,anon,authenticated,service_role;

create table dars_private.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_role text not null check (actor_role in ('student','teacher','admin','system')),
  action text not null check (action in (
    'teacher_review_approved','teacher_review_declined','teacher_application_changes_requested',
    'teacher_access_approved','teacher_access_declined','fee_policy_changed','quota_policy_changed',
    'user_suspended','user_reactivated','admin_granted','admin_revoked','feedback_approved',
    'feedback_hidden','feedback_reply_approved','feedback_reply_hidden','report_resolved','report_reopened',
    'group_archived','group_deleted','account_deletion_started','account_deletion_completed',
    'teacher_plan_assigned','audit_purged')),
  target_type text not null check (target_type in ('teacher','teacher_application','teacher_access_request','fee_policy','quota_policy','user','feedback','feedback_reply','report','group','account','teacher_plan','audit_log')),
  target_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb check (dars_private.audit_metadata_valid(action,metadata) is true),
  check (actor_id is not null or actor_role='system')
);
create index audit_log_at_id_desc on dars_private.audit_log(at desc,id desc);
create index audit_log_target_at_id_desc on dars_private.audit_log(target_type,target_id,at desc,id desc);
alter table dars_private.audit_log enable row level security;
revoke all on dars_private.audit_log from public,anon,authenticated,service_role;
revoke all on sequence dars_private.audit_log_id_seq from public,anon,authenticated,service_role;

create or replace function dars_private.audit_log_immutable()
returns trigger language plpgsql security definer set search_path=pg_catalog,dars_private as $$
begin raise exception 'audit log is immutable' using errcode='55000'; end $$;
revoke all on function dars_private.audit_log_immutable() from public,anon,authenticated,service_role;
create trigger audit_log_no_update_delete before update or delete on dars_private.audit_log for each row execute function dars_private.audit_log_immutable();
alter table dars_private.audit_log enable always trigger audit_log_no_update_delete;
create or replace function dars_private.audit_log_no_truncate()
returns trigger language plpgsql security definer set search_path=pg_catalog,dars_private as $$
begin raise exception 'audit log cannot be truncated' using errcode='55000'; end $$;
revoke all on function dars_private.audit_log_no_truncate() from public,anon,authenticated,service_role;
create trigger audit_log_no_truncate before truncate on dars_private.audit_log for each statement execute function dars_private.audit_log_no_truncate();
alter table dars_private.audit_log enable always trigger audit_log_no_truncate;

create or replace function dars_private.write_audit(p_action text,p_type text,p_target uuid,p_request uuid default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare a uuid:=auth.uid(); r text;
begin
  if a is null then r:='system'; else select p.role::text into r from public.profiles p where p.id=a; if r is null then r:='system'; end if; end if;
  insert into dars_private.audit_log(actor_id,actor_role,action,target_type,target_id,request_id,metadata)
  values(a,r,p_action,p_type,p_target,p_request,coalesce(p_metadata,'{}'::jsonb));
end $$;
revoke all on function dars_private.write_audit(text,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function dars_private.audit_profile_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if new.status is distinct from old.status then perform dars_private.write_audit(case new.status when 'suspended' then 'user_suspended' else 'user_reactivated' end,'user',new.id,null,jsonb_build_object('status',new.status::text)); end if;
  if new.role is distinct from old.role then
    if old.role='admin' then perform dars_private.write_audit('admin_revoked','user',new.id,null,jsonb_build_object('role',new.role::text));
    elsif new.role='admin' then perform dars_private.write_audit('admin_granted','user',new.id,null,jsonb_build_object('role',new.role::text)); end if;
  end if;
  return new;
end $$;
revoke all on function dars_private.audit_profile_change() from public,anon,authenticated,service_role;
create trigger profiles_audit_change after update of role,status on public.profiles for each row execute function dars_private.audit_profile_change();

create or replace function dars_private.audit_teacher_application_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if old.status is distinct from new.status then
    if new.status='changes_requested' then perform dars_private.write_audit('teacher_application_changes_requested','teacher_application',new.teacher_id);
    end if;
  end if;
  return new;
end $$;
revoke all on function dars_private.audit_teacher_application_change() from public,anon,authenticated,service_role;
create trigger teacher_applications_audit_change after update of status on public.teacher_applications for each row execute function dars_private.audit_teacher_application_change();

create or replace function dars_private.audit_teacher_review_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if new.kind in ('approved','declined') then
    perform dars_private.write_audit('teacher_review_'||new.kind,'teacher',new.teacher_id,new.request_id);
  elsif new.kind='operator_sync' then
    perform dars_private.write_audit(
      case when exists(select 1 from public.teacher_profiles t where t.id=new.teacher_id and t.approved)
        then 'teacher_review_approved' else 'teacher_review_declined' end,
      'teacher',new.teacher_id,new.request_id);
  end if;
  return new;
end $$;
revoke all on function dars_private.audit_teacher_review_event() from public,anon,authenticated,service_role;
create trigger teacher_review_events_audit after insert on public.teacher_review_events for each row execute function dars_private.audit_teacher_review_event();

create or replace function dars_private.audit_access_request_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','declined') then
    perform dars_private.write_audit('teacher_access_'||new.status,'teacher_access_request',new.id,new.id,jsonb_build_object('status',new.status));
  end if;
  return new;
end $$;
revoke all on function dars_private.audit_access_request_change() from public,anon,authenticated,service_role;
create trigger teacher_access_requests_audit after update of status on dars_private.teacher_access_requests for each row execute function dars_private.audit_access_request_change();

create or replace function dars_private.audit_policy_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
declare v_action text; v_type text; v_enabled boolean;
begin
  if tg_table_name='teacher_access_fee_policy' then
    if old.fees_enabled is distinct from new.fees_enabled or old.effective_at is distinct from new.effective_at then
      perform dars_private.write_audit('fee_policy_changed','fee_policy',null,null,jsonb_build_object('policy_enabled',new.fees_enabled));
    end if;
  elsif old.quotas_enabled is distinct from new.quotas_enabled or old.effective_at is distinct from new.effective_at then
    perform dars_private.write_audit('quota_policy_changed','quota_policy',null,null,jsonb_build_object('policy_enabled',new.quotas_enabled));
  end if;
  return new;
end $$;
revoke all on function dars_private.audit_policy_change() from public,anon,authenticated,service_role;
create trigger fee_policy_audit after update on dars_private.teacher_access_fee_policy for each row execute function dars_private.audit_policy_change();
create trigger quota_policy_audit after update on dars_private.teacher_quota_policy for each row execute function dars_private.audit_policy_change();

create or replace function dars_private.audit_teacher_plan_assignment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  perform dars_private.write_audit('teacher_plan_assigned','teacher_plan',new.teacher_id,null,jsonb_build_object('plan_code',new.plan_code));
  return new;
end $$;
revoke all on function dars_private.audit_teacher_plan_assignment() from public,anon,authenticated,service_role;
create trigger teacher_plan_assignments_audit after insert on dars_private.teacher_plan_assignments for each row execute function dars_private.audit_teacher_plan_assignment();

create or replace function dars_private.audit_feedback_moderation()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_admin boolean;
begin
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active') into v_admin;
  if not v_admin then return new; end if;
  if old.status is distinct from new.status and new.status in ('approved','hidden') then
    perform dars_private.write_audit(case new.status when 'approved' then 'feedback_approved' else 'feedback_hidden' end,'feedback',new.id);
  elsif new.reply_pending='' and (old.reply_pending<>'' or new.reply_public is distinct from old.reply_public) then
    perform dars_private.write_audit(case when new.reply_public<>'' then 'feedback_reply_approved' else 'feedback_reply_hidden' end,'feedback_reply',new.id);
  end if;
  return new;
end $$;
revoke all on function dars_private.audit_feedback_moderation() from public,anon,authenticated,service_role;
create trigger group_feedback_audit_moderation after update of status,reply_pending,reply_public on dars_private.group_feedback for each row execute function dars_private.audit_feedback_moderation();

create or replace function dars_private.audit_report_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if new.status is distinct from old.status and new.status in ('resolved','open') then perform dars_private.write_audit(case new.status when 'resolved' then 'report_resolved' else 'report_reopened' end,'report',new.id,null,jsonb_build_object('status',new.status::text)); end if;
  return new;
end $$;
revoke all on function dars_private.audit_report_change() from public,anon,authenticated,service_role;
create trigger reports_audit_change after update of status on public.reports for each row execute function dars_private.audit_report_change();

create or replace function dars_private.audit_group_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if tg_op='DELETE' then perform dars_private.write_audit('group_deleted','group',old.id); return old; end if;
  if old.status is distinct from new.status and new.status='archived' then perform dars_private.write_audit('group_archived','group',new.id); end if;
  return new;
end $$;
revoke all on function dars_private.audit_group_change() from public,anon,authenticated,service_role;
create trigger groups_audit_update after update of status on public.groups for each row execute function dars_private.audit_group_change();
create trigger groups_audit_delete after delete on public.groups for each row execute function dars_private.audit_group_change();

create or replace function dars_private.audit_deletion_request_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private as $$
begin
  if tg_op='INSERT' and new.state='queued' then perform dars_private.write_audit('account_deletion_started','account',new.user_id,new.id,jsonb_build_object('state','queued'));
  elsif tg_op='UPDATE' and old.state is distinct from new.state and new.state='completed' then perform dars_private.write_audit('account_deletion_completed','account',new.user_id,new.id,jsonb_build_object('state','completed')); end if;
  return new;
end $$;
revoke all on function dars_private.audit_deletion_request_change() from public,anon,authenticated,service_role;
create trigger account_deletion_audit after insert or update of state on dars_private.account_deletion_requests for each row execute function dars_private.audit_deletion_request_change();

create or replace function dars_private.purge_audit_log()
returns void language plpgsql security definer set search_path=pg_catalog,dars_private as $$
declare v_cutoff timestamptz:=statement_timestamp()-interval '24 months'; v_count bigint;
begin
  lock table dars_private.audit_log in access exclusive mode;
  alter table dars_private.audit_log disable trigger audit_log_no_update_delete;
  delete from dars_private.audit_log where at<v_cutoff;
  get diagnostics v_count=row_count;
  alter table dars_private.audit_log enable always trigger audit_log_no_update_delete;
  insert into dars_private.audit_log(actor_role,action,target_type,metadata)
  values('system','audit_purged','audit_log',jsonb_build_object('deleted_count',v_count));
end $$;
revoke all on function dars_private.purge_audit_log() from public,anon,authenticated,service_role;

create extension if not exists pg_cron with schema extensions;
select cron.schedule('admin-audit-retention','0 3 1 * *','select dars_private.purge_audit_log()');

commit;
