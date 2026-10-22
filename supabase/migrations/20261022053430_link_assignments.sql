begin;

create or replace function dars_private.is_safe_http_url(p_url text)
returns boolean language plpgsql immutable set search_path=pg_catalog
as $$
declare v_authority text; v_host text; v_port text; v_ip inet;
begin
  if p_url is null or char_length(p_url)>2048 or p_url ~ '[[:space:]]' or p_url ~* '^https?://[^/]*@'
    or p_url !~* '^https?://(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?))*(\.[a-z]{2,63})?|localhost|([0-9]{1,3}\.){3}[0-9]{1,3}|\[[0-9a-f:.]+\])(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then return false; end if;
  v_authority:=(regexp_match(p_url,'^https?://([^/?#]+)','i'))[1];
  v_port:=(regexp_match(v_authority,':([0-9]+)$'))[1];
  if v_port is not null and (v_port::integer<1 or v_port::integer>65535) then return false; end if;
  if v_authority ~ '^\[' then
    v_host:=(regexp_match(v_authority,'^\[([0-9a-f:.]+)\]','i'))[1];
    begin v_ip:=v_host::inet; exception when others then return false; end;
    if family(v_ip)<>6 then return false; end if;
  else
    v_host:=regexp_replace(v_authority,':[0-9]+$','');
    if v_host ~ '^[0-9]+(\.[0-9]+){3}$' then
      begin v_ip:=v_host::inet; exception when others then return false; end;
      if family(v_ip)<>4 then return false; end if;
    end if;
  end if;
  return true;
end $$;
revoke all on function dars_private.is_safe_http_url(text) from public,anon,authenticated,service_role;

create table public.group_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  instructions text not null default '' check (char_length(instructions)<=5000),
  resource_url text check (resource_url is null or dars_private.is_safe_http_url(resource_url)),
  due_at timestamptz,
  status text not null default 'published' check (status in ('published','archived')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (btrim(instructions)<>'' or resource_url is not null),
  check (due_at is null or isfinite(due_at))
);
create index group_assignments_page_idx on public.group_assignments(group_id,status,due_at,id);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.group_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  url text not null check (dars_private.is_safe_http_url(url)),
  student_note text not null default '' check(char_length(student_note)<=2000),
  first_submitted_at timestamptz not null default statement_timestamp(),
  last_submitted_at timestamptz not null default statement_timestamp(),
  revision integer not null default 1 check(revision>0),
  teacher_feedback text check(teacher_feedback is null or char_length(teacher_feedback)<=3000),
  feedback_at timestamptz,
  feedback_by uuid references public.profiles(id) on delete set null,
  unique(assignment_id,student_id),
  check ((teacher_feedback is null and feedback_at is null and feedback_by is null) or feedback_at is not null)
);
create index assignment_submissions_assignment_page_idx on public.assignment_submissions(assignment_id,last_submitted_at desc,id desc);
create index assignment_submissions_student_page_idx on public.assignment_submissions(student_id,assignment_id);

alter table public.group_assignments enable row level security;
alter table public.assignment_submissions enable row level security;
revoke all on public.group_assignments,public.assignment_submissions from public,anon,authenticated,service_role;
grant select on public.group_assignments,public.assignment_submissions to authenticated;
create policy group_assignments_read on public.group_assignments for select to authenticated using (
  exists(select 1 from public.groups g where g.id=group_id and (
    (g.teacher_id=(select auth.uid()) and exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.id=g.teacher_id and p.role='teacher' and p.status='active' and tp.approved))
    or exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.group_id=g.id and e.student_id=(select auth.uid()) and e.status='accepted' and p.role='student' and p.status='active')
  ))
);
create policy assignment_submissions_read on public.assignment_submissions for select to authenticated using (
  (student_id=(select auth.uid()) and exists(select 1 from public.profiles sp join public.enrollments e on e.student_id=sp.id
    join public.group_assignments a on a.id=assignment_id join public.groups g on g.id=a.group_id
    where sp.id=(select auth.uid()) and sp.role='student' and sp.status='active' and e.group_id=g.id and e.status='accepted'))
  or exists(select 1 from public.group_assignments a join public.groups g on g.id=a.group_id
    join public.profiles p on p.id=g.teacher_id join public.teacher_profiles tp on tp.id=p.id
    where a.id=assignment_id and g.teacher_id=(select auth.uid()) and p.role='teacher' and p.status='active' and tp.approved)
);

