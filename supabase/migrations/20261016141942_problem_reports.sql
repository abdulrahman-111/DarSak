begin;

alter table public.reports
  add column page_path text not null default '',
  add constraint reports_page_path_length check (length(page_path) <= 500),
  add constraint reports_page_path_relative check (
    page_path = '' or (page_path ~ '^/[^?#[:cntrl:]]*$' and page_path !~ '^//' and page_path !~ E'\\\\')
  );
create index reports_reporter_created_id_idx on public.reports(reporter_id, created_at desc, id desc);
create index reports_created_id_idx on public.reports(created_at desc, id desc);

-- The old table grant exposed admin_note through the REST API. Keep explicit
-- column access for reporter history and the admin's status/note update flow.
revoke select on table public.reports from authenticated;
revoke select (id, reporter_id, subject, description, status, admin_note, created_at, updated_at, page_path)
  on table public.reports from authenticated;
grant select (id, reporter_id, subject, description, status, page_path, created_at, updated_at)
  on table public.reports to authenticated;

revoke insert on table public.reports from authenticated;
revoke insert (id, reporter_id, subject, description, status, admin_note, created_at, updated_at, page_path)
  on table public.reports from authenticated;

revoke update on table public.reports from authenticated;
revoke update (id, reporter_id, subject, description, status, admin_note, created_at, updated_at, page_path)
  on table public.reports from authenticated;
grant update (status, admin_note) on table public.reports to authenticated;

drop policy if exists report_read on public.reports;
create policy report_read on public.reports for select to authenticated
  using (
    (reporter_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.current_role()) = 'admin'
  );

create or replace function public.submit_problem_report(
  p_subject text,
  p_description text,
  p_page_path text default ''
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_subject text := btrim(coalesce(p_subject, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_page_path text := coalesce(p_page_path, '');
  v_id uuid;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active signed-in account is required to submit a report.';
  end if;

  if length(v_subject) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'Subject must be between 2 and 160 characters.';
  end if;
  if length(v_description) not between 10 and 5000 then
    raise exception using errcode = '22023', message = 'Description must be between 10 and 5000 characters.';
  end if;
  if length(v_page_path) > 500
     or (v_page_path <> '' and (v_page_path !~ '^/[^?#[:cntrl:]]*$' or v_page_path ~ '^//' or v_page_path ~ E'\\\\')) then
    raise exception using errcode = '22023', message = 'Affected page must be a relative pathname without a query or fragment.';
  end if;

  -- Serialize requests per account so concurrent submissions cannot exceed the cap.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 48291));
  if not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active signed-in account is required to submit a report.';
  end if;

  select r.id into v_id
  from public.reports r
  where r.reporter_id = v_user_id
    and r.subject = v_subject
    and r.description = v_description
    and r.page_path = v_page_path
    and r.created_at >= now() - interval '60 seconds'
  order by r.created_at desc, r.id desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.reports r
      where r.reporter_id = v_user_id and r.created_at >= now() - interval '1 hour') >= 5 then
    raise exception using errcode = 'PT429', message = 'You have reached the limit of 5 reports per hour. Please try again later.';
  end if;

  insert into public.reports (reporter_id, subject, description, page_path)
  values (v_user_id, v_subject, v_description, v_page_path)
  returning id into v_id;
  return v_id;
end;
$$;

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

  select count(*) into v_total
  from public.reports r
  where p_status = 'all' or r.status::text = p_status;

  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc), '[]'::jsonb)
  into v_rows
  from (
    select r.id, r.reporter_id, p.full_name as reporter_name, p.role::text as reporter_role,
      r.subject, r.description, r.status::text as status, r.page_path, r.admin_note,
      r.created_at, r.updated_at
    from public.reports r
    join public.profiles p on p.id = r.reporter_id
    where p_status = 'all' or r.status::text = p_status
    order by r.created_at desc, r.id desc
    offset p_offset limit p_limit
  ) page_row;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

revoke all on function public.submit_problem_report(text, text, text) from public, anon, service_role;
grant execute on function public.submit_problem_report(text, text, text) to authenticated;
revoke all on function public.admin_problem_report_page(text, integer, integer) from public, anon, service_role;
grant execute on function public.admin_problem_report_page(text, integer, integer) to authenticated;

commit;
