# Teacher workflows validation

Validated on 2026-10-10 against the approved [design](../superpowers/specs/2026-10-09-teacher-workflows-design.md) and [phase plan](../superpowers/plans/2026-10-09-teacher-workflows.md). GPT-6 Luna implemented scoped changes; Sol reviewed the design, each change and the complete branch.

| Check | Result |
| --- | --- |
| `npm test` | PASS: 87 tests across 11 files |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| Existing-schema database checks | PASS: all 11 suites listed by `tests/database/run.sh`, run through local Docker PostgreSQL because host psql is unavailable |
| Local API integration | PASS: 109 assertions in `tests/integration/api.mjs`, invoked by the saved `/workspace/dars-check-api.sh` helper |
| Clean application migration check | PASS: all 15 migrations, seed and all 11 SQL suites in a disposable database created from template0 |
| Local Supabase security advisor | No WARN-level issues returned |
| `npm run build -- --webpack` | PASS: compilation, TypeScript, route generation and build traces; repeated after the final discovery filter fix |
| Default `npm run build` | FAIL: Turbopack CSS worker cannot bind a port (`Operation not permitted`) in this execution environment; reproduced with network access enabled |
| Final production browser checks | PASS: all 11 planned stages covered by the full run plus a corrected targeted login/enrollment replay; no uncaught browser exceptions |

## Browser evidence

Sol verified the actual production app: Cairo dashboard day boundaries and exact totals; duplicate-group drafts without history and schedule proposal retention; persisted lesson copying without materials; cancel/restore conflict handling; draft refresh, schedule CRUD, stale-preview rollback and atomic publication; exclusions outside the selected preview range and generation confirmation; anonymous sign-in returning to the selected group; enrollment pending/retry/accepted/full states and decision refresh; discovery filtering, pagination, locale preservation and cleared controls; Arabic navigation at 390px with keyboard access; enrolled-default/public opt-in contacts and private photo upload/removal. No uncaught browser exceptions occurred.

The full browser harness passed 10 of 11 stages. Its login check read SPA navigation too early and then used a regex that matched the login URL's `next` query; a targeted replay corrected both waits to inspect the settled pathname and passed the remaining login stage, enrollment and exception checks. These were harness failures, not product failures. The discovered stale filter-control product bug was fixed in `54ecaac`, reviewed, rebuilt and verified by the full replay.

Separate 390px English and Arabic probes induced a render error using only a disposable local fixture, verified the localized error boundary, removed the fault and verified successful Try again recovery. Browser users, groups and avatar objects were cleaned up; independent cleanup checks found zero remaining fixtures. Earlier phase browser checks also verified exact 2 MiB avatar and 10 MiB material limits, rejecting one byte above each cap.

## Database scope

The disposable migration check restored schema-only Supabase Auth, Storage and extension framework objects with their existing ownership/ACLs, then applied application migrations and seed to a clean application schema. All suites passed and only the throwaway database was removed. This verifies fresh application installation atop the existing Supabase framework; it does not claim a clean bootstrap of every Supabase service. Existing local data was preserved.

Existing-schema suites were executed with `docker exec -i supabase_db_private-teachers psql -U postgres -d postgres -v ON_ERROR_STOP=1` for every file listed in `tests/database/run.sh`. The final API run included real last-seat, identical-generation, reschedule-versus-generation and slot-edit-versus-generation concurrency checks; the standalone `tests/database/concurrency.sql` was not separately rerun in this final sequence. The local advisor command was `supabase db advisors --local --type security --level warn`, which returned `No issues found` and an empty result list.

Regression coverage includes the original PostgreSQL 42P10 conflict-index bug, repeated/concurrent occurrence generation, Cairo DST gaps/folds, exclusions, stale-preview rollback, cancellation/rescheduling identity, schedule mutation races, atomic publication, owner/admin authorization, raw contact visibility, private avatar/material access, group duplication, safe discovery filters and last-seat enrollment concurrency. Browser fixture creation and cleanup are restricted to the local backend.

## Scope retained for a later release

Attendance, new schedule-change notifications, calendar export, and delivery-service reminders remain deferred. Contact details default to enrolled students; public visibility requires an explicit teacher choice. Existing English/Arabic support and authorization rules remain part of the reviewed implementation.

## Build limitation

The standard build command still uses Turbopack. No dependency or build-script change was made to hide its environment failure. Webpack is the verified production-build alternative for this environment. No deployment or merge was performed.
