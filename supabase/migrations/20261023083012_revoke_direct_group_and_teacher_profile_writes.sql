begin;

-- Every group and teacher-profile write now goes through a SECURITY DEFINER RPC
-- (save_teacher_group_draft, publish_group, duplicate_group, cancel_teacher_group,
-- delete_unused_teacher_group, save_teacher_profile*, set_teacher_avatar_path,
-- set_teacher_cover_path, admin_decide_teacher_review, admin_update_user and the
-- signup triggers). Their table writes run as the function owner, so removing the
-- legacy PostgREST grants from authenticated does not affect them. Revoking the
-- table privilege also removes any column-level grants; the explicit column
-- statements document what production had left behind.
revoke insert, update on public.groups from anon, authenticated;
revoke update (id, bio, headline, approved, created_at) on public.teacher_profiles from anon, authenticated;
revoke insert, update on public.teacher_profiles from anon, authenticated;

-- Defence in depth for the 160 character limit enforced by the profile RPCs.
alter table public.teacher_profiles
  add constraint teacher_profiles_headline_length
  check (headline is null or char_length(headline) <= 160) not valid;
alter table public.teacher_profiles validate constraint teacher_profiles_headline_length;

-- The admin portal's "return to draft" control used to update groups.status
-- directly. Publishing already uses publish_group and archiving uses
-- cancel_teacher_group (both allow admins); this is the minimal admin-only
-- counterpart for unpublishing.
create or replace function public.admin_set_group_draft(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_teacher_id uuid;
  v_locked_teacher_id uuid;
  v_status public.group_status;
begin
  if auth.uid() is null or public.current_role() is distinct from 'admin'::public.user_role then
    raise exception 'active administrator only' using errcode = '42501';
  end if;
  select teacher_id into v_teacher_id from public.groups where id = p_group_id;
  if not found then raise exception 'group not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:' || v_teacher_id::text, 0));
  select teacher_id, status into v_locked_teacher_id, v_status
  from public.groups where id = p_group_id for update;
  if not found or v_locked_teacher_id is distinct from v_teacher_id then raise exception 'group changed'; end if;
  if v_status = 'archived'::public.group_status then
    raise exception 'archived groups cannot be returned to draft';
  end if;
  if v_status = 'draft'::public.group_status then return; end if;
  update public.groups set status = 'draft'::public.group_status where id = p_group_id;
end
$$;

revoke all on function public.admin_set_group_draft(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_group_draft(uuid) to authenticated;

commit;
