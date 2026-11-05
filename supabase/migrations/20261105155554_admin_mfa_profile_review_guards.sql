begin;

-- Restrict existing profile and review helpers to the MFA-qualified active-admin role.
-- The current_role() gate is established by the companion admin MFA boundary migration.

-- Supersedes latest definition from 20261009122438_teacher_avatars_public_specializations.sql.
create or replace function public.can_read_teacher_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select case
  when p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then false
  when coalesce(public.current_role() = 'admin'::public.user_role, false) then true
  when exists(
    select 1
    from public.teacher_profiles t
    join public.profiles p on p.id=t.id
    where t.id=split_part(p_name,'/',1)::uuid
      and p.id=auth.uid()
      and p.role='teacher'
      and p.status='active'
  ) then true
  else exists(
    select 1
    from public.teacher_profiles t
    join public.profiles p on p.id=t.id
    where t.avatar_path=p_name
      and p.role='teacher'
      and p.status='active'
      and t.approved
  )
end
$$;
revoke all on function public.can_read_teacher_avatar(text) from public,anon,authenticated;
grant execute on function public.can_read_teacher_avatar(text) to anon,authenticated;

-- Supersedes latest definition from 20261009122438_teacher_avatars_public_specializations.sql.
create or replace function public.can_upload_teacher_avatar(p_name text,p_metadata jsonb)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case split_part(p_name,'.',2)
    when 'jpg' then p_metadata->>'mimetype'='image/jpeg'
    when 'png' then p_metadata->>'mimetype'='image/png'
    when 'webp' then p_metadata->>'mimetype'='image/webp'
    else false
  end
  and (
    coalesce(public.current_role() = 'admin'::public.user_role, false)
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid()
        and p.id=split_part(p_name,'/',1)::uuid
        and p.role='teacher'
        and p.status='active'
    )
  )
$$;
revoke all on function public.can_upload_teacher_avatar(text,jsonb) from public,anon,authenticated;
grant execute on function public.can_upload_teacher_avatar(text,jsonb) to authenticated;

-- Supersedes latest definition from 20261009122438_teacher_avatars_public_specializations.sql.
create or replace function public.can_delete_teacher_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and (
    coalesce(public.current_role() = 'admin'::public.user_role, false)
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid()
        and p.id=split_part(p_name,'/',1)::uuid
        and p.role='teacher'
        and p.status='active'
    )
  )
$$;
revoke all on function public.can_delete_teacher_avatar(text) from public,anon,authenticated;
grant execute on function public.can_delete_teacher_avatar(text) to authenticated;

