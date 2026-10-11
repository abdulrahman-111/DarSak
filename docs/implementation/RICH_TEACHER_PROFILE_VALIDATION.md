# Rich teacher profile validation

Validation is against branch `codex/teacher-profiles` at `a9431dc` unless a row names a prior revision. The first authenticated browser run exposed an anonymous public-profile failure in the cover-reference read. Root added the narrow `public_teacher_cover_path(p_teacher_id uuid) returns text` RPC in `33b7704`, and corrected its scalar loader in `a9431dc`; scoped review, final build, fresh SQL replay, API, and browser checks now pass.

## Build, tests, and database

| Check | Result |
| --- | --- |
| `npm run test` | PASS: 119 tests across 16 files at `a9431dc`. |
| `npm run lint` | PASS: zero errors, one `<img>` warning in `src/features/teacher/profile-cover-editor.tsx`. |
| `npm run typecheck` | PASS at `a9431dc`. |
| `npm run build` | FAIL: Turbopack CSS/PostCSS subprocess cannot bind a port (`Operation not permitted`) in this environment. |
| `npm run build -- --webpack` | PASS: production build at `a9431dc`, exit 0. |
| `tests/database/run.sh` | PASS: all 13 SQL suites in the final fresh replay. |
| Fresh application migration replay | PASS: current migrations including the safe public cover RPC, seed, and all 13 SQL suites passed in a disposable `dars_validation` database. The helper removed the database after its run. Auth/Storage/extensions came from schema-only local framework objects; this does not claim a full Supabase service bootstrap. See `/workspace/shared/dars-profile-phase/fresh-replay-final-report.md` for migration hashes and console tail. |
| Local API integration | PASS: 137 assertions on the local database at `a9431dc`. |
| Hosted Vercel build check | PASS for commit `3dcb94e`; this records the earlier CI build only, not production runtime or migration validation. |

The standard Turbopack build remains failed; webpack is the verified production build command in this environment. No production database, user, migration, or deployment was changed during Task 5 validation.

## Authenticated browser evidence

Chromium (`/usr/bin/chromium`, Playwright Core) ran against the local production server on port 3030. All users and group data were generated for this validation run.

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

The final Chromium run passed 12 named cases. Its helper and results are under `/workspace/.dars-browser-tools/validation`; the helper is external to the repository and has no product dependencies. A raw anonymous table probe for `teacher_profiles.cover_path` remains 401 intentionally; the public route uses the reviewed safe RPC.

The final independent cleanup audit passed 16 checks: all five fixture Auth users returned 404; their profile, teacher-profile, details, contact, group and enrollment rows were absent; and no `teacher-avatars` objects remained under their UUID prefixes. The script clears references before deleting Storage objects, then deletes Auth users. The validation helper, result JSON and historical failure screenshot/text remain as external evidence only. No real account, production data, or user file was changed.

## Deferred integrations and limits

Monthly expiry/renewal eligibility is phase 4. The subject catalogue replacement follows in phase 2. This validation does not claim either integration is complete. Cover signed URLs expire after 300 seconds; removing a cover prevents new signing but does not revoke URLs already issued. Operator-driven Auth deletion must clear references and remove bytes through Storage first because the Auth/profile cascade does not call the Storage API.
