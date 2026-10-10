# Teacher customization, approval, email and student/admin UX

Date: 2026-10-10. Status: expanded concrete design for user review before implementation.

## Intent and agreed scope

Teachers can create any subject and their own years or student categories, then use them in the existing guided group creation flow and profile specializations. The user confirmed these choices belong only to their creator; students see the labels on published groups. Preserve English/Arabic, mobile usability, saved drafts, existing scheduling behavior and authorization. Sol designs/reviews; the previously approved GPT-6 Luna performs scoped implementation tasks.

Examples: a teacher creates Robotics and Year 3, or Conversational English and Adults / Beginners. No school or university hierarchy is required for their custom categories. Existing platform subjects and academic contexts remain available.

## Recommended experience

- Add a bilingual Subjects & categories page to teacher navigation. Separate sections manage subjects and years/student categories.
- Allow create, rename, archive and restore. Archiving hides choices for new selections and preserves labels on existing groups and records. The teacher-owned management UI does not physically delete or reparent entries; existing shared-catalogue admin operations remain available.
- A category is either Year or Student category, with a free-form label. A name in at least one language is required; the other language is optional and falls back to the supplied name. Both may be supplied. Trim names and bound each to 120 characters. No fixed list of grades or student types limits custom values.
- Replace the combined group-offering dropdown with separate Subject and Year / student category selectors. Show platform choices and the current teacher's active custom choices. Add inline Add subject and Add year/category controls; a successful addition selects the new item without losing unsaved group details. Invalid input retains fields and shows a localized error.
- The existing details → weekly schedule → review/publish flow remains. Saving or resuming a draft retains its selected subject/category. Existing archived selections remain readable and may be retained unchanged; changing to a different selection requires active choices.
- Profile specializations use the same allowed choices. Editing a name updates its labels wherever used; explain this when an item has existing references. Archiving does not hide already published groups.

## Schema approach and alternatives

Extend the existing subjects, education_nodes and offerings with nullable owner_teacher_id and archived_at. NULL ownership means the existing shared catalogue; teacher IDs mean custom entries. This preserves groups.offering_id, foreign keys, lessons and existing public projection result shapes. An additive migration leaves existing IDs, labels and user data intact.

Custom nodes have explicit custom_year or student_category kinds and parent_id NULL. Existing shared grade/university/year hierarchy validation remains. Subjects and category records are reusable within their teacher's catalogue; an offering represents a subject/category pair. A teacher offering may reference shared or same-owner components. A shared offering may reference only shared components.

Replace the current global offering pair uniqueness with a shared pair uniqueness rule and an owned (teacher, node, subject) uniqueness rule. Generate UUID-backed slugs internally, so Arabic names and identical labels used by different teachers work without slug input. Ownership is immutable for all catalogue entries. Kind, parent and offering component links are immutable for teacher-owned entries; existing shared-catalogue admin operations remain available.

Ownership references must not use ON DELETE SET NULL, which would turn private entries into shared entries. Keep account deletion and dependent catalogue cleanup consistent with the existing operator workflow, and test it. Lock selected catalogue rows in a consistent order during save/archive validation so concurrent archiving cannot turn a validated new selection into an invalid one.

Separate custom tables would require changing every group join and public RPC contract. Allowing teachers to edit the shared catalogue would contradict the selected ownership model and existing admin permissions. The owner-scoped extension is recommended.

## Authorization and visibility

Active teachers may manage only their own custom entries, including before approval; publication still requires an active approved teacher. Teachers cannot alter shared entries or another teacher's entries, forge ownership, or change a custom row into a shared row. Admin moderation and management of the platform catalogue remain available.

Replace unconditional catalogue-read policies with explicit shared, owner/admin and group-reference visibility. Unreferenced custom entries and drafts are private. Published group references expose the required labels when the teacher is active and approved. Active accepted members, the active owner and active admins retain authorized historical labels when a group is archived; accepted-member history does not require the original teacher still to be approved or active. Public reads use narrow predicates without granting anonymous access to private profile, membership or scheduling helpers.

