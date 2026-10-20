-- Manual rollback for 20261020120000_revoke_public_signup_email_lookup.sql.
-- Only needed if an app version that calls signup_email_is_registered() is redeployed.
grant execute on function public.signup_email_is_registered(text) to anon, authenticated;
