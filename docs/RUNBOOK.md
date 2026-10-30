# Operations runbook

This runbook describes the monitoring and recovery tools present in the repository. It does not represent that external alerting or a restore has been configured or rehearsed.

## Health check and monitoring

`GET /api/health` is an unauthenticated, no-cache availability probe. It makes one read-only PostgREST request for at most one public `subjects.id`, using only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It does not read an app session or cookies. The request has a 2.5-second timeout. It returns only `{"status":"healthy"}` with HTTP 200 or `{"status":"unhealthy"}` with HTTP 503. Missing configuration, timeout, network error, or non-success response is unhealthy. The result only confirms that the app can reach this public database/API read; it does not verify sign-in, email delivery, scheduled jobs, storage, all database functions, or a full user flow.

The endpoint is public and intentionally cheap, but it is not a rate limiter or an alerting service. If an external monitor is configured, poll at a modest interval (for example, once per minute) and avoid running multiple overlapping checks. No external monitor, alert destination, or paid monitoring plan is configured by this change.

For application signals already present:

- The admin portal's **Operational health** page calls `admin_launch_health()` as the signed-in admin. It shows seven UTC days of totals, failures, and operations lasting at least two seconds for signup, Google setup completion, email verification, enrollment, setup save, and setup completion. Counters are recorded asynchronously by `record_launch_operation`; the function stores bounded categories and no user identifiers or submitted values. A missing counter can mean no operation was recorded, not that the feature was checked and passed.
- That page also shows incomplete setup drafts not updated for 24 hours, failed app-notification outbox jobs, and open reports. Inactive drafts do not prove abandonment. Failed app-notification delivery is distinct from Supabase Auth confirmation/recovery email delivery.
- Vercel runtime logs may contain categorical `server_read`, `server_request_error`, and `darsak_operation` warnings. Inspect the relevant deployment's function logs and timestamps. The warnings avoid request and record details. These signals do not provide browser real-user performance measurements.
- The health endpoint itself emits no detailed failure reason. Compare its response with Vercel function logs, Supabase project/API status, the admin page, and a synthetic user flow before attributing an incident.

There are no automatic external alerts configured by this repository. Hosting log retention and provider backup/restore options depend on the selected plans and project settings. Do not assume backups, point-in-time recovery, or email alerts are enabled.

## Incident notes

Use one copy per incident and record only what is appropriate for the operational record. Do not paste passwords, keys, cookies, access tokens, or learner data.

```text
Incident ID:
Started / detected (UTC):
Reporter / source:
Affected environment and deployment:
Observed symptom and impact:
Health endpoint result and time:
Relevant Vercel log event / timestamp:
Admin health counters or job state:
Recent app deployment or database migration:
Actions taken (operator and UTC time):
Recovery evidence / synthetic checks:
Follow-up owner and due date:
```

## Application deployment rollback

1. Confirm the affected Vercel project, environment, and deployment. Check its build and function logs and compare the incident start with recent releases.
2. If an application release is implicated, use Vercel to promote the last known-good deployment for that same project and environment. Do not promote a staging deployment into production as a rollback.
3. Recheck `/api/health`, the admin Operational health page, and the affected user flow with a synthetic account. Record the deployment ID and results.
4. A Vercel rollback changes application code; it does not undo a Supabase migration. Check whether the previous application version remains compatible with the current schema before rollback. If not, keep the compatible code deployed and prepare a reviewed forward fix.

## Database migration failure and recovery

1. Stop additional releases and establish the exact Supabase project reference, migration filename, CLI output, and whether the migration committed. Never run `supabase db reset` against a managed or production project.
2. For a migration that failed before applying, inspect the migration and project schema/history. Fix the cause in a reviewed change and follow the deployment procedure in [Deployment](DEPLOYMENT.md); do not blindly replay old migrations or manually rewrite migration history.
3. For a migration that already applied, prefer a new, reviewed forward migration that repairs the schema or data. Do not edit an already released migration as a rollback mechanism. Before rolling application code back, verify it works with the migrated schema.
4. If data was lost or corrupted, pause writes where practical and contact the project operator/Supabase support to assess available recovery options for that project's plan and configuration. A provider restore may rewind the whole database and affect later writes; coordinate the recovery point, impact, and operator before starting one. Restore into an isolated target first when the available tooling permits, then validate before any production recovery.
5. After recovery, verify migration state, RLS and grants relevant to the affected feature, then run the appropriate synthetic application flow. Record the exact migration, recovery action, and validation evidence.

## Synthetic-only restore rehearsal

Rehearse recovery without production exports or real user data:

1. Select an isolated disposable local Supabase stack or a separate non-production project. Verify its project reference/URL before running commands; never point reset or restore commands at a shared or production project.
2. Apply the checked-in migrations from scratch and use only the repository's reference seed plus throwaway accounts and clearly synthetic records. Keep secrets local to the disposable environment.
3. Create a backup/export using the tooling actually available to the operator, recording the tool, scope, and timestamp. Restore it into a newly created isolated target, not over the source. If the selected backup feature or export mechanism is unavailable, record that limitation rather than treating the rehearsal as complete.
4. Verify the restored schema and migration state, expected synthetic records, and a small set of application flows. Check that no real accounts or data entered the exercise, then destroy the disposable target according to its provider's procedure.
5. Record duration, errors, what the backup included, what it omitted, and the next rehearsal date. Database recovery does not by itself restore Storage objects or Auth provider settings; validate those separately if they are in scope.

This repository does not configure automatic paid backups. The recorded [local database restore rehearsal](ops/RESTORE-REHEARSAL-2026-10-30.md) does not establish hosted recoverability or provider backup/PITR availability.