-- Supersedes latest definition from 20261011141234_teacher_profile_covers.sql.
create or replace function public.can_read_teacher_cover(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select case
  when p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then false
  when coalesce(public.current_role() = 'admin'::public.user_role, false)
    then true
  when exists(
    select 1 from public.teacher_profiles t join public.profiles p on p.id=t.id
    where t.id=split_part(p_name,'/',1)::uuid and p.id=auth.uid()
      and p.role='teacher' and p.status='active'
  ) then true
  else exists(
    select 1 from public.teacher_profiles t join public.profiles p on p.id=t.id
    where t.cover_path=p_name and p.role='teacher' and p.status='active' and t.approved
  )
end
$$;
revoke all on function public.can_read_teacher_cover(text) from public,anon,authenticated;
grant execute on function public.can_read_teacher_cover(text) to anon,authenticated;

-- Supersedes latest definition from 20261011141234_teacher_profile_covers.sql.
create or replace function public.can_delete_teacher_cover(p_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth
as $$
select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and not exists(select 1 from public.teacher_profiles t where t.cover_path=p_name)
  and (
    coalesce(public.current_role() = 'admin'::public.user_role, false)
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid() and p.id=split_part(p_name,'/',1)::uuid
        and p.role='teacher' and p.status='active'
    )
  )
$$;
revoke all on function public.can_delete_teacher_cover(text) from public,anon,authenticated;
grant execute on function public.can_delete_teacher_cover(text) to authenticated;

-- Supersedes latest definition from 20261017202016_enrolled_teacher_contacts_only.sql.
create or replace function public.can_read_teacher_contacts(p_teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(exists (
    select 1
    from public.teacher_contacts c
    join public.profiles tp on tp.id = c.teacher_id
    join public.teacher_profiles t on t.id = c.teacher_id
    where c.teacher_id = p_teacher_id
      and (
        (tp.id = auth.uid()
          and tp.role = 'teacher'::public.user_role
          and tp.status = 'active'::public.user_status)
        or coalesce(public.current_role() = 'admin'::public.user_role, false)
        or (
          tp.role = 'teacher'::public.user_role
          and tp.status = 'active'::public.user_status
          and t.approved
          and exists (
            select 1
            from public.enrollments e
            join public.groups g on g.id = e.group_id
            join public.profiles sp on sp.id = e.student_id
            where g.teacher_id = c.teacher_id
              and e.student_id = auth.uid()
              and e.status = 'accepted'::public.enrollment_status
              and sp.role = 'student'::public.user_role
              and sp.status = 'active'::public.user_status
          )
        )
      )
  ), false)
$$;
revoke all on function public.can_read_teacher_contacts(uuid) from public;
grant execute on function public.can_read_teacher_contacts(uuid) to anon, authenticated;

-- Supersedes latest definition from 20261012051521_teacher_review_foundation.sql.
create or replace function public.teacher_review_status(p_teacher_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_status public.user_status;
  v_result jsonb;
begin
  select p.role,p.status into v_role,v_status from public.profiles p where p.id=v_uid;
  if v_uid is null or v_status is distinct from 'active'::public.user_status
     or not (p_teacher_id=v_uid and v_role='teacher'::public.user_role or coalesce(public.current_role() = 'admin'::public.user_role, false)) then
    raise exception 'not authorized';
  end if;
  select jsonb_build_object(
    'teacher_id',s.teacher_id,'status',s.status,'request_id',s.request_id,
    'requested_at',s.requested_at,'reviewed_at',s.reviewed_at,
    'decline_reason',s.decline_reason,
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'request_id',e.request_id,'kind',e.kind,'reason',e.reason,'created_at',e.created_at
      ) order by e.created_at,e.id)
      from public.teacher_review_events e
      where e.teacher_id=s.teacher_id
    ),'[]'::jsonb)
  ) into v_result
  from public.teacher_review_state s where s.teacher_id=p_teacher_id;
  if v_result is null then raise exception 'teacher review state not found'; end if;
  return v_result;
end $$;
revoke all on function public.teacher_review_status(uuid) from public, anon;
grant execute on function public.teacher_review_status(uuid) to authenticated;

-- Supersedes latest definition from 20261016091419_teacher_application_onboarding.sql.
create or replace function public.can_read_teacher_application_cv(p_path text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.status='active'
      and (coalesce(public.current_role() = 'admin'::public.user_role, false) or (p.role='teacher' and p.id=split_part(p_path,'/',1)::uuid))
  )
$$;
revoke all on function public.can_read_teacher_application_cv(text) from public,anon;
grant execute on function public.can_read_teacher_application_cv(text) to authenticated;

-- Supersedes latest definition from 20261016091419_teacher_application_onboarding.sql.
create or replace function public.read_teacher_application(p_teacher_id uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_app public.teacher_applications;
begin
  if p_teacher_id is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active'
      and ((p.id=p_teacher_id and p.role='teacher') or coalesce(public.current_role() = 'admin'::public.user_role, false))) then raise exception 'owner or active admin only'; end if;
  select * into v_app from public.teacher_applications where teacher_id=p_teacher_id;
  if not found then return jsonb_build_object('application',null,'missing',dars_private.teacher_application_missing(p_teacher_id)); end if;
  return jsonb_build_object('application',to_jsonb(v_app),'missing',case when v_app.status in ('submitted','approved') then '[]'::jsonb else to_jsonb(dars_private.teacher_application_missing(p_teacher_id)) end);
