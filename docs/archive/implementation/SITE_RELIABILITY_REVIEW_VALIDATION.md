# Site reliability review

Reviewed the deployed b0673b4 site across teacher/student workflows and admin/auth/notifications/access/email boundaries. Vercel's grouped runtime-error summary reported no errors in the selected preceding 24-hour window. This does not establish that all logical or fault-boundary behavior is correct: actual-source mock reproductions identified three defects.

## Fixes

- A lesson-material metadata INSERT can commit while its response is lost. Upload compensation previously deleted the backing Storage object, permanently breaking the committed student download. The action now verifies the exact owned path; confirmed saved metadata returns success, unknown outcomes preserve the private file with honest guidance, and cleanup is limited to definitive PostgreSQL transaction rejections. Uncertain outcomes can retain an unused private object; safety takes priority over destructive cleanup.
- A terminal monthly-access request silently ignored an opposite stale decision, while the action reported success. The RPC preserves its void signature, authorization, lock order and same-decision idempotence, but rejects contradictory terminal decisions. PostgREST custom SQLSTATE PT409 returns HTTP 409; the action reports a localized conflict without success feedback or approval-mail scheduling. The initial 40001 choice mapped to HTTP 500 in the actual browser/API test and was corrected using the official PostgREST error mapping before release.
- A failed admin profile/teacher-profile lookup previously became a 404. Errors now render a localized retry state without decision controls; successful missing records remain 404. Native GET retry carries search/status/page through hidden inputs, preserving list context.

Luna implemented the fixes with failing-then-passing regressions; GPT-6.1 Sol reviewed the complete batch and final follow-ups with no outstanding findings. No new product feature, dependency, fee policy, billing, or authorization expansion was introduced. Migration: 20261015194149_monthly_teacher_access_stale_decision.sql.

## Validation

The full unit suite passed 360 tests in 57 files; after the final HTTP classification change, 22 affected tests in three files passed again. Repository lint, focused final lint, TypeScript and final webpack production build passed. Final database run passed all 35 SQL suites. The 173 existing actual API assertions passed after the initial migration; final targeted real RPC/browser tests verified the PT409 classification. Two concurrent-decision checks passed, including exactly one opposite-decision winner and idempotent same-decision retry without another grant.

Five final browser bundles passed: English/Arabic 390px teacher uploads, accepted-student signed-file byte downloads and admin review details; English/Arabic stale admin UI submissions plus direct REST HTTP409/PT409 preserving the prior decline; desktop admin details at1440px. Local fixtures, file objects and exact private access/outbox records were cleaned. No production fixtures, fault injection, policy changes or test emails.

An intermediate SQL run exposed a test-order problem: retained private audit jobs from prior API fixtures consumed the bounded email-claim scan. The email test now postpones preexisting jobs only inside its rollback transaction, isolating its fixtures; the full rerun passed. The initial browser HTTP500 assertion failure prompted the final conflict-status fix above, followed by a fresh build and passing browser run.

Production email delivery remains safely disabled: metadata confirms SUPABASE_SERVICE_ROLE_KEY and GMAIL_APP_PASSWORD are absent. No private values were inspected. Google OAuth-provider and external email delivery were not exercised in this local review. Tests cover identified defects and critical regressions, not every possible input, outage or race; zero bugs cannot be guaranteed. Production deployment identity/readiness is verified separately through Vercel.
