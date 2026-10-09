# Teacher workflows implementation progress

Date: 2026-10-09. User approved the [design](../superpowers/specs/2026-10-09-teacher-workflows-design.md) and GPT-6 Luna implementation with Sol review. [Implementation plan](../superpowers/plans/2026-10-09-teacher-workflows.md). Work branch: `codex/teacher-workflows` in `/workspace/Dars`.

## Current execution

- Task 0 recurrence fix/regression is running under the parent's bounded Luna assignment; outcome and review pending.
- Sol completed repository exploration and approved-scope planning; docs only changed by the planning worker.
- Implementation is authorized; no additional design or execution-method confirmation is pending.
- Existing dependencies and healthy local backend are retained. Old `PROGRESS.md` worker handles are historical and must not be treated as live sessions.
- Supabase changelog HTTP fetch returned 403 because the destination is restricted; connector documentation supplied current private-bucket/RLS/signed-URL guidance. This is a documentation-fetch limitation, not evidence of an implementation failure.

## Task ledger

| Task | Phase / deliverable | State | Review / evidence |
| --- | --- | --- | --- |
| 0 | Recurrence predicate fix and regression | In progress | API baseline reproduces 42P10; Luna outcome pending |
| 1 | Contact/profile persistence and raw API privacy | Pending | Depends on 0 review |
| 2 | Profile editor and specializations | Pending | Depends on 1 |
| 3 | Private avatars and public teacher detail | Pending | Depends on 1–2 |
| 4 | Shared DB candidates and strict Cairo times | Pending | Depends on 0 |
| 5 | Persistent exclusions, locked generation, identity | Pending | Depends on 4 |
| 6 | Saved draft details and resumable routes | Pending | Independent UI after first profile phase |
| 7 | Weekly schedule and generation preview UI | Pending | Depends on 4–6 |
| 8 | Atomic guarded publishing and review UI | Pending | Depends on 5–7 |
| 9 | Today, requests and setup dashboard | Pending | Depends on first-release contracts |
| 10 | Duplicate/copy and teaching shortcuts | Pending | Separate phase after 9 |
| 11 | Safe discovery projection and filters | Pending | Separate phase after 10 |
| 12 | Discovery/enrollment UI | Pending | Depends on 11 |
| 13 | Cross-flow UX, final verification, draft PR | Pending | Depends on prior tasks |

## Baseline before implementation

| Check | Result |
| --- | --- |
| Unit | 20 passed across 2 files |
| SQL foundation / security hardening | Passed in local database container |
| Local API | 31 assertions passed, recurring generation failed PostgreSQL 42P10 |
| Lint / typecheck / production build | Passed |

These checks describe the pre-change baseline. Do not cite them as verification of new code.

## Environment and validation

- Node 22 tools: `/workspace/.dars-tools/node_modules/.bin`.
- Helpers: `/workspace/dars-check-api.sh`, `/workspace/dars-dev.sh`, `/workspace/dars-local-backend.sh`; inspect before use. Never expose helper-derived keys.
- Host psql absent; use the existing local database container. New fixture assertions must roll back; API harness mutates and cleans up only local fixtures.
- No AGENTS.md/CLAUDE.md found during repository exploration.
- Record task-specific SQL/API/unit/UI evidence and Sol review here as each gate closes. Final checks require both existing-schema and disposable-clean-schema migration verification, plus English/Arabic/mobile browser coverage when available.

## Delivery constraints

Draft PR only; no merge or deployment. Attendance, new schedule-change notifications, calendar export and reminders remain deferred. Report any unavailable check or unresolved failure explicitly.
