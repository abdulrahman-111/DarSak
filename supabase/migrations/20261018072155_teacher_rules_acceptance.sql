begin;

create table public.teacher_rules_acceptances (
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  policy_version text not null check(length(policy_version) between 1 and 40),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key(teacher_id,policy_version)
);
alter table public.teacher_rules_acceptances enable row level security;
revoke all on public.teacher_rules_acceptances from public,anon,authenticated,service_role;
grant select on public.teacher_rules_acceptances to authenticated;
create policy teacher_rules_authorized_read on public.teacher_rules_acceptances
for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active'
    and ((p.role='teacher' and p.id=teacher_id) or p.role='admin'))
);

create function public.accept_teacher_rules(p_rules_version text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_rules_version is distinct from '2026-10-18' then
    raise exception 'current teacher rules must be accepted' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher-calendar:'||auth.uid()::text,0));
  perform 1 from public.teacher_profiles where id=auth.uid() for update;
  if not found or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher' and p.status='active') then
    raise exception 'active teacher required' using errcode='42501';
  end if;
  insert into public.teacher_rules_acceptances(teacher_id,policy_version)
  values(auth.uid(),p_rules_version) on conflict(teacher_id,policy_version) do nothing;
end;
$$;
revoke all on function public.accept_teacher_rules(text) from public,anon,authenticated,service_role;
grant execute on function public.accept_teacher_rules(text) to authenticated;

-- Also guard the original submission endpoints. Accepting accuracy/CV attestation
-- in an older client is not evidence of consent to these teacher rules.
create function dars_private.require_teacher_rules_on_submission()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_accepted_at timestamptz;
begin
  if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    select accepted_at into v_accepted_at from public.teacher_rules_acceptances
    where teacher_id=new.teacher_id and policy_version='2026-10-18';
    if not found then raise exception 'current teacher rules must be accepted' using errcode='22023'; end if;
    new.snapshot := coalesce(new.snapshot,'{}'::jsonb) || jsonb_build_object(
      'teacher_rules_version','2026-10-18','teacher_rules_accepted_at',v_accepted_at
    );
  end if;
  return new;
end;
$$;
revoke all on function dars_private.require_teacher_rules_on_submission() from public,anon,authenticated,service_role;
-- Submission enforcement is activated after the compatible application is deployed.


create function public.submit_teacher_application_with_rules(p_expected_updated_at timestamptz,p_rules_version text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
  perform public.accept_teacher_rules(p_rules_version);
  return public.submit_teacher_application(p_expected_updated_at);
end;
$$;
revoke all on function public.submit_teacher_application_with_rules(timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_teacher_application_with_rules(timestamptz,text) to authenticated;

create function public.complete_teacher_account_setup_with_rules(
  p_expected_version bigint,p_locale text,p_return_to text,p_rules_version text
)
returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
  perform public.accept_teacher_rules(p_rules_version);
  return public.complete_teacher_account_setup(p_expected_version,p_locale,p_return_to);
end;
$$;
revoke all on function public.complete_teacher_account_setup_with_rules(bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_teacher_account_setup_with_rules(bigint,text,text,text) to authenticated;

commit;
