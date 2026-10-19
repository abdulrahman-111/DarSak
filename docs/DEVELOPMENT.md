# Development

## Requirements

Use Node.js 22 and npm. Docker is required for a fresh local Supabase stack. The app uses the configured Supabase project for authentication, database, and storage access. Follow the workspace's existing managed-service startup process; do not reset, recreate, or restart that environment as part of routine development.

For a fresh local backend, follow the [Supabase CLI local development guide](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Local setup

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the values for your development environment. `NEXT_PUBLIC_SITE_URL` should be `http://localhost:3000` locally. Open `http://localhost:3000`.

The first six variables in `.env.example` cover the browser-facing Supabase connection, canonical app URL, optional Turnstile site key, Google sign-in toggle, and recovery-proof secret. Optional server-only values are documented in [Deployment](DEPLOYMENT.md). Never put a service-role key or other server secret in a `NEXT_PUBLIC_*` variable.

## Useful commands

- `npm run dev` — start the development server.
- `npm run lint` — run ESLint.
- `npm run typecheck` — check TypeScript types.
- `npm test` — run unit tests.
- `npm run build` — create a production build.
- `npm run start` — serve a built app locally.

The API integration script at `tests/integration/api.mjs` requires a local Supabase API and local API keys, and refuses non-local hosts. Run it only against an isolated test project:

```sh
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY='replace-with-local-anon-key' SUPABASE_SERVICE_ROLE_KEY='replace-with-local-service-role-key' node tests/integration/api.mjs
```

That fixture expects email confirmation to be disabled locally so it can sign up test accounts. The application itself requires signup confirmation enabled; never change production confirmation settings to satisfy the fixture.

Database fixtures in `tests/database/` also modify data and should run only on a disposable test database with the current migrations applied:

```sh
SUPABASE_DB_URL='replace-with-disposable-local-postgres-url' ./tests/database/run.sh
```

## Database changes

Migrations in `supabase/migrations/` are ordered and form the database change history. Review the migration sequence and its data impact before applying changes to a shared or production project. Use a disposable local database for reset-based testing; never run a database reset against the configured managed project. See [Deployment](DEPLOYMENT.md) for release guidance.
