# Dars teacher workflows — approved design

Date: 2026-10-09
Status: approved by the user on 2026-10-09; implementation is authorized.
Source: `docs/FEATURE_RECOMMENDATIONS.md` and the user's requested phase order.
Exploration and design: Sol. Implementation: GPT-6 Luna, approved by the user
because GPT-5.6 Luna is unavailable. Sol reviews each completed task.

## Intended outcome

A teacher can complete their profile, create a saved group draft, set its weekly
schedule, inspect the proposed lessons, and publish a group ready for enrollment.
The dashboard makes today's work and incomplete setup immediately actionable.
English, Arabic, mobile usability, Africa/Cairo scheduling, teacher approval,
live suspension checks, ownership, and student membership rules remain required.

## Recommended approach

Extend the existing Next.js Server Actions and Supabase tables/RPCs through
additive migrations. Reuse groups with `status = 'draft'` and schedule slots as
the saved draft; avoid a second draft data model. Keep lesson candidate calculation
and final conflict checks in PostgreSQL so browser previews and inserts agree.

A browser-only wizard and preview would be faster to add but could disagree with
database timezone/conflict rules and lose drafts. A replacement scheduling subsystem
would require a much larger migration. Extending the current flows best preserves
authorization and keeps Luna's tasks small and reviewable.

## Phase 0 — recurring lesson regression

The local API suite reproduces PostgreSQL `42P10` after 31 successful assertions.
`lessons_generated_once` is unique only where `slot_id IS NOT NULL AND local_date
IS NOT NULL`; `generate_lessons` omits that predicate from its conflict target.

Add a migration replacing the function with a conflict target matching that
predicate. Preserve its signature, teacher-calendar transaction lock, actor checks,
date-range bound, and transaction rollback. Do not edit deployed migrations.

Add a focused database regression exercising real generation, repeat generation,
and cancelled occurrences: repeated calls insert no duplicates and cannot restore
a cancelled occurrence. Extend the existing API regression to check dates, Cairo
timestamps, stable row IDs, overlapping ranges, and parallel identical generation.

## Phase 1 — teacher profile and protected contact details

Provide a teacher profile editor and public teacher detail page, reusing existing
bio, headline, avatar path, and `teacher_specializations` fields. Subject choices
use the bilingual academic catalogue. Add a constrained image upload bucket with
teacher-owned random object paths, a 2 MB JPEG/PNG/WebP limit, and no access to
lesson materials. Use a separate private bucket and short-lived signed URLs for
approved, active teachers' referenced images. Permit the active owner to upload
before approval; compensate metadata-save failures and remove replaced images.

Store phone, WhatsApp, separate contact email, and contact visibility in a new
RLS-protected contact table. Default visibility to `enrolled`; the teacher can
explicitly select `public`. Never derive contact email from the login email.
Approved teacher profiles are already broadly readable, so adding sensitive
columns there and hiding them in the UI would expose them through the Data API.

The active teacher can edit their own contact row; administrators retain their existing
authority. Students may read enrolled-only contacts only with a current accepted
enrollment in that teacher's group and an active account, and the teacher must be
approved and active for both enrolled-only and public reads. Pending, removed,
cancelled, suspended, unrelated, and anonymous viewers cannot read them. Public
contacts require explicit opt-in and an approved, active teacher. Contact updates
cannot change approval, role, or account status. Avoid shared caching of protected
contact responses. Validate lengths, phone values, email and safe contact links.

Regression coverage includes raw API reads, ownership, enrolled/default/public
visibility, membership removal, and suspension; UI tests alone are insufficient.

## Phase 2 — guided group creation

The flow is **Group details → Weekly schedule → Review and publish**.

- Details: name, description, readable subject and academic-context selectors,
  capacity (existing default 10), and location. Save a database draft and return
  its ID so the flow can resume after navigation or refresh.
- Weekly schedule: named weekdays, Cairo time, multiple same-day slots, and
  existing server-side overlap validation. Keep draft content when validation fails.
- Review: show all details and weekly slots, with edit links. Require at least
  one valid slot and an approved, active teacher before publishing. Offer a
  finite optional lesson range; selecting it opens the same preview as Phase 3.

Publishing runs through a narrow RPC that rechecks ownership, approval, required
details and schedule under the teacher-calendar lock. If lesson generation is
selected, generation and publication commit together; a conflict leaves the draft
available for correction. Protect equivalent direct status writes so publication
rules cannot be bypassed through the Data API. Retain administrator authorization.
Published-group edits do not silently modify existing dated lessons.

## Phase 3 — date preview, conflicts, and excluded dates

