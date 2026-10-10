# Teacher workflows implementation progress

Updated: 2026-10-10. User approved the [design](../superpowers/specs/2026-10-09-teacher-workflows-design.md) and GPT-6 Luna implementation with Sol review. [Implementation plan](../superpowers/plans/2026-10-09-teacher-workflows.md). Work branch: `codex/teacher-workflows` in `/workspace/Dars`.

## Current execution

Implementation Tasks 0–12 and the cross-flow UX work in Task 13 are complete in separate reviewed phase commits. The user approved the design and GPT-6 Luna implementation; Sol reviewed each change and the whole branch. Final browser validation passed; the reviewed branch is ready for draft PR delivery.

## Task ledger

| Task | Deliverable | State / reviewed commit |
| --- | --- | --- |
| 0 | Recurring generation fix and regression | Complete; `dcc33dd` |
| 1 | Profile/contact persistence and API privacy | Complete; `33dd0c7` |
| 2 | Bilingual profile editor | Complete; `67cf9bc`, `ad9717c` |
| 3 | Private avatars and public teacher pages | Complete; `b185373`, `c69a7b6` |
| 4 | Shared lesson candidates and strict Cairo times | Complete; `c034f28` |
| 5 | Persistent exclusions and locked generation | Complete; `e943e87` |
| 6 | Resumable saved draft details | Complete; `a24cfd7` |
| 7 | Schedule editing and date preview | Complete; `643841e`, `7367a34` |
| 8 | Guarded atomic publication and review | Complete; `0927adf`, `d4d9acc`, `894e1f9` |
| 9 | Today, enrollment requests and setup dashboard | Complete; `c95cf2f`, `6cccd91` |
| 10 | Duplicate group, copy lesson and teaching actions | Complete; `ce09491`, `f0c1baa` |
| 11 | Safe filtered discovery projection | Complete; `ae06cc1` |
| 12 | Discovery and enrollment UI | Complete; `79bb8db`, `5b01647`, `54ecaac` |
| 13 | Locale/mobile UX, login return, final checks and PR | Code and validation complete; `dd6965d`, `2d4b7ed`; draft PR delivery |

Final counts replace the intermediate per-task counts previously recorded here. See [validation results](TEACHER_WORKFLOWS_VALIDATION.md) for commands, scope and limitations.

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

## Validation environment

Validation was completed on the existing local Supabase backend, with a separate throwaway database for clean application migrations. No existing database reset was performed. Browser tools and validation scripts live outside the product repository in `/workspace/.dars-browser-tools/validation`; their logs are environment artifacts, not runtime dependencies. Historical worker/server handles are not current instructions.

## Delivery constraints

Draft PR only; no merge or deployment. Attendance, new schedule-change notifications, calendar export and reminders remain deferred. Report any unavailable check or unresolved failure explicitly.

## Rulings

- Ruling: retain the managed checkout and create a dedicated feature branch —
  saved startup helpers and local backend target this path; unrelated working
  changes were only the supplied recommendations and our design. No worktree or
  dependency reinstall is needed.
- Ruling: user approval of the concrete design and Luna execution authorizes
  task-plan execution — no redundant plan confirmation gate.
- Ruling: repair the newly reached anonymous schedule policy failure in a separate
  commit before features — it blocks existing discovery and complete API validation.
  Scope old policies to authenticated and give anonymous readers only the safe
  published-group projection, without private-profile grants.
- Ruling: make the existing lesson Storage SELECT policy authenticated-only,
  preserving its predicates and helper ACL, so it no longer breaks anonymous
  avatar signing through an unrelated denied function. Sol reproduced the
  planner failure and reviewed this narrowing. An anonymous helper-execute grant
  was rejected by automatic review and was not applied; do not retry it or add
  a service-role key to the application. Verify private lesson signing remains denied.
- Resolved validation finding (`e7b34fc`): the old standalone `tests/database/concurrency.sql`
  failed parsing `:'test_group_id'` inside a dollar-quoted DO block. Real API
  concurrent last-seat approvals pass. Luna repaired the harness, proved old red42601, ran actual parallel capacity-one approvals (one accepted/one full), passed postcondition and cleaned fixtures. Sol approved.
