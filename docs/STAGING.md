# Staging environment

The Meet freepilot staging deployment uses its own Vercel project and the Supabase project `dmbepdjwjmuelqcfzjae`. Set `APP_ENV=staging` explicitly in the staging Vercel project's Production environment; Vercel calls that target “Production” because it is the production deployment of the separate staging project. The application uses `APP_ENV`, not `VERCEL_ENV`, to decide whether staging safeguards apply.

Configure these values only in the staging Vercel project:

- `APP_ENV=staging`
- `NEXT_PUBLIC_APP_ENV=staging` (public browser-bundle safety hint; keep it aligned with `APP_ENV`)
- `SUPABASE_EXPECTED_PROJECT_REF=dmbepdjwjmuelqcfzjae`
- `NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF=dmbepdjwjmuelqcfzjae`
- `NEXT_PUBLIC_SUPABASE_URL` for that same project and its staging publishable key
- `NEXT_PUBLIC_SITE_URL` set to the staging site origin

The server checks `APP_ENV`, the expected project ref, and the HTTPS Supabase URL before creating shared or privileged Supabase clients. The browser uses only the public marker and project-ref hint to fail closed if its bundled Supabase URL points elsewhere. Never set the live project ref (`ubrvjjibibqaiomrvwbd`) in this Vercel project. Keep staging auth, database, storage, OAuth, and mail settings separate from production.

Do not provision `CRON_SECRET`, `GMAIL_APP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, or `ACCOUNT_DELETION_WORKER_SECRET` for the freepilot. The email and account-deletion cron routes return a disabled response without calling their workers in staging. If a cron secret is later provisioned, the routes continue to require its valid bearer token before returning disabled.

Use dedicated synthetic test accounts with non-production email addresses. Give them no production credentials, reused passwords, real student records, or real payment details. Create separate staging administrator, teacher, and student accounts, and remove or reset them after each pilot cycle. Do not copy production user rows, auth users, storage objects, or secrets into staging.

Any future Google integration must check `APP_ENV=staging` and the expected staging Supabase project before reading Google credentials or handling OAuth callbacks. Use a separate Google OAuth client and a test-mode consent screen with only named staging test accounts. Record the test-mode expiry date when enabling it and review it before each pilot; do not use the production OAuth client or its credentials in staging.

## Production release gate

Before any future merge to `main`, configure and verify the main Vercel Production environment explicitly:

- `APP_ENV=production`
- `NEXT_PUBLIC_APP_ENV=production`
- `VERCEL_ENV=production` from Vercel's Production deployment target
- `SUPABASE_EXPECTED_PROJECT_REF=ubrvjjibibqaiomrvwbd`
- `NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF=ubrvjjibibqaiomrvwbd`
- `NEXT_PUBLIC_SUPABASE_URL=https://ubrvjjibibqaiomrvwbd.supabase.co` and its matching live publishable key
- `NEXT_PUBLIC_SITE_URL=https://darsak-platform.vercel.app`

Verify the production ref and canonical site URL against the main Vercel project's current settings before merging. This PR targets the separate staging project. The live Vercel project's existing variables are not changed by this work; its current application behavior with `APP_ENV` unset remains unchanged.

## Activate the real Google pilot after code validation

Keep `GOOGLE_MEET_ENABLED=false` until the reviewed schema is installed. The pilot can then enable manual lesson links without Google credentials; automatic creation and the Connect button remain disabled until every OAuth setting is present.

Use a separate Google Cloud project (for example, `darsak-staging`), not the project used for production Google sign-in. This keeps test-mode consent/scopes from changing the live login configuration. No billing account or paid quota upgrade is required for the pilot.

1. Enable Google Calendar API in that staging Cloud project. Configure an external OAuth consent screen in Testing, with the actual teacher Google accounts listed as test users.
2. Create a Web application OAuth client with this exact authorized redirect URI: `https://darsak-platform-staging.vercel.app/api/integrations/google/callback`. Request only `openid`, `email`, and `https://www.googleapis.com/auth/calendar.events.owned`.
3. Enter the client ID and client secret directly in the **darsak-staging** Vercel project's server environment as `GOOGLE_MEET_CLIENT_ID` and `GOOGLE_MEET_CLIENT_SECRET`. Do not paste secrets into chat, commit them, or reuse production credentials. `GOOGLE_MEET_REDIRECT_URI` must match the registered URI exactly; the staging-only AES encryption key is provisioned separately.
4. Configure the staging Supabase Auth site URL as `https://darsak-platform-staging.vercel.app` and allow that origin's auth callbacks. Use dedicated confirmed test accounts; keep public Google sign-in disabled and do not provision a real email delivery worker for the pilot.
5. Redeploy staging and verify real consent, a new meeting, accepted-student access, rescheduling, cancellation, retry, and disconnect. Check a personal Google account's actual conference capability before advertising it as supported.

External OAuth Testing refresh tokens generally expire after seven days. Reconnection can therefore be necessary during the pilot. Provider tests using mocks do not prove real Google consent or account capability.
