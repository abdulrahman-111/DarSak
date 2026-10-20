-- Close an account-enumeration path: signup_email_is_registered() was callable
-- by anon with the public publishable key, so anyone could test whether an
-- email has an account without Turnstile or a rate limit.
-- The app no longer calls it; Supabase signUp() (captcha and rate-limit
-- protected) reports existing accounts instead.
-- Deploy the app change first, then this migration.
begin;
revoke all on function public.signup_email_is_registered(text) from public, anon, authenticated;
commit;
