begin;

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed','enrollment_requested','teacher_review_requested','teacher_review_decision')),
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,event_key)
);
create index user_notifications_recipient_created_idx on public.user_notifications(recipient_id,created_at desc,id desc);
create index user_notifications_recipient_unread_idx on public.user_notifications(recipient_id,created_at desc,id desc) where read_at is null;
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public,anon,authenticated,service_role;
grant select on public.user_notifications to authenticated;
create policy user_notifications_own_active_read on public.user_notifications for select to authenticated
  using (recipient_id=auth.uid() and public.is_active_user());

create or replace function public.notifications_page(p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$
declare v_uid uuid:=auth.uid(); v_total bigint; v_unread bigint; v_rows jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  select count(*),count(*) filter(where read_at is null) into v_total,v_unread from public.user_notifications where recipient_id=v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'payload',q.payload,'created_at',q.created_at,'read_at',q.read_at) order by q.created_at desc,q.id desc),'[]'::jsonb)
    into v_rows from (select id,kind,payload,created_at,read_at from public.user_notifications where recipient_id=v_uid order by created_at desc,id desc offset p_offset limit p_limit) q;
  return jsonb_build_object('rows',v_rows,'total',v_total,'unread',v_unread);
end $$;

create or replace function public.notifications_unread_count()
returns integer language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$ declare v_uid uuid:=auth.uid(); v_count bigint; begin
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  select count(*) into v_count from public.user_notifications where recipient_id=v_uid and read_at is null;
  return v_count::integer;
end $$;

create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$ declare v_uid uuid:=auth.uid(); begin
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  update public.user_notifications set read_at=coalesce(read_at,statement_timestamp()) where id=p_id and recipient_id=v_uid;
end $$;

create or replace function public.mark_all_notifications_read()
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$ declare v_uid uuid:=auth.uid(); begin
  if v_uid is null or not public.is_active_user(v_uid) then raise exception 'active account required' using errcode='42501'; end if;
  update public.user_notifications set read_at=statement_timestamp() where recipient_id=v_uid and read_at is null;
end $$;
revoke all on function public.notifications_page(integer,integer),public.notifications_unread_count(),public.mark_notification_read(uuid),public.mark_all_notifications_read() from public,anon,service_role;
grant execute on function public.notifications_page(integer,integer),public.notifications_unread_count(),public.mark_notification_read(uuid),public.mark_all_notifications_read() to authenticated;

