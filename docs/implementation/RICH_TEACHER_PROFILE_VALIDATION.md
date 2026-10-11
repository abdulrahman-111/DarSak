# Rich teacher profile validation

The UI/browser/build baseline is code commit `a9431dc` on `codex/teacher-profiles`. The subsequent database-only theme fix is commit `f1e64e1`; it amends the unreleased rich-profile migration and adds SQL/API regressions without changing application code. The earlier public cover-reference failure was fixed by the narrow `public_teacher_cover_path(p_teacher_id uuid) returns text` RPC in `33b7704` and its scalar loader correction in `a9431dc`. The theme fix now passes targeted SQL/API checks and the final fresh replay. Sol's integrated review and scoped theme rereview passed with no outstanding P1/P2 findings. The reviewer also verified four actual static-render cases for English/Arabic empty-section appearance.

## Build, tests, and database

| Check | Result |
| --- | --- |
| `npm run test` | PASS: 119 tests across 16 files at UI commit `a9431dc`; the SQL-only theme fix adds separate database/API regression coverage. |
| `npm run lint` | PASS at `a9431dc`: zero errors, one `<img>` warning in `src/features/teacher/profile-cover-editor.tsx`. |
| `npm run typecheck` | PASS at `a9431dc`; the follow-up changes only SQL and SQL/API tests. |
| `npm run build` | FAIL: Turbopack CSS/PostCSS subprocess cannot bind a port (`Operation not permitted`) in this environment. |
| `npm run build -- --webpack` | PASS: production build at `a9431dc`, exit 0. |
| `tests/database/run.sh` | PASS: all 13 SQL suites in the fresh replay including the theme projection fix. |
| Fresh application migration replay | PASS: final migration sources, seed, and all 13 SQL suites passed in a disposable `dars_validation` database; the helper removed it after the run. Auth/Storage/extensions came from schema-only local framework objects; this does not claim a full Supabase service bootstrap. The final rich-profile migration SHA256 is `5bc0caf03053310c5bcbc84bdc5edb42f9bb0d2d1ab58897a30ca657d3d0aaa4`; the cover migration SHA256 is `2b67f5bf6d92bd913b70feda127455bc85a6f92599650aed18e2ea8cccb8eaab`. |
| Local API integration | PASS: 142 assertions, including theme-only and all-hidden public projections, ineligible pending/suspended teachers, and students. |
| Hosted Vercel build check | PASS for `f1e64e1` (deployment `dpl_8UQTNWWg73evpsbL2UqZ4goqdjsV`), including the final SQL-only fix. This records the hosted build, not authenticated production runtime. |

The standard Turbopack build remains failed; webpack is the verified production build command in this environment. No production database, user, migration, or deployment was changed during Task 5 validation.

## Authenticated browser evidence

Chromium (`/usr/bin/chromium`, Playwright Core) ran against the local production server on port 3031. Port 3030 was occupied by a pre-existing listener, so validation used a fresh controlled server on 3031. All users and group data were generated for this validation run.

Confirmed in the final replay:

- An owner saved bilingual About, teaching approach, and city through the English editor at 390px. The canonical detail row advanced from version 0 to 1 and retained the saved values after refresh. The legacy `teacher_profiles.bio` mirrored the preferred Arabic About, as configured for the fixture account.
- Owner and active-admin tokens could read canonical details. Foreign and unapproved teacher tokens could not read another teacher's canonical row. Foreign, unapproved, and admin tokens could not save that teacher's details.
- The owner preview omitted enrolled-only phone and email. The anonymous contacts table query returned no row. The public details RPC returned visitor-visible sections without the hidden-section list/private metadata.
- A fixture group was created and published using the authenticated teacher's existing schedule and publication RPCs, with an accepted enrollment for a fixture student.
- At desktop width and 390px, the public English profile rendered without horizontal overflow. Anonymous visitors saw only public contacts; an accepted student saw enrolled-only contact data. The owner changed visibility from enrolled to public and back through the editor, and the anonymous page reflected both saves.
- Hiding About removed both language values from the public RPC/page while preserving canonical values; the old `teacher_profiles.bio` stayed empty. A concurrent writer advanced version 2→3; the stale form reported a conflict and kept its draft, then refresh loaded the saved version and values.
- A year error on the second qualification row marked that row's matching input with `aria-invalid` and a linked message while keeping the edited values and version intact. The Arabic editor and public cover rendered at desktop and 390px with RTL direction and no horizontal overflow.
- Cover upload succeeded; an invalid GIF replacement kept the existing path; a second valid upload replaced it and removed the old object; removal cleared the visible reference and made the current object unavailable. Raw unknown JSON fields and city text over the database limit were rejected.

