# Development

## Requirements

- Node.js 24 and npm (matching CI and `package.json`).
- Git and a Docker-compatible runtime for a local Supabase backend. Allocate the resources recommended by the [Supabase local development guide](https://supabase.com/docs/guides/local-development/cli/getting-started).
- Supabase CLI 2.120.0 or later for the commands below. Install it using the official guide and check `supabase --version`. CI pins the database test stack to Supabase CLI 2.120.0.
- PostgreSQL's `psql` client for the optional demo and database fixture shell script.

The default path uses a backend on your own machine. No maintainer credentials, linked project, Supabase account, or existing workspace startup scripts are required. If your workspace already has a managed backend, leave it running; use a separate clone, a unique `project_id`, and free ports in `supabase/config.toml` for disposable verification.

## Start from a fresh clone

```sh
git clone https://github.com/abdulrahman-111/DarSak.git
cd DarSak
npm ci
supabase start
supabase status
cp .env.example .env.local
```

`supabase start` creates a local stack, applies `supabase/migrations/` in order, and loads the starter education catalogue from `supabase/seed.sql`. The first start downloads Docker images and may take several minutes. If default ports 54320–54326 are occupied, change the corresponding ports and `project_id` in your disposable clone's config before starting it. Do not run `supabase init`; the repository already has its configuration and migration history.

Use the URL and public key shown by `supabase status` to edit `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-local-publishable-or-legacy-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
AUTH_RECOVERY_SECRET=replace-with-a-random-secret
```

Generate the recovery secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Copy the output into `.env.local`. This file is ignored by Git. The Supabase public/publishable key (or local legacy `anon` key) goes in the public variable; the service-role key never does. Leave Turnstile and optional worker secrets blank for this basic local walkthrough.

```sh
npm run dev
```

Open [English](http://localhost:3000/en) or [Arabic](http://localhost:3000/ar). Restart Next.js after changing environment variables.

## Accounts and local email

Email confirmation stays enabled. Register a student or teacher, then open the local email inbox shown by `supabase status` (normally [http://127.0.0.1:54324](http://127.0.0.1:54324)) and enter the code from the confirmation email. Teacher accounts require administrator approval before publishing groups.

For an administrator on your own backend, register an account, obtain its UUID from local Studio's Auth users view, and use the bootstrap tool:

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY='replace-with-local-service-role-key' node scripts/bootstrap-admin.mjs 'registered-user-uuid'
```

Sign in to the admin portal and complete the TOTP enrolment at `/<locale>/mfa/enroll` straight away (see `apps/admin/README.md`), then use the administrator interface to review teacher applications. This bootstrap promotes only the specified existing profile.

## Optional synthetic demo

On a fresh, disposable local stack, run:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres --no-psqlrc --set ON_ERROR_STOP=1 --file supabase/demo.sql
node tests/integration/demo.mjs
```

This opt-in transaction creates three confirmed synthetic accounts, an approved synthetic legacy teacher, a published mathematics group, an accepted student enrollment, a lesson tomorrow at 16:00 Cairo time, and a resource link. It leaves ordinary signup confirmation enabled. All three accounts use the public password `DarSak-local-demo-2026!`:

| Role          | Email                  |
| ------------- | ---------------------- |
| Teacher       | `teacher@demo.invalid` |
| Student       | `student@demo.invalid` |
| Administrator | `admin@demo.invalid`   |

Sign in through the app, visit the teacher group and student timetable, open the resource link, and switch languages. Use separate browser profiles for simultaneous roles. These accounts are for local exploration and screenshots only; never load them on a hosted instance or expose this stack publicly. The seed is intentionally one-shot: a repeated run fails atomically rather than overwriting edited accounts. To rebuild only your disposable stack, run `supabase db reset --local`, then load the demo again. A reset erases its existing local data.

## Browser workflows

Browser workflows use Playwright against a production build and a dedicated local Supabase project. Node 24, Docker, PostgreSQL's `psql` client, and Supabase CLI 2.120.0 are required. Start a fresh local stack in a separate clone or isolated Supabase workdir; do not point the harness at a shared or hosted database. The seed is one-shot per database and creates synthetic accounts and records for four isolated browser projects.

```sh
npm ci
npx playwright install chromium
supabase start
E2E_SUPABASE_WORKDIR=/path/to/isolated/DarSak npm run e2e
```

`E2E_SUPABASE_WORKDIR` defaults to the current directory. `E2E_PORT` defaults to `3000`; set it when another local app uses that port. The runner reads the local API URL, anon key, and database URL from `supabase status --output json`, and refuses to seed unless the app, API, and database URLs use loopback hosts. It builds Next.js with temporary process environment values, starts the production server for Playwright, and does not write `.env.local` or upload authentication state. The E2E-specific storage states and results stay under the ignored `.playwright/` directory. For a locally installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.

Use a fresh isolated database for each run. Resetting a database erases its data; only run `supabase db reset --local` from the dedicated disposable E2E workdir. Google sign-in is disabled for the run, and all test accounts are inserted directly into the local database, so the seed does not send email.

## Verify changes

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
supabase test db
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres ./tests/database/run.sh
```

Use the ports for your own stack. Database fixtures mutate data inside test transactions; run them only on a disposable database. CI starts its own fresh stack, runs the pgTAP contracts and fixture script, then loads the optional demo and verifies all three logins and lesson-material access.

The broader API integration script in `tests/integration/api.mjs` refuses non-local hosts and requires its own isolated backend with email confirmation disabled. Its configuration differs from the app walkthrough above; do not change the app or production confirmation settings to satisfy that fixture. It also expects a `psql` client and current migrations. Read its fixture setup before use.

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY='replace-with-local-anon-key' SUPABASE_SERVICE_ROLE_KEY='replace-with-local-service-role-key' node tests/integration/api.mjs
```

## Database changes and troubleshooting

Create new migrations with `supabase migration new descriptive_name`. Verify the full sequence with `supabase db reset --local` only on a disposable stack. Never reset a managed, shared, or production project. Apply reviewed changes to an independently owned hosted project using [Deployment](DEPLOYMENT.md).

To upgrade the Supabase CLI used by CI, review the [CLI release notes](https://github.com/supabase/cli/releases), update the `version` in the `Set up Supabase CLI` step of `.github/workflows/ci.yml`, then run and review the full `Database tests` job. Dependabot updates the pinned `supabase/setup-cli` action SHA, but it does not update the CLI version configured by that step, so CLI upgrades need explicit manual review.

- **Docker cannot start:** check the Docker runtime and available resources; inspect the exact CLI error before restarting services.
- **Ports in use:** stop only your own disposable stack or use separate ports and `project_id` in a separate clone.
- **Empty discovery list:** the base seed contains catalogue entries only. Publish a group through an approved teacher or load the optional demo on a fresh local stack.
- **Confirmation email absent:** use the local inbox, check the Auth container logs, and confirm the app URL/key target that stack.
- **Login or resource access fails:** verify the public key, URL, migrations, confirmation state, and current role. A service-role key is not a browser workaround.

Stop your own local stack with `supabase stop` when finished; this normally retains its data. See [Architecture](ARCHITECTURE.md) for code organization and [Contributing](../CONTRIBUTING.md) for review expectations.

## Runtime diagnostics

Categorical `server_read` and `server_request_error` warnings appear in Vercel runtime logs. Failed critical reads or reads taking at least two seconds emit warnings; request errors include only route type. They omit request and record details. These server timings do not measure browser metrics such as LCP, and there are no database-backed diagnostic counters or browser real-user monitoring. Hosting log retention depends on your plan.
