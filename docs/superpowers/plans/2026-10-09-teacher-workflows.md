# Teacher Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking. The user approved GPT-6 Luna for bounded implementation and Sol for exploration, task contracts, and reviews; preserve this execution method without another approval gate.

**Goal:** Make teacher setup, contacts, reliable scheduling, daily teaching, and student discovery usable in English and Arabic.

**Architecture:** Extend the current Server Actions and Supabase schema through additive migrations. Reuse persisted draft groups, put protected contacts in a separate RLS table, and centralize occurrence planning and mutation in PostgreSQL. Review each database contract before implementing its dependent UI.

**Tech Stack:** Next.js 16, React, TypeScript, Zod, Supabase Auth/PostgreSQL/Storage, Vitest, local API and SQL assertions.

**Spec:** [Approved design](../specs/2026-10-09-teacher-workflows-design.md).

## Global Constraints

- Work in the managed checkout `/workspace/Dars`, branch `codex/teacher-workflows`; preserve existing local backend, dependencies, environment files, and unrelated changes.
- Preserve English, Arabic, mobile usability, Africa/Cairo scheduling, teacher approval, live suspension checks, ownership, and accepted student membership rules.
- Contacts default to enrolled-only; public visibility is explicit opt-in. Contact email is separate from Auth email.
- Avatars use a separate private bucket, 2 MB JPEG/PNG/WebP only, and short-lived signed URLs. Lesson material access remains private.
- Same-day slots use Africa/Cairo; generation is inclusive with `until - from <= 90`. Reject missing/ambiguous local times; do not silently choose DST offsets.
- Keep the three-argument generation API, cancelled/completed occurrence identity, teacher-calendar transaction lock, and all-or-nothing conflict rollback.
- Attendance, new notifications, reminders, and calendar export are deferred. Deliver a draft PR; do not deploy or merge.
- Create migration files with the installed Supabase CLI after inspecting its help. Never modify already deployed migrations or reset user data. No dependency installation is planned.
- `anon` cannot execute existing `current_role`/ownership helpers. New public policies need a deliberately granted narrow helper; do not restore anonymous access to broad existing helpers.

## Review Focus

1. Anonymous/raw REST contact reads must enforce the same privacy as the page (Task 1).
2. Failed uploads and replaced avatars must not leak images or leave broken profile references (Task 3).
3. A preview can become stale: final generation and publishing must recheck under the calendar lock (Tasks 5 and 8).
4. Saving a draft twice or resuming after refresh must preserve its identity and saved schedule (Tasks 6 and 7).
5. Cairo day/DST boundaries and empty or failed queries must produce correct dashboard states (Tasks 4 and 9).

## File and interface boundaries

- `supabase/migrations/*`: additive contact, avatar, recurrence, exclusion, setup and discovery contracts; no application-only authorization.
- `src/features/teacher/profile-domain.ts`, `profile-data.ts`, `profile-actions.ts`, `profile-forms.tsx`: profile/contact validation, reads, mutations and UI.
- `src/features/teacher/setup-domain.ts`, `setup-data.ts`, `setup-actions.ts`, `setup-forms.tsx`: draft details, schedule and publishing.
- `src/features/teacher/generation-domain.ts`, `generation-actions.ts`, `generation-form.tsx`: date input, RPC calls and preview display; PostgreSQL supplies dates/timestamps.
- Existing `teacher/domain.ts`, `actions.ts`, `data.ts`: lesson shortcuts and dashboard; keep existing material operations intact.
- New routes: `/[locale]/teacher/profile`, `/[locale]/teachers/[id]`, `/[locale]/teacher/groups/new`, `/[locale]/teacher/groups/[id]/setup`.
- Existing group detail, teacher lessons, dashboard, public teachers/groups, shell and shared feedback components adapt in the owning tasks.
- SQL tests under `tests/database/`, real API tests in `tests/integration/api.mjs`, domain tests under `tests/unit/`; update the database runner when adding a suite.

