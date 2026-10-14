-- Uploaded files exist briefly before their lesson_materials row is inserted.
-- Permit only their active teacher owner to inspect/remove that orphan path.
create or replace function public.can_cleanup_lesson_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
select case
  when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[^/]+$'
       and split_part(object_name,'/',1)=auth.uid()::text
  then exists(
      select 1
      from public.lessons l
      join public.groups g on g.id=l.group_id
      join public.profiles p on p.id=g.teacher_id
      where l.id=split_part(object_name,'/',2)::uuid
        and g.teacher_id=auth.uid()
        and p.role='teacher'
        and p.status='active'
        and public.can_upload_lesson_object(object_name)
    )
  else false
end
$$;
revoke all on function public.can_cleanup_lesson_object(text) from public,anon,authenticated;
grant execute on function public.can_cleanup_lesson_object(text) to authenticated;

-- Keep member access tied to metadata. The extra branch is private to the
-- active teacher whose owner/lesson path was authorized for the upload.
drop policy if exists lesson_objects_read on storage.objects;
create policy lesson_objects_read on storage.objects
for select to authenticated
using(bucket_id='lesson-materials' and (
  public.storage_lesson_access(name,false)
  or public.can_cleanup_lesson_object(name)
));

drop policy if exists lesson_objects_delete on storage.objects;
create policy lesson_objects_delete on storage.objects
for delete to authenticated
using(bucket_id='lesson-materials' and (
  public.storage_lesson_access(name,true)
  or public.can_cleanup_lesson_object(name)
));