Choose an inclusive date range within the existing limit (`until - from <= 90`),
with individual Cairo-local dates to exclude. Save exclusions on the group so
future runs retain holidays, and allow the owner to remove them explicitly.
The preview lists each weekly
occurrence, local date/time, and state: ready, already generated, excluded, or
conflicting. Only the owner/admin preview can list the conflicting lesson; give
an edit/reschedule action.
No lessons are inserted by previewing.

Use a shared database candidate calculation for preview and generation. The
existing three-argument generation RPC remains compatible and delegates to the
same implementation using saved group exclusions, with no additional per-call
exclusions. Validate null/reversed/oversized ranges
and excluded dates at the server boundary. Recheck conflicts under the existing
calendar lock on confirmation; a stale preview cannot permit overlapping inserts.
Reject missing or ambiguous Cairo local times in both preview and generation,
matching the existing manual-entry rule rather than silently choosing a DST offset.
Block the batch on any unresolved conflict and roll back the entire batch.

Use null-safe occurrence identity when checking overlap. Sol found that the
current `NOT(group_id = ... AND slot_id = ... AND local_date = ...)` predicate
can evaluate to NULL for manually created lessons, which have no slot ID.
Regression coverage includes manual and cross-group overlap, adjacent slots,
cancelled/completed occurrences, exclusions, repeat generation, Cairo DST, stale
preview, and rollback. Preserve every generated lesson's original slot_id and
local_date identity when rescheduling or cancelling so generation cannot
unexpectedly recreate the original occurrence.

## Phase 4 — actionable teacher dashboard

Lead with today's scheduled lessons in Africa/Cairo, pending enrollment requests,
and unfinished setup (profile, approval state, drafts, missing slots/lessons).
Keep upcoming lessons as a secondary section. Add clear Create group and Add
lesson actions, resume-draft links, and request decisions using existing RPCs.
Separate actual totals from limited preview lists. Show query errors as errors;
do not turn failed requests into misleading empty states. Empty screens explain
the next action. Test Cairo-day boundaries and actionable setup detection.

## Subsequent separate phases

5. Everyday teaching: Duplicate group creates a new draft with copied details
   and a proposed schedule, with no enrollments or lesson history. The existing
   overlap checks include draft slots, so that phase must define how copied times
   are adjusted before activation; it cannot simply insert overlapping slots.
   Copy lesson creates a new lesson through
   conflict validation. Expose reschedule, cancel, and material-upload shortcuts
   through existing authorized operations; retain private Storage access.
6. Discovery: subject, academic context/grade, teacher, weekday and available-seat
   filters; safe next-lesson summaries and clear enrollment states. Public queries
   must not reveal lesson notes, materials, student identities, or private contacts.
7. UX consistency: mobile navigation, Arabic RTL layout, inline validation,
   pending/success feedback, loading states, and useful empty/error states across
   affected routes. New features receive these basics in their own phase too.

Attendance, new schedule-change notifications, calendar export, and delivery
reminders are deferred. Existing notification behavior remains in place.

## Small implementation tasks and review gates

For each phase, Sol prepares concrete task instructions with owned files,
acceptance criteria, and validation. Delegate one database/API boundary or one
small UI flow at a time to Luna. Review database changes before the dependent UI.
Each task reports modified files, checks executed, and unresolved failures; Sol
reviews the diff and requests corrections before progressing.

Suggested boundaries: recurrence migration/regression; contact schema/security
tests; profile editor; avatar upload/detail page; draft persistence/selectors;
weekly step; publish RPC/review step; generation candidate/preview RPC; confirmed
generation/exclusion RPC; preview UI; dashboard data; dashboard UI. Later phases
use similarly bounded tasks. Keep commits and validation attributable to a phase.

## Validation and delivery

Run meaningful unit tests, transaction-scoped database assertions, real local
Supabase API tests (including concurrent enrollment capacity and authorization),
lint, typecheck, and production build. Check English/Arabic and mobile workflows
in a browser when available. Verify migrations against both the existing local
schema and a disposable clean database; do not reset user data without need.

Use saved environment helpers `/workspace/dars-*.sh` and Node 22 from
`/workspace/.dars-tools/node_modules/.bin`. The existing local Supabase stack is
healthy. No AGENTS.md or CLAUDE.md was present during exploration. Existing old
progress notes contain session handles from a previous implementation; they are
historical, not evidence of active workers.

Deliver a draft pull request with phased changes, validation results, and explicit
failures or checks that could not run. Attach the PR to this chat. Do not deploy
or merge as part of this task.

## Baseline evidence (before implementation)

| Check | Result |
| --- | --- |
| Unit | 20 tests passed across 2 files |
| Database foundation | Passed against local Supabase |
| Database security hardening | Passed against local Supabase |
| API | 31 assertions passed, then generation failed with `42P10` |
| Lint | Passed |
| Typecheck | Passed |
| Production build | Passed |

Database checks used the local container's psql because host psql is unavailable.
These results are a baseline, not validation of proposed changes.
