# Deployment

The application and database deploy separately. Vercel hosts the Next.js app and scheduled API routes. Supabase provides Auth, Postgres, Storage, and the account-deletion Edge Function.

The administrator portal is a separate production-only Vercel application sharing the live Supabase project. Its canonical URL, production environment allowlist, authentication boundary, and operational notes are documented in the [administrator portal guide](../apps/admin/README.md). The portal does not have a staging or preview deployment, and deploying it requires no schema change. Keep Meet and AI pilots on staging; do not promote the whole staging branch to production.

## Deploy to your own Supabase project

Use a new project you control; no access to DarSak's existing backend is needed. The steps below target an empty project. For an existing deployment, back up first, review pending migrations, and use an upgrade plan instead.

1. Create your Supabase project and record its project reference, database password, project URL, publishable key, and operator service-role key privately.
2. From a clean clone with the Supabase CLI installed, authenticate and link explicitly to that project:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --dry-run
   supabase db push
   ```

   Review the dry run and verify the linked project before applying migrations. Never run a remote reset. The migrations create the application schema, authorization rules, and storage setup.

3. Review and run `supabase/seed.sql` in your project's SQL editor to install the starter education catalogue. It contains reference data only. Do not run `supabase/demo.sql` on a hosted project: it installs known public login credentials.
4. Configure Auth site URL, redirects, email confirmation, custom SMTP, and the numeric-code confirmation template from `supabase/templates/confirmation.html` as described below. CLI local config does not automatically configure the hosted project's Auth provider settings.
5. Deploy the account-deletion function to the same project:

   ```sh
   supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF
   ```

   The checked-in `verify_jwt = false` setting applies; the handler performs its own user verification. Confirm the deployment targets your project and preserves that setting.

6. Configure a Next.js host with Node.js 24, install with `npm ci`, build with `npm run build`, and start with `npm run start` if using a Node server. On Vercel, import your fork and set the environment variables below for each deployment environment. Browser-facing Supabase variables are build-time values, so rebuild after changing them.
7. Register and confirm your own administrator account, bootstrap its UUID as described below, and approve a test teacher. Verify student signup, teacher publication, enrollment, timetable, resource permissions, and both languages with synthetic accounts before inviting users.

Vercel supplies the schedules in `vercel.json`. Another Next.js host needs its own scheduler for those API routes and equivalent secret headers. The notification-email worker currently has maintainer-specific mailbox configuration in `src/features/email/worker.ts` and `supabase/migrations/20261014181400_transactional_email_outbox.sql`. Leave `GMAIL_APP_PASSWORD` unset on an independent deployment until both sender and administrator notification routing have been adapted and tested. Supabase Auth confirmation/recovery email uses your own SMTP and is independent of that optional worker.

This documents an independently owned hosted Supabase backend. Running Supabase itself on your own production infrastructure needs a separate operational guide; the local CLI stack is for development only.

## Application environment

Set the following values in the Vercel project as appropriate for each environment:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the Supabase project URL and publishable key.
- `NEXT_PUBLIC_SITE_URL` — the canonical HTTPS application origin in production.
- `AUTH_RECOVERY_SECRET` — a random secret of at least 32 bytes, used to sign short-lived password-recovery proof.
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` — keep `false` until Supabase Google OAuth and the callback URLs are configured and verified; then enable for the student and teacher entry flow.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — optional, when Turnstile is configured on both sides.
- `SUPABASE_SERVICE_ROLE_KEY` — private server-side key used for privileged app operations. Never expose it to browser code.
- `CRON_SECRET` — shared secret required by both scheduled API routes.
- `GMAIL_APP_PASSWORD` — Gmail app password for the app-notification outbox. This worker runs only in production and only when all required mail configuration is present. Independent operators must first replace and test its maintainer-specific sender and administrator recipient routing; otherwise leave this unset. It is separate from Supabase Auth SMTP.
- `ACCOUNT_DELETION_WORKER_SECRET` — secret sent by the Vercel deletion worker. Provision its hash through the private database worker configuration described by the migration and private function source.

Application confirmation and recovery emails are sent by Supabase Auth using its SMTP configuration. Keep email confirmation enabled and use the custom Auth SMTP provider and confirmation template. The integration fixtures under `tests/integration/` require a separate local Supabase instance with confirmation disabled; that local test setting does not apply to production.

## Supabase configuration

Set the production Auth site URL to the production app origin and add the matching allowed redirect origin with the `/**` path pattern so callback paths and their query strings are accepted. Keep signup confirmation enabled and use the numeric-code confirmation template. Configure Supabase Auth's custom SMTP for confirmation and recovery delivery; it is separate from the Gmail app-notification worker.

For Google sign-in, configure Google OAuth credentials and Supabase's callback URL in the Google provider, allow the app's callback origin, test both student and teacher entry flows, then turn on the app flag. A password change from account security requires the current password; enable Supabase Auth "Secure password change" (Authentication > Providers > Email) so Supabase verifies `current_password` itself, which also works with captcha enabled.

Deploy reviewed database migrations in order using the project's established Supabase release process. Review each migration and any data impact before deployment. Do not reset or recreate the production database. A database backup does not include Storage objects or Supabase Auth provider settings; back up or document those separately.

