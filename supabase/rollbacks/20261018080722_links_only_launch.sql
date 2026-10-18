-- Manual rollback for 20261018080722_links_only_launch.sql.
drop trigger if exists lesson_materials_link_only on public.lesson_materials;
drop function if exists public.reject_new_non_link_lesson_material();

create policy lesson_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='lesson-materials' and public.can_upload_lesson_object(name));
create policy lesson_objects_update on storage.objects for update to authenticated
using(bucket_id='lesson-materials' and public.storage_lesson_access(name,true))
with check(bucket_id='lesson-materials' and public.storage_lesson_access(name,true));
create policy teacher_avatars_insert on storage.objects for insert to authenticated
with check(bucket_id='teacher-avatars' and public.can_upload_teacher_avatar(name,metadata));
create policy teacher_covers_insert on storage.objects for insert to authenticated
with check(bucket_id='teacher-avatars' and public.can_upload_teacher_cover(name,metadata));
create policy teacher_application_cv_insert on storage.objects for insert to authenticated
with check(bucket_id='teacher-applications' and public.can_upload_teacher_application_cv(name,metadata));

create or replace function dars_private.teacher_application_snapshot_missing(p_snapshot jsonb)
returns text[] language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_missing text[]:=array[]::text[];
  v_details jsonb:=p_snapshot->'profile_details';
  v_phone text:=coalesce(p_snapshot->>'admin_phone','');
begin
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'full_name','')))=0 then v_missing:=array_append(v_missing,'full_name'); end if;
  if p_snapshot is null or nullif(btrim(p_snapshot->>'avatar_path'),'') is null then v_missing:=array_append(v_missing,'photo'); end if;
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'headline','')))<5 then v_missing:=array_append(v_missing,'headline'); end if;
  if v_details is null or (coalesce(length(btrim(v_details->'about'->>'ar')),0)<80 and coalesce(length(btrim(v_details->'about'->>'en')),0)<80) then v_missing:=array_append(v_missing,'bio'); end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot->'specializations')<>'array' or jsonb_array_length(coalesce(p_snapshot->'specializations','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'specializations'); end if;
  if v_details is null or jsonb_typeof(v_details->'languages')<>'array' or jsonb_array_length(coalesce(v_details->'languages','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'languages'); end if;
  if v_details is null or not exists(
    select 1 from jsonb_array_elements(coalesce(v_details->'experience','[]'::jsonb)) e
    where length(btrim(coalesce(e->'title'->>'ar','')||coalesce(e->'title'->>'en','')))>0
      and length(btrim(coalesce(e->'organization'->>'ar','')||coalesce(e->'organization'->>'en','')))>0
      and length(btrim(coalesce(e->'description'->>'ar','')||coalesce(e->'description'->>'en','')))>0
      and e->'start_year'<>'null'::jsonb and ((e->>'current')::boolean or e->'end_year'<>'null'::jsonb)
  ) then v_missing:=array_append(v_missing,'experience'); end if;
  if v_details is null or not exists(
    select 1 from jsonb_array_elements(coalesce(v_details->'qualifications','[]'::jsonb)) q
    where length(btrim(coalesce(q->'title'->>'ar','')||coalesce(q->'title'->>'en','')))>0
      and length(btrim(coalesce(q->'organization'->>'ar','')||coalesce(q->'organization'->>'en','')))>0
      and ((q->>'current')::boolean or q->'end_year'<>'null'::jsonb)
  ) then v_missing:=array_append(v_missing,'qualifications'); end if;
  if length(btrim(coalesce(v_details->'approach'->>'ar','')))<40 and length(btrim(coalesce(v_details->'approach'->>'en','')))<40 then v_missing:=array_append(v_missing,'approach'); end if;
  if jsonb_typeof(p_snapshot->'teaching_years')<>'number' or (p_snapshot->>'teaching_years')::integer not between 0 and 60 then v_missing:=array_append(v_missing,'teaching_years'); end if;
  if length(btrim(v_phone)) not between 7 and 30 or v_phone !~ '^[0-9+() -]+$' or length(regexp_replace(v_phone,'[^0-9]','','g'))<7 then v_missing:=array_append(v_missing,'admin_phone'); end if;
  if coalesce(p_snapshot->>'attested','false')<>'true' then v_missing:=array_append(v_missing,'attestation'); end if;
  return v_missing;
end $$;
revoke all on function dars_private.teacher_application_snapshot_missing(jsonb) from public,anon,authenticated,service_role;