Common action state: `{error?: string; success?: string; fieldErrors?: Record<string,string>; id?: string} | null`. Localize user-facing copy with `Locale = 'ar'|'en'`. UUID inputs are validated; never trust a hidden owner ID. DB mutation errors map to useful bilingual feedback; data errors are not empty states.

## Test and review cycle

For each task: add the named failing behavior test before implementation, run it and confirm the relevant failure, implement only the task contract, rerun its checks, and report modified files/results to Sol. Sol checks the diff and required security/scope invariants before the next dependent task. Commit only after the review gate; do not include `.env.local`, generated files or unrelated work. Parent maintains the progress ledger.

Use Node 22 via `PATH=/workspace/.dars-tools/node_modules/.bin:$PATH`. Unit command: `npm test -- tests/unit/FILE.test.ts`. UI checks: `npm run lint`, `npm run typecheck`, `npm run build`. API command: `bash /workspace/dars-check-api.sh` (local fixture mutations and cleanup). Host psql is unavailable; run SQL through the local database container with `docker exec -i supabase_db_private-teachers psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/database/FILE.sql`, verifying the current container name before running. New fixture SQL must use `BEGIN/ROLLBACK` and authenticated JWT settings. If sandbox permissions block Docker, the parent uses the approved local execution path; do not substitute remote databases.

## Task 0 — recurring generation prerequisite

**Files:** new migration; `tests/database/recurring_generation.sql`; `tests/database/run.sh`; `tests/integration/api.mjs`.
**Interface:** preserve `generate_lessons(p_group_id uuid,p_from date,p_until date) returns integer`.

- [ ] Add/run `generates_repeatable_occurrences`: Sunday 18:00–20:00, 2027-02-01 through 2027-02-14 returns 2, repeat returns 0, exact dates February 7/14 and UTC 16:00–18:00; current function fails `42P10`.
- [ ] Replace function in an additive migration using conflict target `WHERE slot_id IS NOT NULL AND local_date IS NOT NULL`. Preserve signature, auth, locks and existing behavior.
- [ ] Assert stable IDs, cancellation remains cancelled on repeat, overlapping ranges insert only missing dates, and concurrent same-range counts sum to exactly the expected occurrences. Run focused SQL and full local API; report results for review.

## Task 1 — protected contact and profile persistence contract

**Files:** new migration; `tests/database/teacher_contacts.sql`; API tests; `docs/implementation/SCHEMA_CONTRACT.md`.
**Produces:** `teacher_contacts(teacher_id uuid PRIMARY KEY REFERENCES teacher_profiles(id) ON DELETE CASCADE, phone_number text NULL, whatsapp_number text NULL, contact_email text NULL, visibility text NOT NULL DEFAULT 'enrolled' CHECK IN ('enrolled','public'))`. Normalize optional blanks to NULL. Phone/WhatsApp accept international E.164 (`+` and 8–15 digits, first digit nonzero); email max 254. Add database length/format constraints as well as UI validation.

`save_teacher_profile(p_full_name text,p_headline text,p_bio text,p_offering_ids uuid[],p_phone_number text,p_whatsapp_number text,p_contact_email text,p_visibility text) returns void` acts on `auth.uid()` only and atomically updates self profile, specialization set and contacts; active teacher required. Full name 2–100, headline <=160, bio <=5000, offering IDs distinct and valid. Never modify approval, role, status or Auth email.

- [ ] Add/run `contact_privacy_matrix`: anonymous/unrelated/pending/rejected/removed/cancelled/suspended deny enrolled contacts; accepted active student may read; suspended/unapproved teacher hidden; active owner/admin read/write; foreign teacher write denied; explicit public opt-in permits public reads.
- [ ] Add `can_read_teacher_contacts(p_teacher_id uuid) returns boolean`, stable SECURITY DEFINER with fixed search path and narrowly grant EXECUTE to anon/authenticated. It performs live role/status/approval/membership checks; policies call this helper, not anonymous-inaccessible existing helpers. Allow SELECT to anon/authenticated, writes only active owner/admin with USING and WITH CHECK. Keep public teacher RPC contact-free.
- [ ] Implement atomic save RPC, explicit grants/revokes and constraints. Verify raw `select=*`, spoofed teacher IDs, protected-field immutability and rejection rollback, not only rendered pages. Run SQL/API; update schema contract; Sol reviews before Task 2.

