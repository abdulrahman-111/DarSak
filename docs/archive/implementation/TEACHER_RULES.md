# Teacher rules and application consent

Policy version: `2026-10-18`, shared English/Arabic text in `teacher-rules.ts`.

Teacher registration shows the rules before email/Google choices. Both auth paths retain their existing staged setup. Before application submission, teachers explicitly select an initially unchecked consent box separate from their accuracy attestation. The normal application editor uses the same rules and separate consent.

The server selects the version. Database wrappers record acceptance using a server timestamp and submit/complete in the same transaction; failures roll back acceptance. The original submission endpoints are protected by a status-transition trigger. Each submitted snapshot includes `teacher_rules_version` and `teacher_rules_accepted_at`, which administrators can inspect. No acceptance is invented for older applications, and existing approvals stay valid.

Acceptance records have RLS: active owners and active admins can read them; clients cannot write records or choose timestamps. The acceptance mutation acquires the existing teacher-calendar advisory lock before the teacher row to preserve setup lock order.

The policy covers honest identity and qualifications, enrollment through DarSak, contact visibility after acceptance, privacy and safety, professional conduct, accurate schedules/materials/fees and realistic learning expectations. Confirmed violations can lead to suspension or permanent exclusion after administrator review. This change does not add automatic bans or an irreversible ban control; existing suspension remains available to administrators.

## Production rollout

1. Apply `20261018072155_teacher_rules_acceptance.sql` (additive table/functions only).
2. Deploy the application and confirm the matching production commit is READY.
3. Apply `20261018072616_enforce_teacher_rules_submission.sql` to activate the trigger.
4. Verify the RPC signatures, trigger and client ACLs.

This order keeps existing onboarding operational while the compatible application is building. A full fresh migration run applies both files in sequence.

## Validation

Unit tests cover missing consent, versioned server calls, unchanged student completion, bilingual unchecked consent presentation and admin snapshot evidence. Rollback SQL suites cover privacy/ACLs, stale versions, server timestamps, failed-completion rollback, direct-submission bypass rejection, full wizard finalization, regular submission and unchanged legacy approval behavior. Browser checks use local test accounts; no production fixtures or emails are created.
