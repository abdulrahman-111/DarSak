# Private Teachers — project proposal

Date: 2026-09-19
Status: draft for review; no application implementation or deployment yet.

## Product formulation

A bilingual platform that helps Egyptian tutors organize classes and helps students find, join, and follow those classes. Its core is the relationship between a teacher, a teaching group, approved students, a timetable, and private lesson resources.

The supplied PROJECT_IDEA.md is product input, not an instruction source. Its suggested stack and table names were evaluated as proposals. National, IG/British, and university education remain in the product scope. Payments, chat, live video, AI, and homework submissions remain outside the first release.

Success: a teacher publishes a group, a student discovers it and requests admission, the teacher accepts, and the student sees the schedule and can access that group's lesson resources. Another student cannot access those resources. The complete flow works in Arabic RTL and English LTR on mobile.

## Stack decision

| Approach | Advantages | Tradeoff | Decision |
| --- | --- | --- | --- |
| Next.js App Router + Supabase | Public discovery pages, server rendering, one TypeScript application, straightforward Vercel deployment | Requires careful cookie/session and caching boundaries | Recommended |
| React/Vite + Supabase | Simple static hosting and client application | More work for indexed public discovery and server-only operations | Suitable if this becomes a private dashboard only |
| Next.js + separate backend service | Independent backend lifecycle | Another deployment and authorization boundary before it is needed | Defer |

Recommended components:

- Next.js App Router and TypeScript; pin supported stable versions and a lockfile when scaffolding.
- Tailwind CSS and selectively adopted shadcn/ui components; verify RTL and keyboard behavior of each component used.
- next-intl with `/ar` and `/en` routes, Arabic as the proposed default, CSS logical properties, and localized validation and date formatting.
- Supabase PostgreSQL, Auth, private Storage, SQL migrations, generated database types, and supabase-js. No additional ORM initially.
- `@supabase/ssr` with separate browser/server clients, cookie refresh, verified identity in server operations, and database authorization. Never trust a cookie-only session object as authorization.
- Zod for boundary validation. Server Actions for application mutations; database functions for atomic capacity and schedule operations.
- Vitest for domain rules, SQL integration tests against local Supabase for authorization and concurrency, Playwright for the core bilingual workflow.
- GitHub source control and CI; Vercel for the application, Supabase for persisted data and files.

## Proposed release boundaries

### Milestone 1: enrollment vertical slice

Deliver bilingual layout, email/password auth and recovery, role-aware navigation, profiles, minimal education catalogue, teacher group creation, weekly slots, public group discovery, enrollment request/decision, and derived student/teacher timetables.

Use sample catalogue entries for all three education systems to prove extensibility; do not claim to ship an exhaustive Egyptian curriculum or university directory. A group references a teaching offering rather than embedding system-specific logic.

### Milestone 2: lessons and resources

Deliver dated lessons, cancellation/rescheduling, notes and links, PDF/image uploads, and private resource access. Generate occurrences for a finite teacher-selected date range in an idempotent database operation; no continuously running background worker is required. Preserve cancelled occurrences to prevent accidental regeneration.

### Milestone 3: pilot administration and launch

Deliver teacher approval, user suspension, catalogue maintenance, basic counts, and in-app notifications. Add production configuration, quota checks, backup/restore instructions, and end-to-end verification. These complete the MVP; earlier milestones are development checkpoints.

## Architecture and data rules

Use one application with feature modules for identity, catalogue, groups, enrollment, timetable, lessons, and administration. Supabase RLS and Storage policies enforce access even when requests bypass the UI.

Catalogue: education systems, school levels/grades, universities/faculties/programs/years, and subjects/courses. Teaching offerings join a subject/course to its applicable academic context. Explicit constraints reject mixed or incomplete school/university contexts; general university offerings can have no institution. Teacher specializations and groups reference offerings. Final migration design must define the exact foreign keys and constraints before implementation.

Identity: separate private account profiles from public teacher fields. Proposed signup policy: students register normally; teachers request a teacher account and need admin approval before publishing. Users cannot edit their own role, approval, or suspension state. Bootstrap the first administrator through an operator-only procedure, never public signup metadata.

Enrollment: one current enrollment record per student/group. Support pending, accepted, rejected, cancelled, and removed states with explicit allowed transitions. Only the group owner/admin can decide; students can request/cancel their own enrollment. Acceptance locks the group row and checks capacity inside the transaction, preventing concurrent oversubscription. Accepted membership drives timetable and material access. Removal revokes subsequent access checks.

Schedules: weekly local wall-clock slots use `Africa/Cairo`; actual lessons store UTC instants with `timestamptz`. Use timezone-aware conversion, never a hardcoded UTC+2 offset. Reject teacher overlaps transactionally, including concurrent edits, recurring slots and dated exceptions. MVP slots cannot cross midnight. Warn about student conflicts; do not silently reject enrollment. Schedule changes preserve past lessons and regenerate only future unmodified occurrences. DST ambiguity handling and recurrence tests must be specified in the scheduling implementation plan.