## Task 2 — profile editor and specialization selectors

**Files:** new profile domain/data/actions/forms modules; `src/app/[locale]/teacher/profile/page.tsx`; shell; `tests/unit/teacher-profile.test.ts`.
**Produces:** `teacherProfileSchema`, `TeacherProfileInput`; `teacherProfile(locale)` returns authorized viewer, editable profile/contacts/specializations/catalogue and error; `saveTeacherProfile(locale,state,form)` calls Task 1 RPC. Keep existing viewer/auth patterns.

- [ ] Add/run tests for blank optional contacts, malformed E.164/email, visibility default/enum, bounded bio/headline, and duplicate/invalid specialization IDs.
- [ ] Implement form with separate phone/WhatsApp/contact-email fields, enrolled default and explicit public choice, bilingual subject plus context labels, field errors, pending/success states. Saving contact email leaves login email unchanged. Add Profile navigation; teacher can edit before approval.
- [ ] Verify persistence after refresh, Arabic copy/direction, mobile widths, and failure preserves entered data. Run domain tests and lint/typecheck/build; report gate.

## Task 3 — private avatars and public teacher detail

**Files:** new avatar migration and SQL/API tests; profile domain/actions/data/forms; `src/app/[locale]/teachers/[id]/page.tsx`; public profile links; schema contract.
**Produces:** private bucket `teacher-avatars`, 2097152-byte JPEG/PNG/WebP cap; paths `${teacherId}/${randomUuid}.jpg|png|webp`. Profile avatar path constraint enforces own UUID prefix and supported format. `can_read_teacher_avatar(p_name text) returns boolean` permits active owner/admin or the currently referenced avatar of an approved active teacher, explicitly callable by anon/authenticated for the Storage policy. Initial INSERT requires active owner path; subsequent owner DELETE allows compensation even before metadata exists. No lesson bucket policy changes.

`uploadTeacherAvatar(locale,state,form)` uploads then saves `avatar_path`; remove new object if save fails; remove old object only after new reference commits. `removeTeacherAvatar(locale)` clears reference before removal. `publicTeacherDetail(id)` fetches safe public teacher fields/catalogue plus separately authorized contacts and a 300-second signed image URL; owner editor gets own signed image before approval.

- [ ] Add/run avatar access matrix, size/type/path mismatch, unreferenced public object denial, active/unapproved owner upload, suspended denial, and old/new metadata failure compensation tests.
- [ ] Implement bucket/policies and upload lifecycle; do not cache signed URLs or protected contacts globally. Show safe tel/wa.me/mailto links built from validated values and omit absent channels.
- [ ] Verify public teacher route excludes suspended/unapproved teachers and contacts default privacy, browser broken-image fallback, English/Arabic/mobile; run SQL/API and UI checks. Short-lived already-issued signed URLs remain usable until expiry; report this normal limit.

## Task 4 — authoritative candidates and strict Cairo conversion

**Files:** new generation migration; `tests/database/lesson_preview.sql`; API tests; schema contract.
**Produces:** unexposed `dars_private` schema; internal `cairo_local_instant(date,time) returns timestamptz` rejects nonexistent or multiple UTC matches; internal occurrence candidate function shared by later generation. No direct anon/authenticated schema/function access.

`group_lesson_exclusions(group_id uuid REFERENCES groups ON DELETE CASCADE,local_date date,PRIMARY KEY(group_id,local_date))`, owner/admin SELECT only, mutation via Task 5 RPC. `preview_lesson_generation(p_group_id uuid,p_from date,p_until date)` returns rows `{slot_id,local_date,start_time,end_time,starts_at,ends_at,state,conflict_lesson_id,conflict_group_id,conflict_title}`; state enum text `ready|already_generated|excluded|conflicting`. Excluded rows need no UTC conversion and may have NULL timestamps; already-generated identities retain stored timestamps. Preview authorization is owner/admin only and inserts nothing. Nonexcluded missing/ambiguous Cairo times reject the preview with the affected local date/time.

