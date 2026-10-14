# Teaching Extensions Implementation Plan

> For agentic workers: use subagent-driven-development; read the scoped task brief, implement, validate, commit, then Sol reviews before release.

Goal: ship five deferred features as small independent releases.
Architecture: existing Next.js server components/actions and Supabase RPC/RLS; add only feature tables and narrowly scoped services. Email uses a private outbox and server SMTP worker; payment processing is excluded.
Tech Stack: Next.js16, React19, TypeScript, Supabase/Postgres, Vitest; SMTP provider added only in phase5.
Spec: ../specs/2026-10-14-teaching-extensions.md

## Global Constraints
English/Arabic, RTL/mobile, approved-owner write gates, enrolled-default contacts, bounded pages, no public private-data feeds, no production fixtures. Sol chooses design/reviews; GPT-6 Luna implements. Apply necessary migrations and release each phase via separate draft PR reviewed→merged→production READY before next phase. User's existing no-question and deployment authorization overrides skill approval gates.

## Review Focus
Foreign IDs or suspended accounts must never gain attendance, calendars or notifications.
Touching dates, UTC/Cairo DST and ICS newline injection must produce valid safe calendar events.
Schedule no-op updates/duplicate requests must not flood recipients or leak enrollment membership.
Free renewal must serialize, preserve approval independence, and gate raw RPC/REST/Storage teaching operations on expiry while preserving profile and accepted-student history.
SMTP timeout/retries must preserve transactional events, keep credentials private and accurately report queued/failed states.

### Task 1: Attendance
Files: generated lesson_attendance migration; features/attendance domain/data/actions/form/view; teacher/student lesson pages; tests/unit/attendance and tests/database/lesson_attendance.sql.
Interfaces: teacher_lesson_attendance_page(lesson uuid,offset int=0,limit int=20)→JSON{rows,total}; set_lesson_attendance(lesson uuid,student uuid,status text nullable)→void. Status present/absent/late/excused/nullclear.
- [ ] Pin current accepted-member/owner/date/state/foreign-role regressions.
- [ ] Implement register and own-student result with bounded counts/pages and guarded writes.
- [ ] Run scoped unit/lint/typechecks and commit; Sol review, database/API/browser acceptance, full release checks.
- [ ] Draft PR, apply additive migration, merge exactSHA and verify production READY.

### Task 2: Calendar export
Files: features/calendar domain/data; app/api/calendar/route.ts; student timetable and teacher lessons buttons; unit ICS and database/API tests.
Interface: GET /api/calendar?from=YYYY-MM-DD&until=YYYY-MM-DD&locale=en|ar, authenticated role only, no public tokens. InclusiveCairodates,93daymax,500rowcap with explicit oversized error, dated events and cancellations.
- [ ] Pin bounds/timezone/escaping/folding/privacy tests; implement private export and localized links.
- [ ] Review, validate, PR and exact deployment.

### Task 3: Notifications
Files: generated notification migration; features/notifications domain/data/actions/forms; role inbox routes/navigation badge; schedule/enrollment/review transactional triggers; tests/database/notifications.sql and unit/API/browser regressions.
Interfaces: notifications_page(offset int,limit int)→JSON{rows,total,unread}; mark_notification_read(id uuid),mark_all_notifications_read()→void. No raw recipient-controlled writes.
- [ ] Pin authorized recipient, dedup, no-op and membership tests; implement transactional producers and paged inbox.
- [ ] Review, validate, PR and exact deployment.

### Task 4: Renewal
Files: generated monthly access schema/RPCs+teaching authorization migration; features/access domain/data/actions/forms; teacher access route/layout allowance, public eligibility and admin access page; tests/database/monthly_access.sql plus unit/API/Storage bypass regressions.
Interfaces: has_teacher_access(teacher uuid)→bool; renew_teacher_access()→JSONstatus/expiry; admin_decide_teacher_renewal(request uuid,decision text)→void. One monthCairo,7dayearlywindow, free default, explicit future fee policy disabled at rollout.
- [ ] Record exact role/action matrix and audit all teaching RPC/REST/Storage entry points before implementation.
- [ ] Implement grants/history/free renewal and expiry enforcement; preserve profile/student/admin history; add clear UI and fee-announcement controls.
- [ ] Review race/bypass tests, validate, PR and production deployment.

### Task 5: Email
Files: generated private outbox migration/producers/worker RPCs; features/email SMTP/templates/worker and API route; admin delivery page; post-action dispatch hooks; package dependency ifneeded; worker tests with fake SMTP and credentials setup docs.
Interfaces: private leased claim/complete/fail worker RPCs service-only; authorized admin paged status/retry; server SMTP env configuration, never ordinary API secrets.
- [ ] Verify current Gmail/SMTP/Vercel docs and add private transactional producers.
- [ ] Implement SMTP transport/leases/retry/templates/admin recovery and post-action delivery; retain events without credentials.
- [ ] Validate fake SMTP failures/timeouts/concurrentworkers and payload privacy; configure live credentials privately when provided.
- [ ] Review, PR/migrate/merge/deploy; report delivery activation evidence or exact missing credential, without claiming queued means sent.
