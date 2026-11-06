begin;

create or replace function public.account_deletion_prepare(
  p_user_id uuid, p_intent_id uuid, p_nonce_hash text, p_method text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, storage
as $$
declare
  v_profile public.profiles%rowtype;
  v_request dars_private.account_deletion_requests%rowtype;
  v_intent dars_private.account_deletion_intents%rowtype;
  v_manifest jsonb;
  v_now timestamptz := clock_timestamp();
  v_foreign boolean;
begin
  if p_user_id is null or p_method is null or p_method not in ('password','google') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  -- Coordinate with complete_google_signup so a pending identity cannot
  -- recreate its domain profile after deletion has been prepared.
  perform pg_advisory_xact_lock(hashtextextended('google-signup-completion:'||p_user_id::text,0));
  -- Permit idempotent cleanup retry for an already prepared identity only.
  select r.* into v_request from dars_private.account_deletion_requests r
    where r.user_id=p_user_id and r.state <> 'completed' for update;
  if found then
    return jsonb_build_object('request_id',v_request.id,'state',v_request.state);
  end if;
  select r.* into v_request from dars_private.account_deletion_requests r
    where r.user_id=p_user_id and r.state='completed' order by r.created_at desc limit 1;
  if found then return jsonb_build_object('request_id',v_request.id,'state','completed'); end if;

  select p.* into v_profile from public.profiles p where p.id=p_user_id for update;
  if found then
    if v_profile.status <> 'active' then raise exception 'inactive_owner' using errcode='42501'; end if;
  elsif not exists(select 1 from dars_private.pending_google_signups s where s.user_id=p_user_id) then
    raise exception 'inactive_owner' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-deletion-owner:'||p_user_id::text,0));

  if v_profile.role='admin' and v_profile.status='active' then
    perform pg_advisory_xact_lock(1976882461, 1101);
    if not exists(select 1 from public.profiles p where p.role='admin' and p.status='active' and p.id<>p_user_id) then
      raise exception 'last_active_admin' using errcode='23514';
    end if;
  end if;

  -- Foreign-group references must be dealt with by an administrator first.
  -- The profile row lock above serializes with FK-backed new uploader writes.
  select exists (
    select 1 from public.lesson_materials m
    join public.lessons l on l.id=m.lesson_id
    join public.groups g on g.id=l.group_id
    where m.uploaded_by=p_user_id and g.teacher_id<>p_user_id
  ) or exists (
    select 1 from storage.objects o
    join public.lesson_materials m on m.storage_path=o.name
    join public.lessons l on l.id=m.lesson_id
    join public.groups g on g.id=l.group_id
    where (o.owner_id=p_user_id::text or o.owner::text=p_user_id::text
       or split_part(o.name,'/',1)=p_user_id::text)
      and o.bucket_id='lesson-materials'
      and g.teacher_id<>p_user_id
  ) into v_foreign;
  if v_foreign then
    raise exception 'foreign_group_material' using errcode='23514';
  end if;

  if p_method='google' then
    select i.* into v_intent from dars_private.account_deletion_intents i
      where i.id=p_intent_id and i.user_id=p_user_id for update;
    if not found or v_intent.consumed_at is not null or v_intent.expires_at<=v_now
      or v_intent.nonce_hash is distinct from p_nonce_hash
      or v_intent.oauth_amr_at is null or v_intent.oauth_amr_at < v_now-interval '5 minutes'
      or v_intent.oauth_amr_at > v_now+interval '1 second'
      or v_intent.oauth_amr_at < v_intent.created_at-interval '1 second' then
      raise exception 'invalid_intent' using errcode='42501';
    end if;
  elsif p_intent_id is not null or p_nonce_hash is not null then
    raise exception 'invalid_request' using errcode='22023';
  end if;

  -- Snapshot every object owned by this UID, regardless of path, plus every
  -- file attached to groups the owner controls (including admin uploads).
  -- Any owned object referenced from a retained foreign group was rejected above.
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id',q.bucket_id,'name',q.name)
                            order by q.bucket_id,q.name),'[]'::jsonb)
    into v_manifest
  from (
    select distinct o.bucket_id,o.name
    from storage.objects o
    where o.owner_id=p_user_id::text or o.owner::text=p_user_id::text
       or split_part(o.name,'/',1)=p_user_id::text
       or exists (
         select 1 from public.lesson_materials m
         join public.lessons l on l.id=m.lesson_id
         join public.groups g on g.id=l.group_id
         where g.teacher_id=p_user_id and m.storage_path=o.name and o.bucket_id='lesson-materials'
       )
  ) q;

  insert into dars_private.account_deletion_requests(user_id,state,manifest)
    values(p_user_id,'queued',v_manifest) returning * into v_request;
  delete from dars_private.pending_google_signups where user_id=p_user_id;
  if p_method='google' then
    update dars_private.account_deletion_intents set consumed_at=v_now where id=v_intent.id;
  end if;
  delete from dars_private.email_outbox o
    where o.recipient_user_id=p_user_id
       or o.payload->>'teacher_id'=p_user_id::text
       or o.payload->>'student_id'=p_user_id::text
       or exists (
         select 1 from public.enrollments e
         where e.student_id=p_user_id
           and (o.payload->>'enrollment_id'=e.id::text
             or o.event_key like 'enrollment-request:'||e.id::text||':%')
       );
  delete from public.user_notifications n
    where n.payload->>'teacher_id'=p_user_id::text
       or exists (
         select 1 from public.enrollments e
         where e.student_id=p_user_id and n.kind='enrollment_requested'
           and n.event_key like 'enrollment:'||e.id::text||':%'
       )
       or exists (
         select 1 from public.teacher_review_events e
         where e.teacher_id=p_user_id and n.event_key='teacher-review-request:'||e.id::text
       );
  -- Remove booking notifications linked to requests owned by this user,
  -- requests on their teacher slots, or requests on slots they proposed.
  -- Compare the payload as text to a real request ID; malformed JSON values
  -- are simply unmatched and never cast to UUID.
  delete from public.user_notifications n
    where n.kind = 'booking_updated'
      and exists (
        select 1
        from public.booking_requests r
        join public.booking_slots s on s.id = r.slot_id
        where n.payload->>'booking_id' = r.id::text
          and (r.student_id = p_user_id
            or s.teacher_id = p_user_id
            or s.proposed_by = p_user_id)
      );

  delete from public.profiles where id=p_user_id;
  return jsonb_build_object('request_id',v_request.id,'state',v_request.state);
end
$$;

commit;