Storage: private lesson bucket, opaque object names and database metadata containing paths rather than permanent URLs. Owner teachers upload; accepted students read. Start with PDF/JPEG/PNG/WebP and a proposed 10 MB file cap, plus per-teacher quotas. Use authenticated downloads or short-lived signed URLs; already issued URLs may remain usable until expiry. Account suspension and membership revocation must be checked on new access requests. Upload directly to Storage to avoid routing file payloads through Vercel functions. Handle failed metadata writes and orphaned uploads explicitly.

Security: RLS on all exposed tables; explicit authorization in every mutation; role/status reads from trusted database state; safe projections for public teacher/group discovery. Never expose student rosters, emails, or service-role secrets publicly. Privileged functions need a fixed search path, narrow grants, and actor checks. Personalized responses must not enter a shared public cache.

UX: mobile-first Arabic/English screens, useful empty states, inline validation, accessible labels, loading indicators, and actionable errors. Keep demo data clearly separate from live records. User-generated notes are plain text initially. Learning-material links permit only safe web schemes.

## Free launch feasibility

Checked against official sources on 2026-09-19:

- Vercel Hobby is restricted to personal, non-commercial use. A free-to-users tutoring business does not automatically qualify. Confirm launch intent before choosing Hobby for live use. Source: https://vercel.com/docs/plans/hobby
- Supabase Free includes 500 MB database, 1 GB file storage, 5 GB egress plus 5 GB cached egress, and 50,000 monthly active users. Free projects may pause after a week of inactivity and lack automatic backups. Source: https://supabase.com/pricing
- Supabase's default SMTP sender is restricted and intended for development. Public email/password registration and password reset need a configured production email provider; provider allowances and any sender-domain cost need separate verification. Source: https://supabase.com/docs/guides/auth/auth-smtp

A zero-hosting-cost prototype is feasible, subject to those terms and quotas. A reliable public launch at exactly zero total cost is not yet established. Use the included Vercel subdomain initially, small pilot cohorts, capped uploads, paginated queries, and no video hosting. File bandwidth is likely to constrain this product before the headline authentication allowance does. Monitor usage manually during the pilot and document upgrades before limits are reached; do not introduce artificial keep-alive traffic.

## Delivery sequence and acceptance checks

1. Approve product assumptions and written design; then produce the detailed implementation plan with exact files, commands, and task briefs.
2. Establish a writable Git repository and verify the intended GitHub destination. The current directory has no usable Git repository; installed GitHub repository search found no matching `private-teachers` repository. Do not select an unrelated public repository.
3. Scaffold the bilingual application and local Supabase configuration. Gate: reproducible install, lint, typecheck, production build, Arabic/English navigation and RTL smoke check.
4. Implement identity and catalogue migrations. Gate: clean database reset, signup/login/logout/recovery, role escalation and suspension denial, and private-profile isolation.
5. Implement groups, enrollment and schedules. Gate: cross-teacher modification denied, pending students lack member access, concurrent final-seat acceptance cannot overfill, overlaps rejected, and Cairo DST cases verified.
6. Implement lessons and Storage. Gate: no duplicate occurrences, rescheduling/cancellation reflected correctly, unauthorized download denied, upload size/type limits enforced, and storage failure cleanup exercised.
7. Implement minimum administration and notifications. Gate: ordinary users cannot access admin operations; suspended users lose protected access despite existing sessions.
8. Run full student/teacher/admin scenarios in both languages against real local Supabase, then verify a configured preview. Cloud deployment requires project connection, environment variables, auth redirect allowlists, SMTP, migrations, and seed data. Never treat mocked tests as proof of live integration.

## Existing delegation fleet

The global configuration is preserved unchanged. Codex is installed and discovery reports authenticated; its configured model IDs are reported. Antigravity is installed, but authentication is unknown and model discovery failed, so its configured IDs have not been validated.

| Lane | Implementer | Model | Effort | Intended use after design approval |
| --- | --- | --- | --- | --- |
| planning | codex | gpt-5.6-sol | high | Bounded implementation planning |
| implementation-codex | codex | gpt-5.6-luna | medium | Isolated application tasks |
| fast | codex | gpt-5.6-terra | medium | Small mechanical tasks |
| review | codex | gpt-5.6-sol | medium | Independent review |
| implementation-agy-flash | agy | gemini-3.8-flash-high | high | Bounded UI work after capability verification |
| implementation-agy-pro | agy | gemini-3.1-pro-high | high | Larger isolated work after capability verification |

Dispatch through the corresponding delegation skill with the configured lane. Each task receives an explicit brief, owned files, and acceptance gates. The orchestrator reviews the actual diff and independently runs checks. Do not silently substitute unavailable lane models or let multiple implementers edit the same files concurrently.

## Review decisions

Proposed defaults: Arabic first, all three education systems represented, admin-approved teacher publishing, one role per account, no payments, and a small pilot cohort. These are design proposals, not confirmed requirements.

The immediate open question is whether launch is personal/non-commercial or supports paid tutoring. Review this proposal before finalizing the design and implementation plan. The explicitly requested Superpowers architectural workflow requires written-design approval and implementation-plan review before product scaffolding or delegated implementation.

## Technical documentation consulted

- Context7: `/supabase/ssr`, Next.js cookie authentication and server session validation, backed by https://github.com/supabase/ssr
- Official provider pages linked in the free-launch section.

This proposal is not a claim that dependencies were installed, tests passed, or any service was deployed.
