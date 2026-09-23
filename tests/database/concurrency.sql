\set ON_ERROR_STOP on
-- Run the two decide_enrollment calls in separate authenticated transactions
-- for a capacity=1 group, then run this postcondition check.
do $$
declare n integer; g uuid := :'test_group_id'::uuid; cap integer;
begin
 select capacity into cap from public.groups where id=g;
 select count(*) into n from public.enrollments where group_id=g and status='accepted';
 if n>cap then raise exception 'capacity invariant violated'; end if;
end $$;
select 'concurrency postcondition passed' as result;