Reading public labels does not permit selecting them. Teacher setup/profile queries must return only shared-or-own choices even when other published entries are readable. Database checks must also guard raw group insert/update, teacher specializations, save_teacher_profile, pairing/draft saves and publication. Compare ownership with the target group/specialization teacher, including admin actions. General student profile catalogue selection remains shared-only for new or changed values; unchanged historical values remain readable.

Public teacher specializations must not leak unreferenced or draft-only custom entries. Expose custom labels there only when an eligible published group references the pairing. Public groups, detail and discovery retain their existing result columns; discovery filters include visible custom labels and continue to hide draft-only entries.

Public discovery filter choices use shared entries and custom labels actually used by eligible public groups, independently of broader owner/history read permissions. Profile saves retain unchanged archived specializations through delta updates rather than deleting/reinserting all references. Duplicating a group with an archived offering gives an actionable refusal until its catalogue selection is updated, rather than creating a new archived selection.

## Writes and integration

Use narrowly granted, authenticated catalogue mutations with live role/ownership checks, immutable ownership and bounded validation. Keep direct-table authorization guarded too. Make subject/category pairing and draft save one atomic operation, with idempotent owned pair creation, concurrent-save protection, existing shared-pair reuse where applicable, and draft identity/status checks. Failed group saves must not leave partial pairings or change another teacher's catalogue.

Update teacher catalogue management, setup/profile data and forms, shared-catalogue admin queries, public specialization visibility and discovery catalogue choices. Preserve historical group detail labels, duplicate-group ownership, profile privacy, schedule generation and atomic publication. No attendance or calendar-export work is included; the specifically requested emails and review/request feedback are described below.

## Teacher approvals and the admin panel

The user additionally requested working admin approval/decline, waiting teachers, request and decision emails, and student/admin UX improvements. This explicitly adds teacher-approval and enrollment-request notifications to this release; attendance, calendar export and schedule-change reminders remain deferred.

Sol found a functional bug: AdminForm sends checkbox value yes while adminAction accepts true, so an approval can be interpreted as false. Replace this control with explicit decisions and add a regression test reproducing the original failure.

Teacher review states are pending, approved and declined. New teachers start pending. Keep the current approved boolean synchronized for existing publication, public-profile, avatar and contact authorization. Backfill already approved teachers as approved and all other current teachers as pending. Existing approved accounts retain access; backfill sends no retrospective emails.

Pending/declined teachers may prepare profiles, their catalogue, groups and lessons, but may not publish or appear in public teacher/group discovery until approved. Show a persistent localized status panel and a disabled publish action explaining the next step. A decline includes a bounded teacher-visible reason. A declined teacher may explicitly Request another review after correcting their profile; ordinary profile edits never reset status or send another request email.

Give admins a pending-first Teacher requests queue, request details, search, status filters and pagination. Show current status, profile/specializations and actionable missing setup information, followed by explicit Approve and Decline actions. Decline requires a reason; confirm consequential decisions and keep input on failure. Keep account suspension/reactivation separate from review decisions. Show successful decisions immediately and distinguish delivery status from approval status.

An admin decision transaction must verify an active admin, target teacher, current pending version and row lock, then update review status/approved compatibility, review timestamp/actor/reason and an immutable review event, with one queued email per event. Concurrent/repeated decisions must not generate extra review events. Raw teacher writes must not change review status, approval, reviewer or decision fields. The legacy admin_update_user approval path and service-role operator/bootstrap writes must remain synchronized rather than silently bypassing status rules. Enforce the existing prohibition on self-suspension and administrative targets in the database, not only the UI.

The existing teacher_profiles row is publicly readable for eligible teachers. Store review reason, reviewer, timestamps and audit details separately behind owner/admin-only access; do not leak them by adding private columns to that public row. Keep safe status/approved compatibility fields there only as needed. Email outbox records remain private; role-scoped UI projections expose sanitized delivery summaries rather than addresses, credentials or job payloads.

## Email notifications

Agreed sender and administrative recipient: abdulrahman.gomaa.h05@gmail.com. The user will provide a Gmail app password when configuration is needed. Configure SMTP credentials as private deployment secrets after the mail path is built and tested; never commit them or expose them through browser variables or logs.

