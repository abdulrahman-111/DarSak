# DarSak administrator portal

The administrator portal is a separate Next.js application that shares the live Supabase database used by the main DarSak site. Its canonical production URL is <https://darsak-admin-portal.vercel.app>. It has a separate Vercel project and deployment lifecycle; it does not have an admin staging deployment.

## Local development

Use Node.js 24 and the repository's npm install. Start the local Supabase stack from the repository root, then configure this app with the local-only example:

```sh
supabase start
cp apps/admin/.env.local.example apps/admin/.env.local
npm run dev --workspace @darsak/admin
```

The example targets local Supabase at `http://127.0.0.1:54321` (project ref `local`) and the main site at `http://localhost:3000`. Set its public publishable key from `supabase status`. Local configuration uses `APP_ENV=local` and `NEXT_PUBLIC_APP_ENV=local`; it does not set `VERCEL_ENV`. The production `.env.example` is for reference when configuring hosting and its publishable-key value is intentionally blank.

At the repository root, `npm run build:admin` builds this app, `npm run typecheck:admin` checks its types, and `npm run boundaries` checks source import boundaries.

## Production deployment

Create a dedicated Vercel project for the admin app with Root Directory `apps/admin`, include files outside the root directory enabled, and Node.js 24. Require Vercel SSO for all deployments and disable preview deployments. Deploy production only from the designated production branch. Do not create an admin staging or preview target.

Set production-only Vercel environment variables using [`apps/admin/.env.example`](.env.example). Enable them only for the Production environment:

- `ADMIN_APP=true`
- `APP_ENV=production` and `NEXT_PUBLIC_APP_ENV=production`
- `SUPABASE_EXPECTED_PROJECT_REF=ubrvjjibibqaiomrvwbd` and `NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF=ubrvjjibibqaiomrvwbd`
- `NEXT_PUBLIC_SUPABASE_URL=https://ubrvjjibibqaiomrvwbd.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to that project's publishable key
- `NEXT_PUBLIC_SITE_URL=https://darsak-admin-portal.vercel.app`

`APP_ENV` and `NEXT_PUBLIC_APP_ENV` must agree. The server and browser configuration also verify the expected project ref and production Vercel target. Do not add staging, preview, or development values to the production Vercel project. Apply migration `20261028153000_admin_login_attempts.sql` (login throttle) before deploying the version that calls it; if the functions are missing the portal fails open on the throttle only, and the TOTP requirement below still applies.

After Vercel SSO, administrators sign in separately with their existing live admin account credentials. The portal does not use Google sign-in or provide a self-service recovery flow. If an administrator loses access, an operator must reset the account through the established Supabase operator process; do not hand off password-reset tokens.

## Two-step verification (TOTP) and login throttling

Administrator access requires a TOTP authenticator code (Supabase MFA, assurance level `aal2`). A password alone never opens `/admin/*`, and server actions refuse sessions that are not `aal2`.

Enable TOTP in the Supabase project first (Authentication, Multi-factor, TOTP: enroll and verify enabled; it is on by default for hosted projects).

First sign-in after MFA is deployed:

1. Sign in with email and password.
2. The portal redirects to `/{locale}/mfa/enroll`. Scan the QR code (or type the secret) into an authenticator app.
3. Enter the 6-digit code. The session becomes `aal2` and the portal opens.

Later sign-ins: password, then `/{locale}/mfa/verify` asks for the current 6-digit code. Enrol the real administrator promptly after promoting an account with `scripts/bootstrap-admin.mjs`: until a factor is verified, whoever holds the password can enrol their own.

Recovery if the device is lost: an operator removes the factor in the Supabase dashboard (Authentication, Users, select the user, Remove factor / Unenroll MFA factor), or deletes the row in `auth.mfa_factors` for that user. The next sign-in then shows the enrolment screen again. Revoke the user's sessions at the same time if the loss may mean compromise.

Login throttle: before checking a password the portal calls the anon-callable `admin_login_allowed(email, ip)` function; failed passwords are recorded with `admin_login_record_failure`. Email and IP are stored only as SHA-256 hashes in `dars_private.admin_login_attempts`. At most 5 failures per email and 20 per IP are allowed per 15 minutes; blocked and wrong-password attempts show the same message. The IP comes from the proxy headers. Because the functions are callable with the public key, a determined attacker can also lock a known admin email out for 15 minutes; this equals what failed guesses would do and the lock expires on its own.

The portal has its own host-only `darsak-admin-${ref}-auth` cookie and dedicated `@admin` source alias. The cookie is scoped to the admin host and remains separate from the main site's session. Vercel SSO is an outer deployment access gate; it does not replace the portal's live administrator authentication and role check.

The app can retry queued notification email jobs, but delivery remains the responsibility of the existing worker. Do not configure `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_APP_PASSWORD`, SMTP credentials, `GEMINI_API_KEY`, or worker secrets in the admin project. Workers already process queued email; retries may result in duplicate sends when an earlier delivery result was ambiguous.

This portal shares a backend with the public site. A stolen administrator JWT remains a risk to that shared live backend even though the admin cookie is host-only. Keep Vercel SSO enabled and restrict access to the production admin host. Do not promote the whole staging branch to production: Meet and AI pilots remain on staging.
