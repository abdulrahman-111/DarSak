begin;

-- Compose the existing guarded mutations without adding elevated privileges.
-- A failure in either section rolls back the entire save, including a new
-- catalogue pairing or group. Keep the two independent concurrency tokens.
create function public.save_teacher_group_details(
  p_group_id uuid, p_subject_id uuid, p_category_id uuid,
  p_name text, p_description text, p_capacity integer, p_location text,
  p_expected_updated_at timestamptz, p_learning_values jsonb,
  p_expected_learning_updated_at timestamptz
)
returns uuid language plpgsql security invoker
set search_path = ''
as $$
declare v_id uuid;
begin
  v_id := public.save_teacher_group_draft(
    p_group_id, p_subject_id, p_category_id, p_name, p_description,
    p_capacity, p_location, p_expected_updated_at
  );
  perform public.save_group_learning_details(
    v_id, p_learning_values, p_expected_learning_updated_at
  );
  return v_id;
end;
$$;
revoke all on function public.save_teacher_group_details(uuid,uuid,uuid,text,text,integer,text,timestamptz,jsonb,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.save_teacher_group_details(uuid,uuid,uuid,text,text,integer,text,timestamptz,jsonb,timestamptz)
  to authenticated;

commit;
