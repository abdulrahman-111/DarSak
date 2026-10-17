create or replace function public.signup_email_is_registered(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if p_email is null
     or char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;

  return exists (
    select 1
    from auth.users u
    where lower(u.email) = v_email
  );
end;
$$;

revoke all on function public.signup_email_is_registered(text) from public, anon, authenticated, service_role;
grant execute on function public.signup_email_is_registered(text) to anon, authenticated;
