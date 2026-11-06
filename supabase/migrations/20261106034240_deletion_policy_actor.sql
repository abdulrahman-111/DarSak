begin;

-- Preserve the current policy when an admin who last edited it is deleted.
-- The actor is attribution only; it must not block account-deletion prepare.
alter table dars_private.teacher_quota_policy
  drop constraint teacher_quota_policy_updated_by_fkey;

alter table dars_private.teacher_quota_policy
  add constraint teacher_quota_policy_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

commit;
