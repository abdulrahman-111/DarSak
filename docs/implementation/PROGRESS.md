# Implementation progress

- Plan created; user approved implementation, non-commercial deployment, and deferred email delivery.
- Git initialized on feat/platform. Local Docker available with elevated execution.
- Fleet: use implementation-codex for bounded implementation; review lane for independent review. Preserve configured model dials.
- Cloud connectors for Supabase/Vercel are discoverable but not installed. Check authenticated CLI/browser access before declaring deployment blocked.
- Full MVP remains the completion target. No implementation gate has passed yet.

## Live handles — retain, inspect before restarting
- Supabase database fleet relay: exec session 75164; artifacts /tmp/private-teachers-db-run (implementation-codex).
- Application fleet relay: exec session 22296; artifacts /tmp/private-teachers-app-run (implementation-codex).
- Application npm install: exec session 55691. Do not start another install while live.
- Supabase CLI npx: exec session 74079. Earlier duplicate session 34544 terminated with ETXTBSY; current one was still live at last observation. Inspect this handle before any retry.
- Initial sandbox npm view session 9722 may still exist; no need to retain its result (elevated version probe already returned Next 16.3.5).
- User installed Supabase and Vercel plugins. Plugin management confirms installed=true for both; ALL_TOOLS in the current turn still has no callable Supabase/Vercel tools. Rediscover tools on next turn before cloud setup.

## Current files and verification
- Application worker writing src/** and package/config; database worker writing supabase/** and tests/database/**. Do not modify their owned files until their processes finish.
- Orchestrator added scripts/bootstrap-admin.mjs, tests/integration/api.mjs, deployment docs and review queue. `node --check` passes on the two scripts; real integration has NOT run.
- Real API harness covers signup role spoof, private profiles, cross-teacher writes, concurrent capacity, overlap, membership, private signed downloads, removed membership, recurrence and suspension. Needs local Supabase env (local host only).
- Docker available at 29.7.2 using elevated tool. No existing containers at initial check.
- Next step: poll live processes, review final artifacts, start local Supabase, resolve concrete migration/build failures, run real API and browser tests. Initial SQL review showed likely grants/RLS/Storage issues; re-read final worker version and use review lane before treating secure.
- Full platform is not complete or deployed. Preserve all requirements; do not reduce to current implementation.

## Rich teacher profiles — Phase 1 validation update (2026-10-11)

- Product implementation baseline is `a9431dc` on `codex/teacher-profiles`; the Task 5 evidence docs are in docs-only commit `4ee585c`. Root reports the product commit pushed while `main` is unchanged.
- Final root checks at `a9431dc`: 119 unit tests / 16 files pass; lint has zero errors and one cover-editor `<img>` warning; typecheck passes; `npm run build -- --webpack` passes. Default Turbopack build fails because its CSS/PostCSS subprocess cannot bind a port (`Operation not permitted`). Root reports 137 API assertions pass and the final migration replay passed all 13 SQL suites in a throwaway database built from schema-only Auth/Storage/extensions. This is not a full Supabase service bootstrap.
- Hosted Vercel preview build reports success for exact commit `a9431dc` (deployment `dpl_FVhbM9FpVq1K3FtLAvVv4cQNBWbY`); this is not production runtime or migration validation.
- Task 5's first authenticated browser pass confirmed owner saves persist canonical bilingual detail values, update `teacher_profiles.bio` to the preferred-language value, advance version 0→1, and survive refresh. Owner/admin detail read is allowed; foreign and unapproved teacher read is denied; foreign, unapproved and admin save is denied. Owner preview omits enrolled-only contacts; anonymous contact/detail RPC probes are safe.
- The anonymous public teacher page initially failed at `3dcb94e` because anonymous `teacher_profiles` cover-reference reads return 401, while public teacher/specialization/catalogue/details/discovery probes return 200. Root added `public_teacher_cover_path(p_teacher_id uuid)` in `33b7704`; scoped review found its scalar result was initially read as a row field, corrected in `a9431dc`. The narrow RPC passed review and rebuilt successfully; no broad anonymous table grant was added.
- Final browser baseline against fresh webpack build `a9431dc` on controlled port 3031 passed all 12 named checks, including anonymous/enrolled contact privacy, explicit public contact opt-in, pending/foreign/admin boundaries, hidden About, stale-version retention, second-row inline errors, desktop/390px English and Arabic layouts, failed cover replacement preservation, successful replacement/removal, and invalid raw JSON rejection. Independent cleanup audit passed 16 checks with no fixture accounts, rows, groups, enrollments or cover objects remaining.
- Sol's subsequent whole-branch review reproduced a theme-only settings edge case where the public details RPC returns `NULL`; Phase 1 sign-off remains pending that fix and its regression/replay. Monthly expiry and catalogue replacement remain later-phase work. See [RICH_TEACHER_PROFILE_VALIDATION.md](RICH_TEACHER_PROFILE_VALIDATION.md) for baseline evidence and limits.
