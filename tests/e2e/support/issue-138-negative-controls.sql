-- INTENTIONALLY UNMERGED DEMO: apply only to the fresh local CI stack.
-- These independent mutations make the notification persistence and lesson
-- authorization browser assertions fail. They are never migrations or fixtures.

-- Preserve the existing signature and SECURITY DEFINER/search_path attributes,
-- but intentionally skip the read-state update.
create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$ begin
  return;
end $$;

-- Add a separate permissive policy, leaving lesson_read intact.
create policy issue_138_negative_lessons_read on public.lessons
for select to authenticated using (true);
