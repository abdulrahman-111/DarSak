# Teacher-owned subjects and years/categories

Teachers can manage their own subjects and years/student categories, select them in group setup, and add profile specializations before creating a group. Shared catalogue choices remain available. Custom labels appear to students on eligible published groups; private drafts and other teachers' editable catalogues remain private. Archived choices retain existing references but cannot be used for new selections. English/Arabic labels support a single-language fallback.

Group details and their selected pair save atomically, with a server timestamp preventing stale draft overwrites. Inline creation preserves unsaved group/profile fields. Contact visibility, rich profile details, and existing authorization remain unchanged.

## Validation

- Full unit suite at `70dc068`: 158 tests in 21 files passed.
- Full real local API suite: 153 assertions passed.
- Full lint: zero errors; one existing image optimization warning in `profile-cover-editor.tsx`.
- Webpack production build and included TypeScript check passed at `70dc068`.
- Final correction `4568052`: 11 focused profile tests, TypeScript, and changed-file lint passed. The correction filters hierarchy-only profile choices, consumes inline creation once, and updates the seed's shared partial-index conflict predicate.
- Fresh application schema: all source migrations, seed, and 14 registered SQL suites passed after the seed correction. The temporary validation database was removed. This uses the existing local Supabase framework schema, not a full service bootstrap.
- Sol final review and scoped correction review approved with no outstanding material findings.
- Combined local authenticated browser smoke passed: profile specialization Add/save with unsaved account/contact fields and rich details/assets preserved; private discovery labels excluded; Arabic RTL profile and English/Arabic catalogue at 390px without horizontal overflow; inline group labels preserving details and saving; stale save after inline creation rejected without overwriting newer data. Disposable fixtures and the owned server were cleaned up. Evidence: `/workspace/.dars-browser-tools/validation/profile-smoke-results.json`.
- Vercel preview status succeeded for final product commit `4568052`.

The first fresh replay failed because a test-only `dblink` extension inherited from the local framework had incompatible privileges; the disposable harness now excludes that extension. The second replay exposed the seed's obsolete conflict target; the product seed correction above fixed it. No production database was reset or replayed.

Local default Turbopack builds previously encountered an environment port-binding permission failure; this phase used Webpack. Direct production HTTP verification is unavailable from this workspace. Production readiness will be checked against Vercel's exact merge commit deployment metadata; local browser results are not production browser evidence.

## New migration sources

Only these two new migrations are to be applied; existing production versions must not be repaired or replayed.

| Source | SHA-256 |
| --- | --- |
| `20261011191527_teacher_owned_catalogue_foundation.sql` | `f065e11d62688782c9b26733e7319de00e9411d8100f519d9d51e7f9f4fe7978` |
| `20261011194031_teacher_catalogue_writes_and_atomic_drafts.sql` | `20e389ae94204121fe3c65b1c04deee728d1597a71624d2db24b5cd9dc82b9f8` |

Production migration versions and deployment evidence will be recorded in the release record after release.
