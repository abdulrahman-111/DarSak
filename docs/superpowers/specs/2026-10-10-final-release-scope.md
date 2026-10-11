# Dars finalized implementation scope

Date: 2026-10-10 (Africa/Cairo). Status: final recommended scope for the user’s design review; product implementation has not started for this expansion.

## Goal

Make Dars usable for a free public launch: teachers can set up their own catalogue, gain approval, renew monthly and handle students; students can find appropriate groups and understand enrollment; admins can operate approvals, access status and emails. Build the foundation for announcing future fees without implementing or activating charging.

The detailed behavior and authorization requirements are in [the expanded design](2026-10-10-teacher-customization-approvals-ux-design.md). This scope supersedes earlier proposed alternatives. Sol handles planning/review and the already authorized GPT-6 Luna handles small implementation tasks.

## Features to implement

1. **Working teacher approval and admin operations.** Fix the checkbox approval bug with a regression test. Explicit approve/decline with a reason, pending teacher status, deliberate resubmission, search/filter/pagination, safe account controls and private decision audit. Preserve existing approved accounts and role rules.
2. **Teacher-owned subjects and student categories.** Add arbitrary subjects, years and categories, bilingual labels, inline creation during group setup, and rename/archive/restore. Teachers may use shared or their own choices; students see custom labels only where authorized on published groups/history.
3. **Free monthly teacher access.** First month at signup/backfill, explicit monthly Renew, immediate free grants, visible Cairo expiry and immutable renewal history. On expiry pause teacher teaching workspace/data operations, keep account/profile/renewal/support access, preserve accepted-student/admin access and resume existing groups after renewal. Initial approval stays independent.
4. **Requested email notifications with delivery recovery.** Teacher requests to the administrative inbox, review decisions to teachers, student enrollment requests to the owning teacher, and free renewal confirmations. Canonical account recipients, Arabic/English templates, private transactional outbox, duplicate protection, failure states and authorized retries. Configure Gmail credentials privately when implementation/tests are ready.
5. **Future-fee announcement readiness.** Admin draft/preview, effective-date copy, explicit audience review, persistent teacher notices and individual emails when an announcement is deliberately published. No announcement is published during implementation. Fees remain disabled; no checkout, payment collection, debts or automatic paid activation.
6. **Student UX and discovery polish.** Next lessons and active requests first, accurate totals, current/history separation, clear join/pending/accepted/declined/full/renewal-unavailable states, readable category labels, filter reset/no-results guidance and clear class/material links. Reuse already shipped discovery functionality.
7. **Teacher onboarding and mobile UX polish.** Extend the existing setup checklist for catalogue, approval and renewal. Keep existing guided drafts, readiness review and quick teaching actions. Clear loading/errors/success, inline validation, keyboard focus and Arabic/mobile layouts.
8. **Useful admin overview.** Prioritized approval requests, expired/current teacher access, reports and failed/queued emails, accurate counts, actionable links and reliable data-error states. No misleading zero totals on query failures.
9. **Password recovery and accurate signup feedback.** Forgot-password entry, safe recovery callback/new-password flow, expired-link handling, account-enumeration-safe messaging and proper confirmation-required signup feedback. Preserve roles and all teaching access rules; do not change Auth confirmation settings. Verify Supabase Auth email delivery separately from Gmail application notifications.
10. **Public group sharing.** Copy link plus native Share where supported, with a manual fallback. Eligible published groups only; no private information, access tokens or permission bypass.
11. **Richer, customizable teacher profiles.** Add optional education/qualifications, experience, teaching approach/goals, languages, broad location and teaching modes. Provide a cover image, curated layouts/accessible colors, optional-section visibility/order, private completeness guidance and a visitor preview. Show real eligible group cards with next lessons/seats. Preserve biography/photo/contact data, bilingual fallback, enrolled-only contact defaults and expiry editing exceptions; keep hidden sections private and self-reported credentials clearly unverified.

## Delivery phases

| Phase | Deliverable | Boundary |
| --- | --- | --- |
| 1 | Rich teacher profiles: data, covers, editor, preview and public presentation | Private hidden sections, safe assets, bilingual mobile validation |
| 2 | Custom subjects, years/categories and guided setup/profile integration | Owner-scoped data, historical visibility, atomic pairing and public discovery |
| 3 | Initial approval bug, request lifecycle and admin actions | Database/API regression, private audit and transactional outbox foundation |
| 4 | Monthly access and expiry enforcement | Explicit role/action matrix; free grants; teacher/student/admin isolation |
| 5 | Email worker and fee-announcement readiness | Private outbox, fake SMTP tests, real delivery only after credentials |
| 6 | Remaining student/admin UX, recovery and group sharing | Bilingual mobile/browser checks and full integration review |

Each phase is divided into small Luna tasks, reviewed by Sol before moving on. Keep a dependency-aware plan: Auth creation, review and renewal event producers must integrate with the outbox without losing transactions. Create the private outbox/event scaffold in phase 3, before approval/renewal event producers are added, even though SMTP delivery is implemented later.

## Implementation plans

The user explicitly chose teacher profiles first, then custom subjects and years/student categories. Execute [the profile-first plan](../plans/2026-10-10-teacher-profile-first.md), followed by [the catalogue-second plan](../plans/2026-10-10-teacher-catalogue-second.md). Profiles initially use the existing catalogue; phase 2 connects custom choices. Phase 4 adds monthly eligibility to the already working public/profile/storage projections. Do not claim those later integrations completed during phase 1.

## Already shipped: preserve and verify

Teacher photo/bio/contact fields and enrolled-student-default privacy; guided group details → schedule → review/publish; reliable recurring lesson generation with previews/conflicts/excluded dates; duplicate-group/copy-lesson/reschedule/cancel/material actions; teacher dashboard; core discovery filters, next lesson and seats. Extend integration and test regressions rather than presenting these as new development.

## Later releases

Payment provider/checkout and collection; attendance; calendar export; schedule-change notifications and email/WhatsApp reminders; chat; ratings/reviews; waitlists; advanced analytics; profile video embeds, certificate verification and unrestricted page-builder customization. Introduce billing only after an explicit fee policy, provider, collection workflow and notice process are ready. Renewal and future-fee announcements in this release do not constitute payment processing.

## Completion evidence

Run appropriate unit, SQL/database, API, lint, typecheck, production-build and bilingual mobile/browser checks. Cover role/privacy boundaries, raw REST/RPC/Storage expiry bypasses, concurrent free renewal, calendar-month/DST cases, archived catalogue selections, SMTP failures, recovery callbacks, shared-link login return, rich-profile hidden sections and safe previews/cover uploads. Use disposable/local fixtures for broad tests; preserve production data and recorded migration history. Report exact failures and any live deployment access/email-provider limitation. Deliver reviewed changes in a draft PR with validation results; no payment or email-delivery success claim without evidence.
