begin;

create or replace function public.decide_teacher_access_request(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private,auth
as $$ declare v_uid uuid:=auth.uid(); v_req dars_private.teacher_access_requests%rowtype; v_teacher_status public.user_status; v_role public.user_role; v_now timestamptz; v_current_expiry timestamptz; begin
  if p_approve is null then raise exception 'decision is required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='admin' and status='active') then raise exception 'active admin only' using errcode='42501'; end if;
  select * into v_req from dars_private.teacher_access_requests where id=p_request_id;
  if not found then raise exception 'request not found'; end if;
  perform 1 from dars_private.teacher_access_state where teacher_id=v_req.teacher_id for update;
  if not found then
    perform 1 from public.teacher_profiles where id=v_req.teacher_id for update;
    if not found then raise exception 'teacher profile missing'; end if;
    perform 1 from dars_private.teacher_access_state where teacher_id=v_req.teacher_id for update;
  end if;
  perform 1 from dars_private.teacher_access_fee_policy where singleton for share;
  select * into v_req from dars_private.teacher_access_requests where id=p_request_id for update;
  if v_req.status<>'pending' then
    if (v_req.status='approved')=p_approve then return; end if;
    raise exception 'access request already reviewed' using errcode='PT409';
  end if;
  select p.role,p.status into v_role,v_teacher_status from public.profiles p where p.id=v_req.teacher_id;
  if v_role is distinct from 'teacher'::public.user_role then raise exception 'request owner is not a teacher'; end if;
  if p_approve and v_teacher_status is distinct from 'active'::public.user_status then raise exception 'active teacher required for access approval'; end if;
  update dars_private.teacher_access_requests set status=case when p_approve then 'approved' else 'declined' end,
    decided_at=statement_timestamp(),decided_by=v_uid where id=p_request_id;
  if p_approve then
    v_now:=clock_timestamp();
    select expires_at into v_current_expiry from dars_private.teacher_access_state where teacher_id=v_req.teacher_id;
    perform dars_private.issue_teacher_access_grant(v_req.teacher_id,'admin_approved',v_uid,p_request_id,
      case when v_current_expiry>v_now then v_current_expiry else v_now end,true);
  end if;
end $$;

commit;
