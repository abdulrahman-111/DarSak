begin;

alter table public.reports
  add column public_response text not null default '',
  add column reviewed_at timestamptz,
  add constraint reports_public_response_length check (length(public_response) <= 3000);

-- Use a monotonic row version even for multiple reviews in one transaction.
create or replace function public.touch_report_review() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); return new; end $$;
revoke all on function public.touch_report_review() from public,anon,authenticated;
drop trigger reports_touch on public.reports;
create trigger reports_touch before update on public.reports for each row execute function public.touch_report_review();
-- Reports remain visible to their owner and administrators under report_read.
grant select (public_response, reviewed_at) on public.reports to authenticated;
revoke update (status, admin_note) on public.reports from authenticated;

create or replace function public.admin_update_problem_report(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_public_response text,
  p_admin_note text
) returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_updated_at timestamptz;
  v_status text := p_status;
  v_response text := btrim(coalesce(p_public_response, ''));
  v_note text := btrim(coalesce(p_admin_note, ''));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'An active administrator account is required.';
  end if;
  if p_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'A report id and expected update time are required.';
  end if;
  if v_status is null or v_status not in ('open', 'resolved') then
    raise exception using errcode = '22023', message = 'Status must be open or resolved.';
  end if;
  if length(v_response) > 3000 or length(v_note) > 3000 then
    raise exception using errcode = '22023', message = 'Responses and notes must be 3,000 characters or fewer.';
  end if;
  if v_status = 'resolved' and v_response = '' then
    raise exception using errcode = '22023', message = 'A public response is required to resolve a report.';
  end if;

  select r.updated_at into v_updated_at
  from public.reports r where r.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found.';
  end if;
  if v_updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Report changed since it was opened; refresh and try again.';
  end if;

  update public.reports r
  set status = v_status::public.report_status,
      public_response = v_response,
      admin_note = v_note,
      reviewed_at = coalesce(r.reviewed_at, now()),
      updated_at = clock_timestamp()
  where r.id = p_id
  returning r.updated_at into v_updated_at;
  return v_updated_at;
end;
$$;

revoke all on function public.admin_update_problem_report(uuid, timestamptz, text, text, text) from public, anon, service_role;
grant execute on function public.admin_update_problem_report(uuid, timestamptz, text, text, text) to authenticated;

create or replace function public.admin_problem_report_page(
  p_status text default 'all',
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_total bigint;
  v_rows jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'An active administrator account is required.';
  end if;
  if p_status is null or p_status not in ('all', 'open', 'resolved') then
    raise exception using errcode = '22023', message = 'Status must be all, open, or resolved.';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Offset must be nonnegative and limit must be between 1 and 20.';
  end if;

  select count(*) into v_total from public.reports r where p_status = 'all' or r.status::text = p_status;
  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc), '[]'::jsonb)
  into v_rows
  from (
    select r.id, r.reporter_id, p.full_name as reporter_name, p.role::text as reporter_role,
      r.subject, r.description, r.status::text as status, r.page_path, r.admin_note,
      r.public_response, r.reviewed_at, r.created_at, r.updated_at
    from public.reports r join public.profiles p on p.id = r.reporter_id
    where p_status = 'all' or r.status::text = p_status
    order by r.created_at desc, r.id desc offset p_offset limit p_limit
  ) page_row;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

revoke all on function public.admin_problem_report_page(text, integer, integer) from public, anon, service_role;
grant execute on function public.admin_problem_report_page(text, integer, integer) to authenticated;

commit;