end $$;
revoke all on function public.read_teacher_application(uuid) from public,anon;
grant execute on function public.read_teacher_application(uuid) to authenticated;

-- Supersedes latest definition from 20261016091419_teacher_application_onboarding.sql.
create or replace function public.request_teacher_application_changes(p_teacher_id uuid,p_expected_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth as $$
declare v_app public.teacher_applications; v_state public.teacher_review_state; v_actor uuid:=auth.uid(); v_actor_role public.user_role; v_actor_status public.user_status;
begin
  perform 1 from public.teacher_profiles where id=p_teacher_id for update;
  if not found then raise exception 'teacher not found'; end if;
  select role,status into v_actor_role,v_actor_status from public.profiles where id=v_actor;
  if v_actor_role is distinct from 'admin'::public.user_role or v_actor_status is distinct from 'active'::public.user_status
     or not coalesce(public.current_role() = 'admin'::public.user_role, false) then raise exception 'active admin only'; end if;
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

-- Supersedes latest definition from 20261016091419_teacher_application_onboarding.sql.
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
  if v_actor is null or v_actor_role is distinct from 'admin'::public.user_role or v_actor_status is distinct from 'active'::public.user_status
     or not coalesce(public.current_role() = 'admin'::public.user_role, false) then raise exception 'active admin only'; end if;
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

-- Supersedes latest definition from 20261011134452_rich_teacher_profile_details.sql.
create or replace function dars_private.sync_legacy_teacher_bio()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_language text;
  v_details jsonb;
  v_visible_bio text;
begin
  if exists (
    select 1 from dars_private.internal_profile_bio_syncs s
    where s.backend_pid=pg_backend_pid() and s.transaction_id=txid_current() and s.teacher_id=new.id
  ) then
    return new;
  end if;
  if not (
    exists (
      select 1 from public.profiles p
      where p.id=auth.uid() and p.id=new.id
        and p.role='teacher'::public.user_role and p.status='active'::public.user_status
    )
    or coalesce(public.current_role() = 'admin'::public.user_role, false)
    or coalesce(auth.jwt()->>'role'='service_role',false)
    or (
      session_user in ('postgres','service_role')
      and current_setting('role',true) in ('none','postgres','service_role')
    )
  ) then
    raise exception 'active teacher, admin, or service operator required' using errcode='42501';
  end if;
  if char_length(new.bio) > 5000 then raise exception 'bio exceeds 5000 characters' using errcode='22023'; end if;
  select coalesce(p.preferred_language,'ar') into v_language from public.profiles p where p.id=new.id;
  v_language := coalesce(v_language,'ar');
  select details into v_details from public.teacher_profile_details where teacher_id=new.id for update;
  if v_details is null then v_details := dars_private.empty_teacher_profile_details(); end if;
  if v_details->'hidden_sections' @> '["about"]'::jsonb then
    v_visible_bio := '';
  else
    v_visible_bio := coalesce(nullif(v_details->'about'->>v_language,''),v_details->'about'->>case when v_language='ar' then 'en' else 'ar' end,'');
  end if;
  if v_details->'about'->>v_language is not distinct from new.bio then
    new.bio := v_visible_bio;
    return new;
  end if;
  v_details := jsonb_set(v_details,array['about',v_language],to_jsonb(new.bio),true);
  perform dars_private.validate_teacher_profile_details(v_details);
  update public.teacher_profile_details set details=v_details,version=version+1,updated_at=now() where teacher_id=new.id;
  if not (v_details->'hidden_sections' @> '["about"]'::jsonb) then
    v_visible_bio := coalesce(nullif(v_details->'about'->>v_language,''),v_details->'about'->>case when v_language='ar' then 'en' else 'ar' end,'');
  end if;
  new.bio := v_visible_bio;
  return new;
end;
$$;
revoke all on function dars_private.sync_legacy_teacher_bio() from public, anon, authenticated;

commit;