- [ ] Add/run tests for zero slots, inclusive single date, null/reversed/>90 range, exact Cairo winter/summer UTC conversion, missing and ambiguous transition hours, ownership, and unchanged lesson counts after preview.
- [ ] Implement shared candidates using saved exclusions, generated identity, null-safe comparisons, then active dated overlap across the teacher's owned groups. Already-generated takes precedence over exclusion; cancellation/completion never becomes a ready row. Use deterministic conflicting lesson selection and safe owner-only fields.
- [ ] Validate manual same-group NULL-slot overlap, cross-group overlap and adjacent endpoints, excluded DST date, and preview output. Run SQL/API; Sol reviews DST conversion and privilege boundaries.

## Task 5 — exclusions, generation and occurrence identity

**Files:** new migration; generation SQL/API tests; `create_lesson` replacement; schema contract.
**Consumes:** Task 4 shared candidates. **Produces:** `set_lesson_exclusions(p_group_id uuid,p_dates date[]) returns void` atomically replaces saved distinct dates under the teacher calendar lock, owner/admin only, max 366 dates, no NULL entries; direct table writes denied. Empty array explicitly clears holidays.

Keep `generate_lessons(uuid,date,date) returns integer`, now honoring saved exclusions and strict candidate rules. Final generation recomputes while locked; any conflicting row rejects entire batch. Existing insert predicate fix remains. Updating a generated lesson via `create_lesson` preserves original `slot_id/local_date`; manual lessons continue deriving local date from new start.

- [ ] Add/run tests for exclusion persistence/clear, excluded occurrence not inserted, concurrent exclusion/generation serialization, null-safe manual overlap, cancelled/completed identity, stale preview, parallel generation, and conflict after an earlier ready row causing zero partial inserts.
- [ ] Implement wrappers and occurrence-preserving lesson update, explicit ACLs, date bounds and locking; no browser-provided timestamps used in generation.
- [ ] Verify move-and-repeat leaves one original generated identity at the new actual time and does not recreate old date. Run SQL/API; review before publish integration.

## Task 6 — resumable draft details

**Files:** new setup domain/data/actions/forms modules; new `/teacher/groups/new` and `/teacher/groups/[id]/setup` routes; existing group list; `tests/unit/teacher-setup.test.ts`.
**Produces:** `groupDetailsSchema`; `saveGroupDraft(locale,state,form)` returns saved `id`/localized errors. Always creates draft using authenticated teacher ID; update explicitly scopes ID/owner and checks affected row. `teacherGroupSetup(locale,id)` returns owned group, catalogue, slots, exclusions and errors. Steps use `?step=details|schedule|review`; unknown step normalizes to details.

- [ ] Add/run validators for details and malformed IDs; behavior test save/repeat-save/resume retains one group ID and draft visibility is owner-only.
- [ ] Implement valid-details persistence, redirect to persisted setup, capacity default 10, bilingual subject/context selectors, edit/resume links; preserve current group list information and published detail routes.
- [ ] Verify refresh/back/navigation, unapproved teacher draft, errors preserve state, empty catalogue explanation and nonexistent/foreign ID handling. Run unit/UI checks; review gate.

## Task 7 — weekly schedule and lesson preview UI

**Files:** setup forms/actions; new generation domain/actions/form modules; group detail; existing schedule RPC additive delete migration if needed; unit and SQL/API tests.
**Produces:** `delete_schedule_slot(p_group_id uuid,p_slot_id uuid) returns void`, owner/admin/calendar lock, same-group check, reject deletion when any generated dated lesson references slot. Continue existing `save_schedule_slot` for insert/update; no direct writes. Never detach generated identity by silently deleting a referenced slot.

`generationRangeSchema` uses YYYY-MM-DD valid calendar dates and inclusive <=90-day difference. `previewLessons(locale,groupId,from,until)` returns Task 4 rows/localized error. `saveLessonExclusions(locale,groupId,dates)` and `confirmLessonGeneration(locale,groupId,from,until)` call Task 5 RPCs, returning generated count. Saved excluded dates appear in an editable list; preview changes only after save and refresh. Reuse preview component in group setup and existing group detail.