create or replace function public.save_group_assignment(
  p_group_id uuid,p_title text,p_instructions text,p_resource_url text,p_due_at timestamptz,
  p_assignment_id uuid default null,p_expected_version integer default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare v_uid uuid:=auth.uid(); v_teacher uuid; v_group public.groups; v_assignment public.group_assignments; v_id uuid;
begin
  if v_uid is null or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.id=v_uid and p.role='teacher' and p.status='active' and tp.approved) then raise exception 'active approved teacher required' using errcode='42501'; end if;
  select teacher_id into v_teacher from public.groups where id=p_group_id;
  if v_teacher is distinct from v_uid then raise exception 'group unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select * into v_group from public.groups where id=p_group_id for update;
  if not found or v_group.teacher_id is distinct from v_uid or v_group.status<>'published'
    or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.id=v_uid and p.role='teacher' and p.status='active' and tp.approved)
    or not dars_private.teacher_has_access(v_uid) then raise exception 'published group unavailable'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 or p_instructions is null or char_length(p_instructions)>5000 or char_length(coalesce(p_resource_url,''))>2048
    or (btrim(p_instructions)='' and nullif(p_resource_url,'') is null) or (p_resource_url is not null and not dars_private.is_safe_http_url(p_resource_url)) then raise exception 'invalid assignment fields' using errcode='22023'; end if;
  if p_assignment_id is null then
    if p_expected_version is not null then raise exception 'unexpected version'; end if;
    insert into public.group_assignments(group_id,title,instructions,resource_url,due_at) values(p_group_id,btrim(p_title),p_instructions,nullif(p_resource_url,''),p_due_at) returning id into v_id;
  else
    select * into v_assignment from public.group_assignments where id=p_assignment_id and group_id=p_group_id for update;
    if not found or v_assignment.status<>'published' then raise exception 'assignment unavailable'; end if;
    if p_expected_version is null or p_expected_version<>v_assignment.version then raise exception 'assignment version conflict' using errcode='40001'; end if;
    update public.group_assignments set title=btrim(p_title),instructions=p_instructions,resource_url=nullif(p_resource_url,''),due_at=p_due_at,version=version+1,updated_at=statement_timestamp() where id=p_assignment_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.archive_group_assignment(p_assignment_id uuid,p_expected_version integer)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare v_group_id uuid; v_teacher uuid; v_group public.groups; v_assignment public.group_assignments;
begin
  select a.group_id,g.teacher_id into v_group_id,v_teacher from public.group_assignments a join public.groups g on g.id=a.group_id where a.id=p_assignment_id;
  if v_group_id is null or v_teacher is distinct from auth.uid() then raise exception 'assignment unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select * into v_group from public.groups where id=v_group_id for update;
  if not found or v_group.teacher_id is distinct from auth.uid() or v_group.status<>'published' then raise exception 'assignment unavailable'; end if;
  if not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.id=v_teacher and p.role='teacher' and p.status='active' and tp.approved) or not dars_private.teacher_has_access(v_teacher) then raise exception 'teacher access required' using errcode='42501'; end if;
  select * into v_assignment from public.group_assignments where id=p_assignment_id and group_id=v_group_id for update;
  if not found then raise exception 'assignment unavailable'; end if;
  if v_assignment.status='archived' then return; end if;
  if p_expected_version is null or p_expected_version<>v_assignment.version then raise exception 'assignment version conflict' using errcode='40001'; end if;
  update public.group_assignments set status='archived',version=version+1,updated_at=statement_timestamp() where id=p_assignment_id;
end $$;

create or replace function public.submit_assignment_link(p_assignment_id uuid,p_url text,p_student_note text,p_expected_revision integer default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare v_uid uuid:=auth.uid(); v_group_id uuid; v_teacher uuid; v_group public.groups; v_assignment public.group_assignments; v_enrollment public.enrollments; v_submission public.assignment_submissions; v_id uuid;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='student' and p.status='active') then raise exception 'active student required' using errcode='42501'; end if;
  select a.group_id,g.teacher_id into v_group_id,v_teacher from public.group_assignments a join public.groups g on g.id=a.group_id where a.id=p_assignment_id;
  if v_group_id is null then raise exception 'assignment unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select * into v_group from public.groups where id=v_group_id for update;
  if not found or v_group.teacher_id is distinct from v_teacher or v_group.status<>'published' then raise exception 'published group unavailable'; end if;
  if not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.id=v_teacher and p.role='teacher' and p.status='active' and tp.approved) or not dars_private.teacher_has_access(v_teacher) then raise exception 'teacher access required' using errcode='42501'; end if;
  select * into v_assignment from public.group_assignments where id=p_assignment_id and group_id=v_group_id for update;
  if not found or v_assignment.status<>'published' then raise exception 'assignment unavailable'; end if;
  select * into v_enrollment from public.enrollments where group_id=v_group_id and student_id=v_uid for update;
  if not found or v_enrollment.status<>'accepted' or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='student' and p.status='active') then raise exception 'accepted enrollment required' using errcode='42501'; end if;
  if not dars_private.is_safe_http_url(p_url) or p_student_note is null or char_length(p_student_note)>2000 then raise exception 'invalid submission fields' using errcode='22023'; end if;
  select * into v_submission from public.assignment_submissions where assignment_id=p_assignment_id and student_id=v_uid for update;
  if found then
    if p_expected_revision is null or p_expected_revision<>v_submission.revision then raise exception 'submission revision conflict' using errcode='40001'; end if;
    update public.assignment_submissions set url=p_url,student_note=p_student_note,last_submitted_at=statement_timestamp(),revision=revision+1,teacher_feedback=null,feedback_at=null,feedback_by=null where id=v_submission.id returning id into v_id;
  else
    if coalesce(p_expected_revision,0)<>0 then raise exception 'submission revision conflict' using errcode='40001'; end if;
    insert into public.assignment_submissions(assignment_id,student_id,url,student_note) values(p_assignment_id,v_uid,p_url,p_student_note) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.review_assignment_submission(p_submission_id uuid,p_feedback text,p_expected_revision integer)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth,dars_private
