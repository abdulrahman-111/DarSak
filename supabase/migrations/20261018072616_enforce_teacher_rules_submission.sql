begin;
-- Run after the application that requests explicit teacher acceptance is live.
create trigger teacher_rules_on_submission before insert or update of status on public.teacher_applications
for each row execute function dars_private.require_teacher_rules_on_submission();
commit;
