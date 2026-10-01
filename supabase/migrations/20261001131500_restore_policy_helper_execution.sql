begin;

-- RLS evaluates helper functions using the caller's role. These functions are
-- intentionally not public endpoints, but authenticated application requests
-- must be allowed to execute them for the policies that reference them.
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.storage_lesson_access(text,boolean) to authenticated;
grant execute on function public.can_upload_lesson_object(text) to authenticated;

commit;