as $$
declare v_group_id uuid; v_teacher uuid; v_assignment_id uuid; v_student_id uuid; v_group public.groups; v_assignment public.group_assignments; v_enrollment public.enrollments; v_submission public.assignment_submissions;
begin
  select a.group_id,g.teacher_id,s.assignment_id,s.student_id into v_group_id,v_teacher,v_assignment_id,v_student_id from public.assignment_submissions s join public.group_assignments a on a.id=s.assignment_id join public.groups g on g.id=a.group_id where s.id=p_submission_id;
  if v_group_id is null or v_teacher is distinct from auth.uid() then raise exception 'submission unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  select * into v_group from public.groups where id=v_group_id for update;
  if not found or v_group.teacher_id is distinct from auth.uid() then raise exception 'submission unavailable'; end if;
  if v_group.status<>'published' or not exists(select 1 from public.profiles p join public.teacher_profiles tp on tp.id=p.id where p.id=v_teacher and p.role='teacher' and p.status='active' and tp.approved) or not dars_private.teacher_has_access(v_teacher) then raise exception 'teacher access required' using errcode='42501'; end if;
  select * into v_assignment from public.group_assignments where id=v_assignment_id and group_id=v_group_id for update;
  if not found or v_assignment.status<>'published' then raise exception 'assignment unavailable'; end if;
  select * into v_enrollment from public.enrollments where group_id=v_group_id and student_id=v_student_id for update;
  if not found or v_enrollment.status<>'accepted' or not exists(select 1 from public.profiles p where p.id=v_student_id and p.role='student' and p.status='active') then raise exception 'accepted enrollment required'; end if;
  select * into v_submission from public.assignment_submissions where id=p_submission_id for update;
  if not found or v_submission.student_id is distinct from v_student_id then raise exception 'submission unavailable'; end if;
  if p_expected_revision is null or p_expected_revision<>v_submission.revision then raise exception 'submission revision conflict' using errcode='40001'; end if;
  if p_feedback is not null and char_length(p_feedback)>3000 then raise exception 'feedback too long' using errcode='22023'; end if;
  update public.assignment_submissions set teacher_feedback=nullif(p_feedback,''),feedback_at=case when nullif(p_feedback,'') is null then null else statement_timestamp() end,feedback_by=case when nullif(p_feedback,'') is null then null else v_teacher end where id=p_submission_id;
end $$;

