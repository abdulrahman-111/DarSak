begin;

-- A complete application needs one substantive background entry. A degree or
-- certification can stand on its own, as can relevant experience.
create or replace function dars_private.teacher_application_snapshot_missing(p_snapshot jsonb)
returns text[] language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_missing text[]:=array[]::text[];
  v_details jsonb:=p_snapshot->'profile_details';
  v_phone text:=coalesce(p_snapshot->>'admin_phone','');
  v_teaching_years numeric;
  v_has_experience boolean:=false;
  v_has_qualification boolean:=false;
begin
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'full_name','')))=0 then v_missing:=array_append(v_missing,'full_name'); end if;
  if p_snapshot is null or length(btrim(coalesce(p_snapshot->>'headline','')))<5 then v_missing:=array_append(v_missing,'headline'); end if;
  if v_details is null or (coalesce(length(btrim(v_details->'about'->>'ar')),0)<80 and coalesce(length(btrim(v_details->'about'->>'en')),0)<80) then v_missing:=array_append(v_missing,'bio'); end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot->'specializations')<>'array' or jsonb_array_length(coalesce(p_snapshot->'specializations','[]'::jsonb))=0 then v_missing:=array_append(v_missing,'specializations'); end if;

  if jsonb_typeof(v_details->'experience')='array' then
    select exists(
      select 1 from jsonb_array_elements(v_details->'experience') e
      where length(btrim(coalesce(e->'title'->>'ar','')||coalesce(e->'title'->>'en','')))>0
        and length(btrim(coalesce(e->'organization'->>'ar','')||coalesce(e->'organization'->>'en','')))>0
        and length(btrim(coalesce(e->'description'->>'ar','')||coalesce(e->'description'->>'en','')))>0
        and e->'start_year'<>'null'::jsonb and ((e->>'current')::boolean or e->'end_year'<>'null'::jsonb)
    ) into v_has_experience;
  end if;
  if jsonb_typeof(v_details->'qualifications')='array' then
    select exists(
      select 1 from jsonb_array_elements(v_details->'qualifications') q
      where length(btrim(coalesce(q->'title'->>'ar','')||coalesce(q->'title'->>'en','')))>0
        and length(btrim(coalesce(q->'organization'->>'ar','')||coalesce(q->'organization'->>'en','')))>0
        and ((q->>'current')::boolean or q->'end_year'<>'null'::jsonb)
    ) into v_has_qualification;
  end if;
  if not (v_has_experience or v_has_qualification) then v_missing:=array_append(v_missing,'experience_or_qualification'); end if;

  if jsonb_typeof(p_snapshot->'teaching_years') is distinct from 'number' then
    v_missing:=array_append(v_missing,'teaching_years');
  else
    v_teaching_years:=(p_snapshot->>'teaching_years')::numeric;
    if v_teaching_years<>trunc(v_teaching_years) or v_teaching_years not between 0 and 60 then
      v_missing:=array_append(v_missing,'teaching_years');
    end if;
  end if;
  if length(btrim(v_phone)) not between 7 and 30 or v_phone !~ '^[0-9+() -]+$' or length(regexp_replace(v_phone,'[^0-9]','','g'))<7 then v_missing:=array_append(v_missing,'admin_phone'); end if;
  if coalesce(p_snapshot->>'attested','false')<>'true' then v_missing:=array_append(v_missing,'attestation'); end if;
  return v_missing;
end $$;
revoke all on function dars_private.teacher_application_snapshot_missing(jsonb) from public,anon,authenticated,service_role;

commit;