- [ ] Add/run tests for malformed dates, same-day/reversed/boundary ranges, foreign/referenced slot removal, and draft resume retaining multiple same-day nonoverlapping slots.
- [ ] Implement schedule add/edit/remove, inline conflict feedback and clear existing-dated-lesson restrictions. Add preview table/cards with four states, totals, exclusion editing and owner-only conflict edit links; blocked preview cannot confirm.
- [ ] Verify zero slots, saved holidays, repeat generation count, server stale/conflict error refresh, Arabic/mobile and pending/double-click prevention. Run unit/SQL/API/UI checks; review gate.

## Task 8 — guarded atomic publication and review step

**Files:** new publish migration; setup actions/forms/review route; publish SQL/API tests; schema contract.
**Produces:** `publish_group(p_group_id uuid,p_from date DEFAULT NULL,p_until date DEFAULT NULL) returns integer`. Owner/admin only, active approved teacher, nonblank valid name/offering/capacity and >=1 slot. Range must be both NULL or both supplied. Lock teacher calendar then group; optional generation calls Task 5 and commits with status published. Return generated count (0 without range). Guard direct transition/INSERT to published with equivalent prerequisites; retain admin authorization without bypassing teacher approval/schedule requirements. No trigger recursively calls publish RPC.

- [ ] Add/run tests for no slots/unapproved teacher, student/foreign owner, direct Data API bypass, successful publish without generation, successful publish with range, and generation conflict leaving draft/status/lessons unchanged.
- [ ] Implement review summary/edit links, optional range/shared preview, Publish pending and success redirect. All final prerequisites are server-side; keep entered data on rejected publish.
- [ ] Run SQL/API/UI checks. Verify old published group edits do not change dated lessons, and fixture/test creation now supplies valid slots before publishing; review gate.

## Task 9 — dashboard data and actionable UI

**Files:** `teacher/data.ts`; new dashboard domain helper if needed; teacher dashboard and lessons pages; `tests/unit/teacher-dashboard.test.ts`.
**Produces:** `teacherOverview(locale)` returns `todayLessons`, `upcomingLessons`, actual counts, `pendingRequests`, `setupTasks`, `me`, and explicit errors. Fetch owned groups once and filter all lesson/enrollment lists by those IDs. Today means starts within Cairo midnight-to-midnight; ongoing overnight lessons may appear if their interval intersects today. Upcoming scheduled only; counts do not equal preview limits. Setup tasks: incomplete public profile (headline/bio/no specialization), approval pending, draft, no slots, no upcoming scheduled lessons; phone/email/photo are optional and never required for completeness.

- [ ] Add/run Cairo-day boundary/DST, cancelled exclusion, limited-list count and setup-task fixtures; failing query must yield an error state rather than empty success.
- [ ] Implement Today, requests with existing decision RPCs, setup resume links, secondary upcoming list, Create group and Add lesson. Add lesson links to teacher lesson page with owned-group selection rather than assuming an arbitrary group.
- [ ] Verify newly published group updates dashboard through path invalidation, empty/error states and Arabic/mobile; run unit/UI/API checks; first-release review gate.

## Task 10 — duplicate/copy backend and teaching shortcuts

**Files:** new shortcut migration if atomic operations needed; teacher actions/domain; group detail/lesson pages/forms; API/domain tests; schema contract.
**Produces:** `duplicate_group(p_group_id uuid) returns uuid` creates owned draft copying details only, without enrollments, lessons, exclusions or active slots. The setup route accepts `?copyScheduleFrom=SOURCE_UUID`; fetches the authorized source schedule as an unsaved proposed schedule, requiring adjustment before saving through existing overlap checks. Thus refresh retains the original source proposal without adding a second draft model or bypassing conflicts. `copyLesson(locale,sourceLessonId,targetGroupId,startsAt,endsAt)` reads only owned source title/notes and calls `create_lesson`; no file/material duplication. Reuse existing reschedule/status/material operations.

