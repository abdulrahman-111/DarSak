# Teacher approval and admin requests

Admins review pending teachers through an explicit Approve/Decline workflow with a required decline reason. The request token prevents stale or competing decisions. Teachers see pending, approved, or declined status, can prepare their profile/groups while pending, and explicitly resubmit after decline. Approval and account suspension remain separate.

The People page has search, filters and pagination. It reads canonical review status and teacher metadata only for teachers on its current page; declined teachers are labelled accurately. Private review reasons/events remain restricted to the owner and active admins. Existing public approved gates and contact privacy remain unchanged.

All new email-related work is deferred to the final phase. No outbox, enrollment email producer or delivery status is deployed here.

## Validation

- Full unit suite: 170 tests across 23 files passed.
- Full local API suite: 160 assertions passed, including resubmission, concurrent decision winner, raw-write isolation, account-target guards and legacy synchronization.
- Fresh application migrations and seed plus all 15 registered SQL suites passed. The throwaway database was removed. This retains existing Supabase framework schema/default ACLs; it is not a full service bootstrap.
- Full lint passed with zero errors and one existing image warning.
- Webpack production build, including TypeScript, passed on final feature UI before the People correction.
- People correction `950a993`: nine focused tests, typecheck and changed-file lint passed. Sol scoped review approved; no material issue remains.
- Authenticated local browser smoke passed decline with required reason, teacher-visible reason, explicit resubmission to a fresh pending token, admin approval and resulting teacher status, Arabic RTL queue/panel at 390px without horizontal overflow, and suspension independent of approval. Two disposable Auth fixtures were cleaned up. Script: `/workspace/.dars-browser-tools/validation/teacher-review-smoke.mjs`. The owned production server was stopped.

The fresh replay initially could not find the temporary harness after an environment restart. Its persistent copy needed the previously established cover-object exclusions and Supabase public default ACLs; those harness corrections are now persisted outside the repository. Final fresh application verification passed. No production reset or old migration replay occurred.

Direct production HTTP is unavailable from this workspace; exact merge-commit Vercel readiness is checked separately and is not production browser evidence. Local default Turbopack previously encountered an environment port-binding restriction, so the local release build used Webpack.

## New SQL sources

| Source | SHA-256 |
| --- | --- |
| `20261012051521_teacher_review_foundation.sql` | `d29333f5b3ab9209848cafd22552d531b5eac5d2410005cd6b7f01af2e61055a` |
| `20261012051754_teacher_review_event_producers.sql` | `6c7a3fe0d7e6bb07c1316bbeb9a6e7db7652258241b67e6d3a4898b64024cd31` |

Existing teacher states are backfilled silently and approved accounts remain approved. Production versions and deployment evidence are recorded in the external phase release record.
