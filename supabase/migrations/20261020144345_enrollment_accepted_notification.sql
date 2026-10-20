begin;

alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check check (kind in (
  'lesson_rescheduled',
  'lesson_cancelled',
  'group_cancelled',
  'weekly_schedule_changed',
  'enrollment_requested',
  'teacher_review_requested',
  'teacher_review_decision',
  'teacher_fee_announcement',
  'enrollment_accepted'
));

create or replace function dars_private.notify_enrollment_accepted()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,dars_private
as $$
declare
  v_group public.groups;
begin
  if old.status is distinct from 'pending'::public.enrollment_status
     or new.status is distinct from 'accepted'::public.enrollment_status then
    return new;
  end if;

  select * into v_group from public.groups where id=new.group_id;
  if not found then return new; end if;

  perform dars_private.add_user_notification(
    new.student_id,
    'enrollment_accepted',
    'enrollment-accepted:'||new.id::text||':'||txid_current(),
    jsonb_build_object('group_id',v_group.id,'group_name',v_group.name)
  )
  where exists (
    select 1 from public.profiles p
    where p.id=new.student_id and p.role='student' and p.status='active'
  );

  return new;
end
$$;
revoke all on function dars_private.notify_enrollment_accepted() from public,anon,authenticated,service_role;

create trigger user_notifications_enrollment_accepted
after update of status on public.enrollments
for each row execute function dars_private.notify_enrollment_accepted();

commit;
