-- Add the compare-and-set RPC before deploying actions that call it. The
-- authenticated column permission is revoked separately after that app is live.

create or replace function public.set_teacher_avatar_path(p_avatar_path text,p_expected_path text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,auth,storage
as $$
declare
  v_teacher_id uuid := auth.uid();
begin
  if v_teacher_id is null or not exists(
    select 1 from public.profiles p
    where p.id=v_teacher_id and p.role='teacher' and p.status='active'
  ) then
    raise exception 'active teacher required' using errcode='42501';
  end if;

  -- Serialize avatar mutations for this teacher before comparing the expected
  -- path. Missing profile rows are rejected rather than treated as success.
  perform 1 from public.teacher_profiles t where t.id=v_teacher_id for update;
  if not found then
    raise exception 'teacher profile required' using errcode='42501';
  end if;

  if p_avatar_path is not null then
    if p_avatar_path !~ (
      '^'||v_teacher_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    ) then
      raise exception 'invalid teacher avatar path' using errcode='22023';
    end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='teacher-avatars' and o.name=p_avatar_path) then
      raise exception 'teacher avatar object required' using errcode='22023';
    end if;
  end if;

  update public.teacher_profiles
    set avatar_path=p_avatar_path
    where id=v_teacher_id and avatar_path is not distinct from p_expected_path;
  return found;
end
$$;
revoke all on function public.set_teacher_avatar_path(text,text) from public,anon,authenticated,service_role;
grant execute on function public.set_teacher_avatar_path(text,text) to authenticated;
