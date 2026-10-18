begin;
create table dars_private.launch_operation_counts(
 day date not null, operation text not null check(operation in ('signup','google_setup','verify_email','enrollment','setup_save','setup_complete')),
 outcome text not null check(outcome in ('success','failed')),
 category text not null check(category in ('none','conflict','authorization','validation','rate_limit','provider')),
 slow boolean not null, count bigint not null default 1 check(count>0),
 primary key(day,operation,outcome,category,slow)
);
alter table dars_private.launch_operation_counts enable row level security;
revoke all on dars_private.launch_operation_counts from public,anon,authenticated,service_role;
create function public.record_launch_operation(p_operation text,p_outcome text,p_category text,p_duration_ms integer)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_duration_ms is null or p_duration_ms not between 0 and 300000 then raise exception 'invalid duration' using errcode='22023'; end if;
 -- Bounded categorical counters, no user identifiers or submitted values.
 delete from dars_private.launch_operation_counts where day<(now() at time zone 'UTC')::date-30;
 insert into dars_private.launch_operation_counts(day,operation,outcome,category,slow)
 values((now() at time zone 'UTC')::date,p_operation,p_outcome,p_category,p_duration_ms>=2000)
 on conflict(day,operation,outcome,category,slow) do update set count=launch_operation_counts.count+1;
end $$;
revoke all on function public.record_launch_operation(text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.record_launch_operation(text,text,text,integer) to service_role;
create function public.admin_launch_health() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_ops jsonb; v_setup jsonb; v_mail bigint; v_reports bigint;
begin
 if public.current_role() is distinct from 'admin'::public.user_role then raise exception 'active admin required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_ops from(
 select operation,sum(count)::bigint as total,coalesce(sum(count)filter(where outcome='failed'),0)::bigint as failed,coalesce(sum(count)filter(where slow),0)::bigint as slow
 from dars_private.launch_operation_counts where day>=(now() at time zone 'UTC')::date-6 group by operation order by operation)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_setup from(
 select d.role,d.current_stage as stage,count(*) as count from public.account_setup_drafts d join public.profiles p on p.id=d.user_id and p.status='active'
 where d.updated_at<now()-interval '24 hours' group by d.role,d.current_stage order by d.role,d.current_stage)x;
 select count(*) into v_mail from dars_private.email_outbox where state='failed';
 select count(*) into v_reports from public.reports where status='open';
 return jsonb_build_object('operations',v_ops,'inactive_setups',v_setup,'email_failures',v_mail,'open_reports',v_reports);
end $$;
revoke all on function public.admin_launch_health() from public,anon,authenticated,service_role;
grant execute on function public.admin_launch_health() to authenticated;
commit;