The initial public visitor page failure at `3dcb94e` was reproduced with the generic “Could not load this teacher profile. Please try again.” Direct anonymous probes isolated the failure:

| Request | Result |
| --- | --- |
| `public_teachers()` | 200 |
| `public_teacher_specializations()` | 200 |
| Anonymous education nodes, subjects, offerings | 200 |
| Anonymous `public_teacher_profile_details()` | 200 |
| Anonymous `discover_groups()` | 200 |
| Anonymous `teacher_contacts` query for the fixture | 200, empty |
| Anonymous raw `teacher_profiles` query selecting the approved teacher's `cover_path` | 401 (still denied by design) |

At `3dcb94e`, `publicTeacherDetail` read `cover_path` directly from `teacher_profiles`; the anonymous 401 made the public teacher page fail even with no cover. That finding was reported before the fix. `33b7704` replaced the table read with the narrow safe RPC `public_teacher_cover_path(p_teacher_id uuid) returns text`, without granting anonymous table access. Scoped review found and corrected the scalar mapping in `a9431dc`. The raw anonymous table query still returns 401, while the narrow RPC and public route now work.

An initial fixture attempt tried setting `profiles.status='pending'`; that value is invalid because account status is `active` or `suspended`. The pending-approval fixture is an active teacher with `teacher_profiles.approved=false`, matching the application model. The attempt stopped before browser navigation and its generated Auth fixtures were removed.

The Chromium baseline at unchanged UI commit `a9431dc` passed 12 named cases. Its helper and results are under `/workspace/.dars-browser-tools/validation`; the helper is external to the repository and has no product dependencies. A raw anonymous table probe for `teacher_profiles.cover_path` remains 401 intentionally; the public route uses the reviewed safe RPC. The theme-only case was covered by new database and API regressions against the SQL fix, but was not added to the prior browser matrix; no UI code changed in `f1e64e1`.

The theme-only projection regression failed against the old SQL function and passed after the fix. Default empty profiles still return `NULL`; non-default appearance is returned with an empty `sections` array even when all descriptive sections are hidden. Pending/unapproved teachers, suspended teachers, and students remain ineligible. Final Sol scoped rereview of `f1e64e1` passed: the original SQL reproduction now returns the saved appearance; affected SQL, 18 focused unit tests and four actual EN/AR rendering cases passed.

The final independent cleanup audit passed 16 checks: all five fixture Auth users returned 404; their profile, teacher-profile, details, contact, group and enrollment rows were absent; and no `teacher-avatars` objects remained under their UUID prefixes. The script clears references before deleting Storage objects, then deletes Auth users. The validation helper, result JSON and historical failure screenshot/text remain as external evidence only. No real account, production data, or user file was changed.

## Deferred integrations and limits

Monthly expiry/renewal eligibility is phase 4. The subject catalogue replacement follows in phase 2. This validation does not claim either integration is complete. Cover signed URLs expire after 300 seconds; removing a cover prevents new signing but does not revoke URLs already issued. Operator-driven Auth deletion must clear references and remove bytes through Storage first because the Auth/profile cascade does not call the Storage API.

## Production migration mapping

Only the two new migrations were applied before the application release. Existing migration history, teacher approval/status and existing group/lesson data were preserved. Post-migration checks confirmed 8 profiles, 4 teachers, 4 groups and 12 lessons, plus 4 version-zero canonical detail rows; RLS and direct-write restrictions remain enforced.

| Source file | Production version | SHA256 |
| --- | --- | --- |
| `20261011134452_rich_teacher_profile_details.sql` | `20261011153807` | `5bc0caf03053310c5bcbc84bdc5edb42f9bb0d2d1ab58897a30ca657d3d0aaa4` |
| `20261011141234_teacher_profile_covers.sql` | `20261011153951` | `2b67f5bf6d92bd913b70feda127455bc85a6f92599650aed18e2ea8cccb8eaab` |
