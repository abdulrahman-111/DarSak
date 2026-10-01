begin;

-- The extension is not used by the schema. Keeping it out of the exposed
-- public schema removes an unnecessary externally visible surface.
drop extension if exists btree_gist;

-- Helpers are called only by policies and must never become public RPCs.
revoke all on function public.current_role() from public,anon,authenticated;
revoke all on function public.is_active_user(uuid) from public,anon,authenticated;
revoke all on function public.is_group_owner(uuid) from public,anon,authenticated;
revoke all on function public.is_group_member(uuid) from public,anon,authenticated;
revoke all on function public.storage_lesson_access(text,boolean) from public,anon,authenticated;
revoke all on function public.can_upload_lesson_object(text) from public,anon,authenticated;

-- These are deliberate application RPC endpoints; each implements its own
-- authorization checks before reading or mutating protected rows.
revoke all on function public.public_teachers() from public;
grant execute on function public.public_teachers() to anon,authenticated;
revoke all on function public.public_groups() from public;
grant execute on function public.public_groups() to anon,authenticated;

revoke all on function public.request_enrollment(uuid),public.decide_enrollment(uuid,text),public.cancel_enrollment(uuid),public.save_schedule_slot(uuid,int,time,time,uuid),public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid),public.generate_lessons(uuid,date,date),public.admin_update_user(uuid,text,boolean),public.group_students(uuid),public.set_lesson_status(uuid,text) from public,anon;
grant execute on function public.request_enrollment(uuid),public.decide_enrollment(uuid,text),public.cancel_enrollment(uuid),public.save_schedule_slot(uuid,int,time,time,uuid),public.create_lesson(uuid,text,timestamptz,timestamptz,text,uuid),public.generate_lessons(uuid,date,date),public.admin_update_user(uuid,text,boolean),public.group_students(uuid),public.set_lesson_status(uuid,text) to authenticated;

commit;