create or replace function dars_private.add_user_notification(p_recipient uuid,p_kind text,p_event_key text,p_payload jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$ begin
  insert into public.user_notifications(recipient_id,kind,event_key,payload)
  select p_recipient,p_kind,p_event_key,p_payload where exists(select 1 from public.profiles p where p.id=p_recipient and p.status='active')
  on conflict(recipient_id,event_key) do nothing;
end $$;
revoke all on function dars_private.add_user_notification(uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create or replace function dars_private.notify_lesson_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_group public.groups; v_kind text; v_change text; v_event text; v_payload jsonb;
begin
  if tg_op<>'UPDATE' then return new; end if;
  if old.starts_at is not distinct from new.starts_at and old.ends_at is not distinct from new.ends_at and not(old.status is distinct from new.status and new.status='cancelled') then return new; end if;
  select * into v_group from public.groups where id=new.group_id;
  if not found or v_group.status='archived' or not (old.ends_at>statement_timestamp() or new.ends_at>statement_timestamp()) then return new; end if;
  if old.status is distinct from new.status and new.status='cancelled' then v_kind:='lesson_cancelled'; else v_kind:='lesson_rescheduled'; end if;
  v_change:=md5(concat_ws('|',old.starts_at,old.ends_at,old.status,new.starts_at,new.ends_at,new.status,txid_current()));
  v_event:='lesson:'||new.id::text||':'||v_change;
  v_payload:=jsonb_build_object('lesson_id',new.id,'group_id',new.group_id,'group_name',v_group.name,'title',new.title,'starts_at',new.starts_at,'ends_at',new.ends_at,'status',new.status);
  perform dars_private.add_user_notification(e.student_id,v_kind,v_event,v_payload)
  from public.enrollments e join public.profiles p on p.id=e.student_id and p.role='student' and p.status='active'
  where e.group_id=new.group_id and e.status='accepted';
  return new;
end $$;
revoke all on function dars_private.notify_lesson_change() from public,anon,authenticated,service_role;
create trigger user_notifications_lesson_update after update of starts_at,ends_at,status on public.lessons for each row execute function dars_private.notify_lesson_change();

create or replace function dars_private.notify_group_archived()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$ declare v_event text; begin
  if old.status='archived' or new.status<>'archived' then return new; end if;
  v_event:='group-archived:'||new.id::text||':'||txid_current();
  perform dars_private.add_user_notification(e.student_id,'group_cancelled',v_event,jsonb_build_object('group_id',new.id,'group_name',new.name))
  from public.enrollments e join public.profiles p on p.id=e.student_id and p.role='student' and p.status='active'
  where e.group_id=new.id and e.status='accepted';
  return new;
end $$;
revoke all on function dars_private.notify_group_archived() from public,anon,authenticated,service_role;
create trigger user_notifications_group_archived after update of status on public.groups for each row execute function dars_private.notify_group_archived();

create or replace function dars_private.notify_weekly_schedule_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$
declare v_group_id uuid; v_group public.groups; v_old jsonb; v_new jsonb; v_event text; v_fp text;
begin
  v_group_id:=case when tg_op='DELETE' then old.group_id else new.group_id end;
  select * into v_group from public.groups where id=v_group_id;
  if not found or v_group.status<>'published' then return coalesce(new,old); end if;
  if tg_op='INSERT' then v_new:=jsonb_build_object('weekday',new.weekday,'start_time',new.start_time,'end_time',new.end_time);
  elsif tg_op='DELETE' then v_old:=jsonb_build_object('weekday',old.weekday,'start_time',old.start_time,'end_time',old.end_time);
  else
    if old.weekday is not distinct from new.weekday and old.start_time is not distinct from new.start_time and old.end_time is not distinct from new.end_time then return new; end if;
    v_old:=jsonb_build_object('weekday',old.weekday,'start_time',old.start_time,'end_time',old.end_time);
    v_new:=jsonb_build_object('weekday',new.weekday,'start_time',new.start_time,'end_time',new.end_time);
  end if;
  v_fp:=md5(concat_ws('|',tg_op,coalesce(v_old::text,''),coalesce(v_new::text,''),txid_current()));
  v_event:='weekly-slot:'||coalesce(new.id,old.id)::text||':'||v_fp;
  perform dars_private.add_user_notification(e.student_id,'weekly_schedule_changed',v_event,jsonb_build_object('group_id',v_group.id,'group_name',v_group.name,'old',v_old,'new',v_new,'dated_lessons_unchanged',true))
  from public.enrollments e join public.profiles p on p.id=e.student_id and p.role='student' and p.status='active'
  where e.group_id=v_group_id and e.status='accepted';
  return coalesce(new,old);
end $$;
revoke all on function dars_private.notify_weekly_schedule_change() from public,anon,authenticated,service_role;
create trigger user_notifications_slot_insert after insert on public.group_schedule_slots for each row execute function dars_private.notify_weekly_schedule_change();
create trigger user_notifications_slot_update after update on public.group_schedule_slots for each row execute function dars_private.notify_weekly_schedule_change();
create trigger user_notifications_slot_delete after delete on public.group_schedule_slots for each row execute function dars_private.notify_weekly_schedule_change();

create or replace function dars_private.notify_enrollment_requested()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$ declare v_group public.groups; v_student text; begin
  if new.status<>'pending' or (tg_op='UPDATE' and old.status='pending') then return new; end if;
  select * into v_group from public.groups where id=new.group_id;
  if not found then return new; end if;
  select full_name into v_student from public.profiles where id=new.student_id and role='student' and status='active';
  if v_student is null then return new; end if;
  perform dars_private.add_user_notification(v_group.teacher_id,'enrollment_requested','enrollment:'||new.id::text||':'||txid_current(),jsonb_build_object('student_name',v_student,'group_name',v_group.name,'group_id',v_group.id));
  return new;
end $$;
revoke all on function dars_private.notify_enrollment_requested() from public,anon,authenticated,service_role;
create trigger user_notifications_enrollment_request after insert or update on public.enrollments for each row execute function dars_private.notify_enrollment_requested();

create or replace function dars_private.notify_teacher_review_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,dars_private
as $$ declare v_name text; v_event text; begin
  select full_name into v_name from public.profiles where id=new.teacher_id;
  if new.kind='requested' then
    v_event:='teacher-review-request:'||new.id::text;
    perform dars_private.add_user_notification(p.id,'teacher_review_requested',v_event,jsonb_build_object('teacher_name',v_name,'teacher_id',new.teacher_id)) from public.profiles p where p.role='admin' and p.status='active';
  elsif new.kind in ('approved','declined') then
    v_event:='teacher-review-decision:'||new.id::text;
    perform dars_private.add_user_notification(new.teacher_id,'teacher_review_decision',v_event,jsonb_build_object('decision',new.kind));
  end if;
  return new;
end $$;
revoke all on function dars_private.notify_teacher_review_event() from public,anon,authenticated,service_role;
create trigger user_notifications_teacher_review after insert on public.teacher_review_events for each row execute function dars_private.notify_teacher_review_event();

commit;
