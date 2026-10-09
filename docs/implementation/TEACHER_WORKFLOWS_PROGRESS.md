# Teacher workflows implementation progress

Date: 2026-10-09. User approved the [design](../superpowers/specs/2026-10-09-teacher-workflows-design.md) and GPT-6 Luna implementation with Sol review. [Implementation plan](../superpowers/plans/2026-10-09-teacher-workflows.md). Work branch: `codex/teacher-workflows` in `/workspace/Dars`.

## Current execution

- Task 0 recurrence fix/regression passed Sol review and is committed as `dcc33dd`.
  SQL test observed red `42P10` before migration, then passed; 20 unit tests pass.
  The newly reached anonymous schedule `401/42501` was repaired separately;
  Sol reviewed the policy boundary and parent independently ran the complete
  local API suite: all 44 assertions passed. Task 1 subsequently passed 65 API
  assertions and all SQL suites; contacts are committed as `33dd0c7`.
- Sol completed repository exploration and approved-scope planning; docs only changed by the planning worker.
- Implementation is authorized; no additional design or execution-method confirmation is pending.
- Existing dependencies and healthy local backend are retained. Old `PROGRESS.md` worker handles are historical and must not be treated as live sessions.
- Supabase changelog HTTP fetch returned 403 because the destination is restricted; connector documentation supplied current private-bucket/RLS/signed-URL guidance. This is a documentation-fetch limitation, not evidence of an implementation failure.
- Sol read-only scheduling preflight identified required Task 5 advisory-before-row lock ordering for slot save/lesson save/status RPCs and an overlap check when restoring a cancelled lesson. These are authoritative conflict guarantees within the approved scheduling scope.
- Task 3 includes Server Actions transport limit `12mb` while retaining 2 MB avatar and 10 MB material domain/Storage caps, and a safe public-specialization projection instead of broadening private table access. Both close verified interface gaps in the approved workflows.
- Parent reports browser tooling outside product dependencies at `/workspace/.dars-browser-tools` with Chromium `/usr/bin/chromium`; verify installation/readiness before browser checks.

## Task ledger

| Task | Phase / deliverable | State | Review / evidence |
| --- | --- | --- | --- |
| 0 | Recurrence predicate fix and regression | Complete | `dcc33dd`; SQL red/green, unit20 pass; full API44 pass after separate reviewed schedule policy repair |
| 1 | Contact/profile persistence and raw API privacy | Complete | Sol approved; SQL suites pass, API65 pass, unit20; includes suspended enrolled-student contact read |
| 2 | Profile editor and specializations | Complete | Sol browser exit0: settled failure retains fields+subjects, exact DB persistence/refresh, loginemail unchanged, Arabic390 RTL/LTR nooverflow/noexceptions; unit32 lint/typepass |
| 3 | Private avatars and public teacher detail | Complete | `b185373` + `c69a7b6`; Sol SQL/API83, app/lifecycle/public privacy/broken-image review; exact2MiB/10MiB browser transport accepted and +1byte rejected, Arabic390 passes |
| 4 | Shared DB candidates and strict Cairo times | Complete | `c034f28`; Sol approved, five SQL suites pass/unit27; isolated manual conflict and generated-over-exclusion regressions added |
| 5 | Persistent exclusions, locked generation, identity | Complete | Sol approved `e943e87`; API101/eight SQL suites pass incl finite guards, true post-preview conflict, both valid race-order assertions |
| 6 | Saved draft details and resumable routes | Complete | Sol approved; unit32 lint/typepass; realbrowser invalidretention, one draftID refresh/update/resume, foreign404, Arabic390 layout pass |
| 7 | Weekly schedule and generation preview UI | Complete code | Sol approved `643841e` + `7367a34` + `e943e87`; preview revision guards, deleteRPC SQL/API green; browser underway |
| 8 | Atomic guarded publishing and review UI | In progress | ReviewUI underway; DB follows deleteRPC; preview-only confirmation contract |
| 9 | Today, requests and setup dashboard | Code complete | Sol approved `c95cf2f`, exact counts/pagination/batched owner scopes; browser follows |
| 10 | Duplicate/copy and teaching shortcuts | App in progress | Separate phase; DB follows publication |
| 11 | Safe discovery projection and filters | Sol contract ready | Safe18-field RPC; DB follows shortcuts |
| 12 | Discovery/enrollment UI | App in progress | Independent domain/adapter and UI workers; integration awaits safe RPC |
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

## Live coordination handles (current session)

- Development server: exec session `25216`, `/workspace/dars-dev.sh`; log
  `/tmp/dars-next.log`. Stop it before running a production build so `.next`
  artifacts do not race. Saved helper preserves generated instruction/type files.
- Profile browser check: `/tmp/dars-profile-browser.mjs`; fixtures cleaned up on
  failure. Use `http://localhost:3000` and explicitly wait React hydration (127
  origin dev assets/HMR blocked). Sol traced and verifies a product fix preventing
  automatic reset of controlled specialization checkboxes after action responses.
- Browser tooling: `/workspace/.dars-browser-tools/node_modules/playwright-core`,
  `/usr/bin/chromium`; browser launch verified. This is outside the repository.
- Sol agents: `sol_exploration` handles scheduling integration preflight/browser checks;
  `sol_recurrence_review` handles completed change reviews.
- Sole database/API writer: `luna_recurrence`, Task8 atomic publication; next Task10 duplicate and Task11 safe discovery.
- Independent app workers: `luna_profile_ui`, Task8 final key and Task12 discovery adapter;
  `luna_draft_details`, Task12 discovery UI; `luna_avatar_db`, Task10 shortcuts. Task3/5/7/9 commits reviewed.
- Next: review/commit Task3 UI and Task5; implement schedule/preview Task7,
  guarded publication Task8, then shortcuts and discovery as separate phases.

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
