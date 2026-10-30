# Fresh-clone verification — 2026-10-30

## What this verifies

GitHub Actions checks out the repository into clean `ubuntu-latest` runners and runs the repository's documented setup against throwaway local Supabase stacks. The jobs use public source, pinned workflow actions, and local synthetic data; they do not need maintainer credentials, a linked hosted Supabase project, or the maintainer's workspace scripts. The `verify` job records the runner OS release and Node/npm versions. The `database` and `browser-e2e` jobs also report Docker, `psql`, and Supabase CLI versions; the browser job reports Playwright. These values are available in the corresponding CI logs and should be copied from a passing run when recording the exact runner image versions, since `ubuntu-latest` can move over time.

The database job runs `supabase start`, `supabase test db`, and `tests/database/run.sh`, then loads the optional synthetic demo and runs `tests/integration/demo.mjs`. That smoke test authenticates the local teacher, student, and administrator accounts, checks their profile roles and active status, verifies teacher/student access to the published demo group, lesson, and resource, and confirms anonymous users cannot read the private resource. The browser job starts a fresh local Supabase stack, seeds isolated E2E accounts, and runs `npm run e2e` across the existing English/Arabic desktop/mobile Playwright projects. The new timetable scenario follows the student's visible next-week and day navigation to the seeded future lesson and checks its private notes and resource on the lesson page.

The earlier fresh-clone validation record reports a successful build and API smoke checks, plus 20 authenticated/discovery browser screenshots; see [the release plan](../superpowers/plans/2026-10-23-first-public-release.md). Those screenshots are prior evidence, not a result for the new timetable test. The timetable scenario remains pending until the current CI run passes. Do not mark issue #76 complete until all current required CI jobs pass and the OS/tool versions are recorded from those logs.

## Reproduce locally

Follow [Development](../DEVELOPMENT.md) from a fresh clone, including its Node.js 24, Docker, `psql`, and Supabase CLI requirements. The concise checks used by CI are:

```sh
npm ci --no-audit --no-fund
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run typecheck:admin
npm run build:admin
npm run boundaries -- --require-manifests

supabase start
supabase test db
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres ./tests/database/run.sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres --no-psqlrc --set ON_ERROR_STOP=1 --file supabase/demo.sql
node tests/integration/demo.mjs
npx playwright install --with-deps chromium
supabase db reset --local
```

Use only a disposable local stack. The demo loader is intentionally one-shot; reset the database before browser E2E (or run E2E in a separate fresh clone/workdir). In a second terminal, from the same E2E workdir, run and leave open:

```sh
supabase functions serve
```

Then run the browser workflow in the first terminal and stop the stack when it finishes:

```sh
npm run e2e
supabase stop --no-backup
```

The local `delete-account` function is needed by the account-deletion browser flow. Serving it locally does not configure SMTP or contact an external email provider. Browser E2E seeds its own fixtures. `npm run e2e` runs a production build and the real application against local Auth/PostgREST and the seeded database, rather than mocks.

## Limits

This is reproducible clean-runner evidence for the repository's local setup. It is not evidence of an outside human deployment, a hosted production recovery, or availability of an externally managed Supabase project. Google OAuth and other external identity/provider integrations, SMTP delivery, and hosted secrets are not exercised. Manual accessibility review remains outside this verification, and automated browser coverage is not a substitute for it.
