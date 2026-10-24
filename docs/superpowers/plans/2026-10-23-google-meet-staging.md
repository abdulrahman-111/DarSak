# Google Meet staging implementation plan

> For agentic workers: use subagent-driven development; GPT-6 Luna implements scoped tasks and GPT-6.1 Sol reviews.

**Goal:** A free staging pilot of teacher-owned Google Meet lesson meetings, isolated from production.
**Architecture:** Separate protected Vercel project and Supabase backend. Teacher OAuth grants Calendar access; private encrypted credentials and durable meeting jobs use owner JWT RPCs. Accepted students receive only authorized current join links.
**Tech stack:** Existing Next.js, TypeScript, Supabase Postgres, built-in crypto/fetch.
**Spec:** ../specs/2026-10-23-google-meet-staging-design.md and exact RPC contract alongside it.

## Constraints

- No paid services, billing activation, production schema/credential changes, or AI work.
- Staging Supabase ref dmbepdjwjmuelqcfzjae; reject live ref ubrvjjibibqaiomrvwbd outside explicit production configuration.
- Preserve EN/AR, mobile usability and existing ownership/enrollment authorization.
- No tokens in public tables, logs or browser storage; private ciphertext only, independent server encryption key.
- No attendees or notification emails to students; meeting links inside authenticated lesson workspaces.

## Review focus

OAuth replay/cross-session callbacks; leaked credentials or join links; retries after ambiguous Google responses; cancellation/manual override during in-flight work; staging accidentally reaching production.

## Tasks

- [ ] Safety foundation: failing tests for backend destination/env mismatch and worker disablement; implement shared guards/docs/env example; focused tests and Sol review.
- [ ] Private data: create migration with CLI, implement ten exact RPCs and lifecycle triggers from contract; rollback fixtures for owner/accepted access, session state, leases/revisions/caps; Sol review before staging apply.
- [ ] Provider/OAuth: tests first for fixed origins, PKCE, verified userinfo, AES-GCM AAD, redacted errors and state replay; implement fixed Google adapter and callback; no live OAuth claim until real credentials/test consent work.
- [ ] Synchronization: mock insert-timeout/409 reconciliation, pending conference, revoked grant, cancellation/manual race and bounded retries; implement durable owner-JWT worker and safe teacher action kicks.
- [ ] UI: account integration and contextual lesson cards, manual fallback, status/retry/disconnect; EN/AR mobile checks; no global sidebar expansion.
- [ ] Release to staging only: focused tests, one full lint/typecheck/unit/build pass after freeze, SQL fixtures, independent security review, draft PR, protected staging deployment and browser workflow evidence. Keep production unchanged.
- [ ] Real-provider gate: configure separate Google Web OAuth client and Calendar API, exact callback/test users, then validate real personal-account consent and create/reschedule/cancel before enabling any production release.
