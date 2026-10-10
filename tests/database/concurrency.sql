\set ON_ERROR_STOP on
-- Run the two decide_enrollment calls in separate authenticated transactions
-- for a capacity=1 group, then run this postcondition check.

\if :{?test_group_id}
\else
  \echo 'Set test_group_id to the capacity-1 group UUID.'
  \set test_group_id invalid
\endif

begin read only;
select set_config('dars.test_group_id', :'test_group_id'::uuid::text, true);

do $$
declare n integer; g uuid := current_setting('dars.test_group_id')::uuid; cap integer;
begin
 select capacity into strict cap from public.groups where id=g;
 if cap <> 1 then raise exception 'concurrency fixture must have capacity 1'; end if;
 select count(*) into n from public.enrollments where group_id=g and status='accepted';
 if n>cap then raise exception 'capacity invariant violated'; end if;
end $$;
select 'concurrency postcondition passed' as result;
rollback;
