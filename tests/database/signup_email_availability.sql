\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
  ('8e000000-0000-4000-8000-000000000001','authenticated','authenticated','availability-confirmed@test.invalid',clock_timestamp(),'{}'),
  ('8e000000-0000-4000-8000-000000000002','authenticated','authenticated','availability-unconfirmed@test.invalid',null,'{}'),
  ('8e000000-0000-4000-8000-000000000003','authenticated','authenticated','availability-google@test.invalid',clock_timestamp(),'{}');

do $$
begin
  if (select prorettype from pg_proc where oid = 'public.signup_email_is_registered(text)'::regprocedure) <> 'boolean'::regtype then
    raise exception 'email availability must return only a boolean';
  end if;
  if not has_function_privilege('anon', 'public.signup_email_is_registered(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.signup_email_is_registered(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.signup_email_is_registered(text)', 'EXECUTE')
     or exists (
       select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = 'public.signup_email_is_registered(text)'::regprocedure
         and a.grantee = 0 and a.privilege_type = 'EXECUTE'
     )
     or has_table_privilege('anon', 'auth.users', 'SELECT') then
    raise exception 'email availability function privileges are not narrowly scoped';
  end if;
end $$;

set local role anon;
select public.signup_email_is_registered('Availability-Confirmed@Test.Invalid') as confirmed_found \gset
\if :confirmed_found
\else
  \echo 'case-insensitive lookup failed for confirmed email'
  \quit 1
\endif
select public.signup_email_is_registered('availability-unconfirmed@test.invalid') as unconfirmed_found \gset
\if :unconfirmed_found
\else
  \echo 'lookup failed for unconfirmed email'
  \quit 1
\endif
select public.signup_email_is_registered('availability-google@test.invalid') as google_found \gset
\if :google_found
\else
  \echo 'lookup failed for existing Google email'
  \quit 1
\endif
select public.signup_email_is_registered('availability-missing@test.invalid') as missing_found \gset
\if :missing_found
  \echo 'lookup unexpectedly found an absent email'
  \quit 1
\endif
reset role;

rollback;
select 'signup email availability assertions passed' as result;
