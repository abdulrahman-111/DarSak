# Account deletion and site polish

## Behavior

Signed-in users can open Account from desktop or mobile navigation. Permanent
deletion requires the warning acknowledgement, the exact word `DELETE`, and
password verification or a fresh Google verification followed by confirmation.
The Google callback never deletes an account. The presentation cookie is only a
UI hint; Edge and private database intent state authorize the final operation.

Teacher deletion removes owned groups, lessons, materials and associated student
access. Student deletion preserves teachers' content. A last active administrator
cannot delete, suspend or demote themselves. Uploads attached to another
teacher's retained group must be transferred or removed before deletion.
Limited immutable administrative history may remain; already delivered email
cannot be recalled.

The `delete-account` Edge function verifies user tokens itself. Service-only RPCs
prepare a durable request and remove domain authorization before Storage API
cleanup and hard Auth deletion. Failed cleanup stays pending and can retry from
the account screen or the daily recovery cron. The worker can process existing
requests only; it cannot initiate a deletion or choose a user target.

## Deployment

Apply `20261016190803_account_deletion_queue_and_admin_guard.sql`, deploy the
`delete-account` function with gateway JWT verification disabled (the handler
authenticates every operation), configure a random scoped worker key as sensitive
production `ACCOUNT_DELETION_WORKER_SECRET`, and store only its SHA-256 digest in
`dars_private.account_deletion_worker_config`. The function uses built-in Supabase
credentials; no service-role credential is added to Vercel. The Next cron uses
existing `CRON_SECRET` and forwards only the scoped worker request.

## Assets and performance

All 21 supplied SVG files were inspected. Header lockups, favicon, landing
features, subject categories, timetable confirmation and group metadata use the
matching artwork. `find-a-group.svg` and `organize-your-classes.svg` remain
available as alternate illustrations. SVG images reserve dimensions. Landing
entrance and card feedback use CSS, require no new client library, and turn off
under reduced-motion preferences.

Independent group announcement/enrollment/saved reads and teacher calendar
catalogue/lesson reads run concurrently after their authorization prerequisites.
Pagination and existing error behavior are preserved. Local timings are evidence
for local test conditions, not production capacity or concurrent-load guarantees.

## Verification

Validation results and limitations are recorded in the release pull request.
Destructive checks use local disposable users only. A real Google-provider
verification and production inbox delivery are separate from local signed-token,
callback, database and browser tests and must not be implied by those tests.

### Recorded validation

- 442 unit tests across 72 files passed.
- 41 SQL suites passed, with focused follow-up SQL checks for the final cleanup changes.
- 173 local API assertions and 21 actual local Edge HTTP deletion checks passed.
- The last-admin guard passed a two-transaction READ COMMITTED race in a disposable database.
- Independent GPT-6.1 Sol security review approved the final changes.
- Independent Sol browser checks passed representative EN desktop and AR mobile group editing, generation, enrollment approval, PDF download, private teacher application/review, reports, recovery, student profile, Google role/profile setup and permanent deletion workflows.
- Lint, explicit TypeScript checking and final webpack production build passed.

Browser tests used Chromium with mobile viewports and local Supabase. They do not establish live Google-provider reauthentication, production inbox delivery, physical-device behavior, concurrent capacity or production latency.
