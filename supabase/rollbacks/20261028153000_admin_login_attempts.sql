-- Manual rollback for 20261028153000_admin_login_attempts.sql.
-- Redeploy an admin app version without the login throttle first; the current app fails open if these functions are missing.
drop function if exists public.admin_login_allowed(text, text);
drop function if exists public.admin_login_record_failure(text, text);
drop function if exists dars_private.admin_login_hashes(text, text);
drop table if exists dars_private.admin_login_attempts;