Deploy the `delete-account` Edge Function after its matching database migrations. Its `verify_jwt = false` gateway setting is intentional: the handler validates user JWTs and checks each user with Supabase Auth, while destructive requests require password reauthentication or a fresh Google proof. The worker call instead requires the secret key header. The SHA-256 hash of Vercel's `ACCOUNT_DELETION_WORKER_SECRET` must match `dars_private.account_deletion_worker_config.key_hash`; configuring the Vercel variable alone is insufficient.

To enable queued account-deletion processing, generate a separate random `ACCOUNT_DELETION_WORKER_SECRET`, store it in the application host, and calculate its SHA-256 hex digest locally. As a database operator, set only that digest in your own project:

```sql
update dars_private.account_deletion_worker_config
set key_hash = 'REPLACE_WITH_64_CHARACTER_SHA256_HEX_DIGEST', updated_at = now()
where singleton;
```

The digest must be exactly 64 lowercase hexadecimal characters. Use the raw secret only in the host's server-side environment and the worker's private request header; do not place it in browser configuration. Test the worker against synthetic accounts on your own staging deployment before enabling production scheduling.

To bootstrap an administrator, first register the account, verify its UUID and the target Supabase project, then run `scripts/bootstrap-admin.mjs` once with a process-scoped service-role key:

```sh
SUPABASE_URL='replace-with-target-project-url' SUPABASE_SERVICE_ROLE_KEY='replace-with-operator-key' node scripts/bootstrap-admin.mjs 'registered-user-uuid'
```

The script promotes exactly one existing profile; sign out and back in to refresh the app role. Do not save the service-role key in the repository or shared app environment for this one-off operation.

## Regions and caching

Every server render makes several round trips to Supabase (Auth, `profiles`, page data), so the Vercel function region must sit next to the database.

| Environment | Supabase project | Supabase region       | Vercel function region |
| ----------- | ---------------- | --------------------- | ---------------------- |
| Production  | `Dars`           | `eu-west-1` (Ireland) | `dub1` (Dublin)        |
| Staging     | staging project  | `eu-west-1` (Ireland) | `dub1` (Dublin)        |

`vercel.json` pins `"regions": ["dub1"]`. Dublin is the Vercel region that matches AWS `eu-west-1`, so no change is needed. If a project is ever moved to another Supabase region, change `regions` in `vercel.json` to the matching Vercel region in the same release (for example `fra1` for `eu-central-1`) and update this table.

Caching model:

- `help`, `privacy`, `terms` and `pricing` are prerendered for both locales and revalidated hourly, so anonymous visitors get `Cache-Control: s-maxage=3600, stale-while-revalidate`. Requests that carry a Supabase session cookie are answered `private, no-store` by `src/proxy.ts`.
- The layout never reads cookies. The header and the SanDak companion fetch a display-only snapshot from `/api/viewer` (always `private, no-store`) after the shell is delivered. Visitors without a `sb-` session cookie make no request. Authorization still happens on the server in every page and action.
- Visitor-independent discovery reads (`public_discovery_catalogue`, `public_teachers`, the unfiltered `public_teacher_choices` and first `discover_groups` page) are shared through the Next.js data cache for 60 seconds under the `public-discovery` tag with an anonymous Supabase client. Teacher publish, group, profile and catalogue actions expire that tag. Never route per-user data through `src/features/platform/data.ts` `cachePublic`.
- Keep the project on asymmetric JWT signing keys so `getClaims()` in `src/proxy.ts` verifies tokens locally instead of calling Supabase Auth on every request.

## Scheduled jobs

`vercel.json` schedules `/api/email/cron` daily at 06:00 UTC and `/api/account-deletions/cron` daily at 06:30 UTC. Configure `CRON_SECRET` in Vercel. The account-deletion route also requires `ACCOUNT_DELETION_WORKER_SECRET`; the email worker additionally requires `GMAIL_APP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, the Supabase URL, and an HTTPS `NEXT_PUBLIC_SITE_URL`. Without complete email configuration, app notification delivery stays disabled, queued messages remain in the outbox, and the production cron route answers `503` with `state: "not_configured"` so the missing configuration shows up as a failing cron run instead of a silent success. Each run claims jobs one at a time, up to 50, until the outbox is empty or the worker's 38-second time budget is spent.

## Release checks

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before release. The GitHub Actions workflow in `.github/workflows/ci.yml` runs these same checks on every push to `main` and every pull request, and can be started manually from the Actions tab. Its `Database tests` job starts a disposable local Supabase stack on the runner, applies every migration from scratch, and runs `supabase test db` plus `tests/database/run.sh`; it never connects to the hosted project. To make sure only checked code reaches the Vercel production deployment, protect `main` with a repository ruleset: require a pull request, require the `Lint, typecheck, test & build` and `Database tests` checks to pass with the branch up to date, and block force pushes and deletion. GitHub enforces rulesets on private repositories only on paid plans (GitHub Pro is included in the GitHub Student Developer Pack); until then these checks are advisory, so do not merge a pull request whose checks have not passed. Review the Vercel build and function logs, Supabase Auth delivery settings, migration results, and scheduled job responses after deployment.