- [ ] Add/run foreign-source denial, copied draft has no membership/history/slots, unchanged source, proposed overlapping schedule rejected until adjusted, new lesson ID/conflict validation, and generated reschedule identity tests.
- [ ] Implement Duplicate group, Copy lesson, reschedule/cancel/material shortcuts with clear confirmation only for cancellation/deletion; defaults never silently copy student/private file data.
- [ ] Verify locale/mobile/error feedback and current private material access; run domain/API/UI checks; separate phase review.

## Task 11 — safe discovery database projection

**Files:** new discovery migration; platform data/types; student data; SQL/API tests; schema contract.
**Produces:** `discover_groups(p_subject_id uuid DEFAULT NULL,p_node_id uuid DEFAULT NULL,p_teacher_id uuid DEFAULT NULL,p_weekday int DEFAULT NULL,p_has_seats boolean DEFAULT false,p_query text DEFAULT '',p_offset int DEFAULT 0,p_limit int DEFAULT 12)` returns existing safe `public_groups` fields plus weekday array and `next_lesson_at`. Validate limit 1..50, offset >=0, weekday 0..6, bounded query. Academic filter includes descendants; published/approved/active only. Safe next lesson exposes start timestamp of next scheduled occurrence, never lesson ID/title/notes/material/roster. Counts keep existing enrollment semantics. Keep `public_groups()` and `public_teachers()` compatible.

- [ ] Add/run every filter and combinations, empty query, pagination, full groups, no-next-lesson, and suspended/unapproved/draft filtering; test output keys for absence of protected fields.
- [ ] Implement explicit narrow anonymous/authenticated ACLs and safe projection. Update `publicGroups` mappings/types to retain bilingual context, seats and teacher/profile links; avoid caller-sensitive private caching.
- [ ] Run SQL/API/typecheck and review projection before Task 12.

## Task 12 — discovery filters and enrollment-focused group pages

**Files:** public teachers browse, group page, public copy/cards; platform/student data; domain/UI tests where meaningful.
**Consumes:** Task 11 projection; Task 3 teacher detail route.

- [ ] Add/run input normalization tests for invalid UUID/weekday/page filters; browser behavior check filtering persists in URL and locale switch preserves supported filters.
- [ ] Add subject/context/teacher/day/seats controls with readable localized labels, reset/results/pagination; cards show available seats and next lesson; group page displays next safe lesson summary and current enrollment action/state.
- [ ] Verify anonymous login-to-enroll, pending/accepted/full states, rejected/cancelled retry, Arabic/mobile and no protected projection. Run API/UI checks; separate phase review.

## Task 13 — cross-flow UX, whole-branch verification and draft PR

**Files:** affected route loading/error boundaries, shared feedback/shell/copy/CSS as required; tests only for behavior not already covered; current progress/schema/design docs.

- [ ] Walk approved flows at desktop/mobile in English/Arabic: profile/photo/contact privacy; draft refresh and steps; conflict/exclusion preview; publication; dashboard; shortcuts; discovery/enrollment. Check labels, keyboard focus, RTL arrows, loading, field errors and success announcements. Fix concrete findings without expanding product scope.
- [ ] Run all unit, SQL and local API suites, lint/typecheck/build; verify fresh additive migrations in a disposable clean DB and existing local schema. Confirm no user data reset, no secrets/unrelated changes, no new attendance/notification/calendar implementation. Record unavailable browser/clean-DB checks explicitly rather than claiming success.
- [ ] Sol reviews whole branch and phase traceability; update ledger with exact final evidence. Create the authorized draft PR using the final scope/validation, link it to this chat, do not merge/deploy.

## Plan self-review

All approved phases map to Tasks 0–13. Profile/contact/avatar security is Tasks 1–3; draft details/schedule/publication is Tasks 6–8; database preview/generation/exclusions is Tasks 4–5 and UI Task 7; dashboard Task 9; later shortcuts/discovery/UX Tasks 10–13. Shared names/types and task dependencies are explicit. The five Review Focus conditions have named checks in their owning tasks. Product implementation is already authorized; this plan adds no further confirmation gate.