Send three event types:

1. New or explicitly resubmitted teacher review request → administrative Gmail inbox, with a link to the admin queue.
2. Approved or declined decision → that teacher's canonical Auth account email, including a decline reason and next action when relevant.
3. New or retried student enrollment request → the group's teacher's canonical Auth account email, with a link to the teacher request page. The user explicitly requested this notification. An already-pending enrollment request produces no additional event; a genuine transition back to pending creates a fresh event. Keep enrollment decisions under their existing teacher ownership.

Use the recipient's preferred Arabic/English language, escaped names/reasons and fixed application-origin links. Delivery addresses come from the canonical Auth records and configured admin address, not editable contact_email fields or submitted recipient addresses. Notifications must not reveal private student/teacher information to other users.

Add a private transactional email outbox with unique event keys. Enqueue alongside the review or enrollment transaction, including Auth/API creation paths; do not rely only on a page action. A reviewed server-only Node SMTP worker sends through Gmail. Isolate any privileged outbox credential in this worker; regular application queries continue to use authenticated session clients. Client roles cannot read, claim or mark email jobs complete.

Attempt delivery immediately after the committed action, with claimed job leases, bounded timeouts/retries, stable Message-ID and visible queued/sent/failed status for the appropriate owner/admin. Provide an authorized retry action. A secret-protected scheduled retry handler may be used only with the verified deployment plan's supported cadence; do not promise minute-scale retries on a daily-only plan. Missing configuration or failed delivery leaves a queued/failed job and does not undo a saved request or approval. SMTP has a rare duplicate-delivery window after acceptance before completion recording; do not claim exactly-once transport.

## Student and admin UX

Student dashboard: show the next scheduled lesson and active enrollment requests first, accurate totals separate from preview limits, clear class/lesson/material links, and an obvious Find a group action. Keep completed/cancelled lessons out of upcoming scheduled previews. Distinguish current requests from past declined/cancelled/removed requests and give eligible students a clear retry or cancel action. Show meaningful pending/accepted/full/declined messages on group pages. Label Cairo timetable entries with their groups and link dated lessons where applicable.

Admin dashboard: prioritize pending teacher reviews and open reports, with accurate counts and links to the work queue. Add loading, inline validation, decision success feedback, meaningful empty states and retryable query failures to admin views; never render a failed count as zero or a failed list as an empty database. Paginate People instead of silently truncating at 100. Preserve existing catalogue, group, report, settings and account-management authorizations while checking their forms and actual persistence.

Both roles retain accessible mobile navigation, readable Arabic RTL layouts, consistent labels and keyboard focus. No new student/admin privileges are introduced by UI shortcuts.

## Validation and delivery

Implement in reviewed phases: approval/admin functional repair; teacher-owned catalogue; email events/worker; student/admin UX and integration. Sol reviews each small Luna task. Regression checks cover two teachers creating identical names, raw REST cross-owner spoofing, public-read versus selectable distinctions, private drafts and specializations, archived historical labels, shared-only student selections, active/suspended roles, atomic/concurrent pairing and draft saves, and unchanged public RPC shapes. Run the relevant unit, database and API suites, lint, typecheck and production build. Verify inline creation, retained form values, draft refresh, publication/discovery, profile selections and Arabic mobile layouts in the browser.

Approval regression checks also cover initial pending state, approval/decline/resubmission, already approved backfill, raw approval spoofing, separate suspension and self/admin-target guards, concurrent decisions and queued-email failure recovery. Email tests cover all three event recipients, languages, HTML/header safety, duplicate pending enrollment clicks, genuine enrollment retries, outbox privileges and failed SMTP independent of saved decisions. Use a fake local SMTP transport until credentials are configured; report real Gmail delivery only after it succeeds. Live deployment page/log access remains subject to the previously observed 403 restrictions.

Use the isolated feature branch codex/custom-teacher-catalogue. Deliver a reviewed PR with exact validation results. Production migration history already uses MCP-generated versions; preserve that history and record source/remote mappings rather than replaying baseline migrations or resetting data.