create or replace function public.student_assignment_page(p_group_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$ declare v_uid uuid:=auth.uid(); v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if not exists(select 1 from public.profiles p join public.enrollments e on e.student_id=p.id where p.id=v_uid and p.role='student' and p.status='active' and e.group_id=p_group_id and e.status='accepted') then raise exception 'accepted enrollment required' using errcode='42501'; end if;
 select count(*) into v_total from public.group_assignments a where a.group_id=p_group_id and (a.status='published' or exists(select 1 from public.assignment_submissions s where s.assignment_id=a.id and s.student_id=v_uid));
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'title',q.title,'instructions',q.instructions,'resource_url',q.resource_url,'due_at',q.due_at,'status',q.status,'version',q.version,'created_at',q.created_at,'submission',case when q.sid is null then null else jsonb_build_object('id',q.sid,'url',q.url,'student_note',q.student_note,'first_submitted_at',q.first_submitted_at,'last_submitted_at',q.last_submitted_at,'revision',q.revision,'is_late',q.due_at is not null and q.last_submitted_at>q.due_at,'teacher_feedback',q.teacher_feedback,'feedback_at',q.feedback_at) end) order by q.sort_order,q.due_at nulls last,q.id),'[]'::jsonb) into v_rows from (
 select a.*,s.id sid,s.url,s.student_note,s.first_submitted_at,s.last_submitted_at,s.revision,s.teacher_feedback,s.feedback_at,case when a.status='published' then 0 else 1 end sort_order from public.group_assignments a left join public.assignment_submissions s on s.assignment_id=a.id and s.student_id=v_uid where a.group_id=p_group_id and (a.status='published' or s.id is not null) order by sort_order,a.due_at nulls last,a.id offset p_offset limit p_limit
 ) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.teacher_assignment_page(p_group_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth,dars_private
as $$ declare v_uid uuid:=auth.uid(); v_rows jsonb; v_total bigint;
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 if not exists(select 1 from public.groups g join public.profiles p on p.id=g.teacher_id join public.teacher_profiles tp on tp.id=p.id where g.id=p_group_id and g.teacher_id=v_uid and p.role='teacher' and p.status='active' and tp.approved) then raise exception 'group owner required' using errcode='42501'; end if;
 select count(*) into v_total from public.group_assignments where group_id=p_group_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'group_id',q.group_id,'title',q.title,'instructions',q.instructions,'resource_url',q.resource_url,'due_at',q.due_at,'status',q.status,'version',q.version,'created_at',q.created_at,'submitted_count',q.submitted_count,'accepted_student_count',q.accepted_student_count) order by q.created_at desc,q.id desc),'[]'::jsonb) into v_rows from (
 select a.*,(select count(*) from public.assignment_submissions s join public.enrollments e on e.group_id=p_group_id and e.student_id=s.student_id and e.status='accepted' where s.assignment_id=a.id) submitted_count,(select count(*) from public.enrollments e where e.group_id=p_group_id and e.status='accepted') accepted_student_count from public.group_assignments a where a.group_id=p_group_id order by a.created_at desc,a.id desc offset p_offset limit p_limit
 ) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

create or replace function public.teacher_assignment_submissions(p_assignment_id uuid,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth,dars_private
as $$ declare v_uid uuid:=auth.uid(); v_rows jsonb; v_total bigint; v_group_id uuid; v_due timestamptz;
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>20 then raise exception 'invalid page' using errcode='22023'; end if;
 select a.group_id,a.due_at into v_group_id,v_due from public.group_assignments a join public.groups g on g.id=a.group_id join public.profiles p on p.id=g.teacher_id join public.teacher_profiles tp on tp.id=p.id where a.id=p_assignment_id and g.teacher_id=v_uid and p.role='teacher' and p.status='active' and tp.approved;
 if v_group_id is null then raise exception 'assignment unavailable' using errcode='42501'; end if;
 select count(*) into v_total from public.assignment_submissions where assignment_id=p_assignment_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'student_id',q.student_id,'student_name',q.student_name,'enrollment_status',q.enrollment_status,'url',q.url,'student_note',q.student_note,'first_submitted_at',q.first_submitted_at,'last_submitted_at',q.last_submitted_at,'revision',q.revision,'is_late',v_due is not null and q.last_submitted_at>v_due,'teacher_feedback',q.teacher_feedback,'feedback_at',q.feedback_at) order by q.last_submitted_at desc,q.id desc),'[]'::jsonb) into v_rows from (
 select s.*,p.full_name student_name,coalesce(e.status::text,'removed') enrollment_status from public.assignment_submissions s join public.profiles p on p.id=s.student_id left join public.enrollments e on e.group_id=v_group_id and e.student_id=s.student_id where s.assignment_id=p_assignment_id order by s.last_submitted_at desc,s.id desc offset p_offset limit p_limit
 ) q;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end $$;

revoke all on function public.save_group_assignment(uuid,text,text,text,timestamptz,uuid,integer),public.archive_group_assignment(uuid,integer),public.submit_assignment_link(uuid,text,text,integer),public.review_assignment_submission(uuid,text,integer),public.student_assignment_page(uuid,integer,integer),public.teacher_assignment_page(uuid,integer,integer),public.teacher_assignment_submissions(uuid,integer,integer) from public,anon,service_role;
grant execute on function public.save_group_assignment(uuid,text,text,text,timestamptz,uuid,integer),public.archive_group_assignment(uuid,integer),public.submit_assignment_link(uuid,text,text,integer),public.review_assignment_submission(uuid,text,integer),public.student_assignment_page(uuid,integer,integer),public.teacher_assignment_page(uuid,integer,integer),public.teacher_assignment_submissions(uuid,integer,integer) to authenticated;

commit;
