# Deployment

The application and database deploy separately. Vercel hosts the Next.js app and scheduled API routes. Supabase provides Auth, Postgres, Storage, and the account-deletion Edge Function.

## Application environment

Set the following values in the Vercel project as appropriate for each environment:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the Supabase project URL and publishable key.
- `NEXT_PUBLIC_SITE_URL` — the canonical HTTPS application origin in production.
- `AUTH_RECOVERY_SECRET` — a random secret of at least 32 bytes, used to sign short-lived password-recovery proof.
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` — keep `false` until Supabase Google OAuth and the callback URLs are configured and verified; then enable for the student and teacher entry flow.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — optional, when Turnstile is configured on both sides.
- `SUPABASE_SERVICE_ROLE_KEY` — private server-side key used for privileged app operations. Never expose it to browser code.
- `CRON_SECRET` — shared secret required by both scheduled API routes.
- `GMAIL_APP_PASSWORD` — Gmail app password for the app-notification outbox. This worker runs only in production and only when all required mail configuration is present. It is separate from Supabase Auth SMTP.
- `ACCOUNT_DELETION_WORKER_SECRET` — secret sent by the Vercel deletion worker. Provision its hash through the private database worker configuration described by the migration and private function source.

Application confirmation and recovery emails are sent by Supabase Auth using its SMTP configuration. Keep email confirmation enabled and use the custom Auth SMTP provider and confirmation template. The integration fixtures under `tests/integration/` require a separate local Supabase instance with confirmation disabled; that local test setting does not apply to production.

## Supabase configuration

Set the production Auth site URL to the production app origin and add the matching allowed redirect origin with the `/**` path pattern so callback paths and their query strings are accepted. Keep signup confirmation enabled and use the numeric-code confirmation template. Configure Supabase Auth's custom SMTP for confirmation and recovery delivery; it is separate from the Gmail app-notification worker.

For Google sign-in, configure Google OAuth credentials and Supabase's callback URL in the Google provider, allow the app's callback origin, test both student and teacher entry flows, then turn on the app flag. A password change from account security requires the current password.

Deploy reviewed database migrations in order using the project's established Supabase release process. Review each migration and any data impact before deployment. Do not reset or recreate the production database. A database backup does not include Storage objects or Supabase Auth provider settings; back up or document those separately.

Deploy the `delete-account` Edge Function after its matching database migrations. Its `verify_jwt = false` gateway setting is intentional: the handler validates user JWTs and checks each user with Supabase Auth, while destructive requests require password reauthentication or a fresh Google proof. The worker call instead requires the secret key header. The SHA-256 hash of Vercel's `ACCOUNT_DELETION_WORKER_SECRET` must match `dars_private.account_deletion_worker_config.key_hash`; configuring the Vercel variable alone is insufficient.

To bootstrap an administrator, first register the account, verify its UUID and the target Supabase project, then run `scripts/bootstrap-admin.mjs` once with a process-scoped service-role key:

```sh
SUPABASE_URL='replace-with-target-project-url' SUPABASE_SERVICE_ROLE_KEY='replace-with-operator-key' node scripts/bootstrap-admin.mjs 'registered-user-uuid'
```

The script promotes exactly one existing profile; sign out and back in to refresh the app role. Do not save the service-role key in the repository or shared app environment for this one-off operation.

## Scheduled jobs

`vercel.json` schedules `/api/email/cron` daily at 06:00 UTC and `/api/account-deletions/cron` daily at 06:30 UTC. Configure `CRON_SECRET` in Vercel. The account-deletion route also requires `ACCOUNT_DELETION_WORKER_SECRET`; the email worker additionally requires `GMAIL_APP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, the Supabase URL, and an HTTPS `NEXT_PUBLIC_SITE_URL`. Without complete email configuration, app notification delivery stays disabled and queued messages remain in the outbox.

## Release checks

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before release. The GitHub Actions workflow in `.github/workflows/ci.yml` runs these same checks on every push to `main` and every pull request, and can be started manually from the Actions tab. Its `Database tests` job starts a disposable local Supabase stack on the runner, applies every migration from scratch, and runs `supabase test db` plus `tests/database/run.sh`; it never connects to the hosted project. A repository ruleset on `main` requires both CI checks to pass on a pull request before merging, and blocks direct pushes, force pushes, and branch deletion, so only checked code reaches the Vercel production deployment. Review the Vercel build and function logs, Supabase Auth delivery settings, migration results, and scheduled job responses after deployment.
