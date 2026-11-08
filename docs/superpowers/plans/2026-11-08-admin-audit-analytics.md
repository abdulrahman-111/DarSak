# Admin audit and analytics implementation plan (#149)

Recover the approved #149 design after the execution workspace was replaced. #138 is already closed through merged #208. This is a plan, not completion evidence. Luna implements, Terra reviews each task, and Sol gives final approval before merge. Push this plan and subsequent reviewed checkpoints early; do not leave the work solely in an ephemeral workspace.

## Constraints

- Free services only. No email delivery, uploads, paid-plan activation, AI credential work, or new admin staging deployment. The admin portal remains production-only and uses the existing production database.
- Preserve EN/AR, mobile layouts, active-admin checks and real AAL2/MFA. No public admin links or secret URLs in PR descriptions.
- Use new CLI-generated migrations, staging-first native migration tools and rollback-only staging fixtures. Never bypass a Supabase confirmation with persistent DDL through execute_sql.
- Leave the existing private-teachers backend on 54321/54322 untouched. Create a separate owned test stack on 55321/55322 if needed. Never reset or restart the original backend.
- Reuse installed dependencies after a clean npm ci. No changes to lockfile or dependency versions unless a demonstrated compatibility problem requires them.

## A: immutable private ledger and canonical producers

Create dars_private.audit_log with identity id, at, actor_id nullable UUID, actor_role, action, target_type, target_id nullable UUID, request_id nullable UUID, metadata JSON. No foreign keys that erase history on account deletion. Enable RLS and revoke all table, sequence and helper execution privileges from PUBLIC/anon/authenticated/service_role. Private helper uses trusted auth.uid plus the stored profile role; owner/internal maintenance or already-deleted actors are explicitly system, never a new authorization bypass.

Reject ordinary UPDATE/DELETE and TRUNCATE, including owner DML. Validate action-specific metadata at the TABLE insert boundary as well as the helper: bounded enum statuses/roles, booleans, UUID IDs and nonnegative counts only. Never record names, email/phone, CV/meeting URLs, reasons, comments, report text, payment references, manifests or errors.

Canonical actions: teacher_review_approved/declined (approved/declined teacher_review_events insert only), teacher_application_changes_requested, teacher_access_approved/declined, fee_policy_changed, quota_policy_changed, user_suspended/reactivated, admin_granted/revoked, feedback_approved/hidden, feedback_reply_approved/hidden, report_resolved/reopened, group_archived/deleted, account_deletion_started/completed, teacher_plan_assigned, audit_purged. Map exact source tables/RPCs in docs/security/AUDIT.md. Distinct role and status changes in one update produce one event for EACH logical action. No duplicate event from approval mirrors, no-op retries, or failed transactions.

Reply moderation must cover hiding a published reply with no pending reply, hiding only a pending reply, and approving a reply identical to an existing public reply. Student resubmission/withdrawal must not be classified as admin moderation. Preserve all existing RPC guards.

Actual account_deletion_requests uses state, with queued insert and completed transition after profile deletion. Preserve target UUID. Capture system-triggered group deletions during account cleanup safely. Fee/quota controls remain disabled; manual payment and push producers do not exist and are not enabled.

Retention: private owner-only purge, EXECUTE revoked even from service_role. Monthly pg_cron at 03:00 UTC on day 1, independent of email jobs. In one transaction take ACCESS EXCLUSIVE, temporarily disable only the row immutability trigger, DELETE ALL rows older than the fixed 24-month cutoff using the date index, reenable ALWAYS, and append the deleted count. Keep TRUNCATE guard. No bypass GUC and no 10k/month backlog. Document monthly cleanup window, lock/WAL tradeoff, owner DDL maintenance exception. Test >10,000 expired rows, preservation of a specific recent row, trigger restoration and forced rollback.

## B: guarded audit reads and meaningful metrics

public.admin_audit_page(p_actor_id uuid=null,p_target_type text=null,p_target_id uuid=null,p_action text=null,p_from timestamptz=null,p_to timestamptz=null,p_before_at timestamptz=null,p_before_id bigint=null,p_snapshot_at timestamptz=null,p_limit int=50) returns JSON {rows,next_cursor:{at,id}|null,snapshot_at,total,total_capped}. Rows contain only ledger fields. Fresh active admin and AAL2 required inside SQL; grant authenticated only and revoke PUBLIC/anon/service_role. Limit 1..1000; finite timestamps; positive cursor IDs; paired cursor; strict action/type/date validation. Keyset descending (at,id), count at most 50,001 keys and report 50,000+ when capped.

snapshot_at is a FIXED TIMESTAMP CUTOFF, not an MVCC snapshot across HTTP calls. Late commits can affect later pages/counts. Document this honestly; do not add transaction-ID/snapshot storage or fetch all 50k rows into memory. Export pins the cutoff and uses bounded keyset pages.

public.admin_analytics_summary(p_days int=7|30) returns {window_days,as_of,metrics:[{key,value,unit,status,reason}]}. Define windows and denominators in SQL comments. All 23 keys, grouped in 12 UI groups: registrations_students/teachers/admins; email_verification_rate; teacher_app_submitted/approved/approval_rate/median_hours; published_groups; enrollment_pending/accepted/acceptance_rate; waitlist_size; lessons_scheduled/completed/cancelled; attendance_rate; sandak_requests; sandak_quota_hits; sandak_errors; email_outbox_queued/failed; push_delivery.

Application metrics MUST use teacher_applications latest submitted_at cohort, current approved status and reviewed_at - submitted_at median. teacher_review_events requested includes signup/bootstrap, and submitting an application can reuse an already-pending request with no new event. It is not a valid application submission source. Historical attempts are not stored; say latest-attempt/current-state explicitly. Registration roles and enrollment statuses are current snapshots, not historical transition counts. AI quota hits/errors and push have no producers: show unavailable, not invented zero. Outbox is status-only reads, no delivery changes.

Use indexed bounded time cohorts/cheap counts, no per-view unbounded historical joins. Tests cover actual roles including suspended ADMIN (set both role and status), admin AAL1, invalid filters, microsecond/tie pagination, capped counts, current-submission approval rates and one-hour median, and unavailable producers.

## C: simple admin UI and safe streaming CSV

Add admin/audit and admin/analytics pages, loading states and navigation in the separate admin app. Keep tables responsive with internal horizontal scrolling, useful empty/error states, bilingual labels. Audit filters actor/target UUID, action/type and a clearly labelled UTC date range. Prefer DATE-only form inputs and bounded deterministic calendar validation; avoid unnecessary datetime-local/fraction parser complexity. Invalid filters return a clear error/400, never throw or silently become an unbounded filter. Labels say Records up to, not a consistent snapshot. First-page navigation must be labelled First page, not Previous when it always resets the cursor.

CSV route is /[locale]/admin/audit/export, never /api (admin boundary forbids it). Fresh requireAdminActor, ordinary session client, no service key. Prefetch first RPC before sending headers, then backpressure-aware stream, 1000-row pages, <=50 pages/50k records, fixed cutoff, full microsecond cursor strings preserved, cancellation stops fetching, later errors terminate the stream. Do not use millisecond Date.parse equality to reject valid microsecond-order cursors; exact repeated-cursor detection plus SQL keyset guarantees and page bound are sufficient. Escape RFC4180 and protect formula-prefixed strings. Tests cover MFA/filter errors, cap, cutoff, errors/cancel, CSV escaping and EN/AR render.

Update both privacy languages: audit history kept 24 months then removed in monthly cleanup; account deletion does not erase retained pseudonymous audit history.

## D: actual admin production-browser and volume evidence

Keep existing 112 public browser cases. On GitHub CI additionally build/start admin on its existing permitted loopback origin port 3082 and run a small script with real synthetic admin login, TOTP enrollment/verification, audit/filter/CSV/analytics and unauthorized checks across EN/AR desktop/mobile. No mock MFA.

Local admin production-build config currently rejects NODE_ENV=production. A narrow CI exception may use NEXT_PUBLIC_ADMIN_LOCAL_E2E=true plus server ADMIN_LOCAL_E2E/CI/GITHUB_ACTIONS=true and NO VERCEL_ENV. All existing explicit local markers/ref, exact loopback API port 54321, site port 3082 and browser origin checks remain. Hosted preview/staging and external URLs are always rejected. No Vercel env changes. Test this boundary; type mixed it.each cases explicitly as Record<string,string>[] for root typecheck.

Seed 5000 synthetic Auth/profile rows and 20,000 audit rows ONLY on disposable local CI or inside staging BEGIN/ROLLBACK, no usable passwords or email sends. Use valid v4/variant UUID namespaces, not raw md5 UUIDs rejected by domain validators. Match profiles.created_at to synthetic auth.created_at across 30 days. Volume assertion >=4500 students must select the accessible Last 30 days table, never first/7-day table. Measure first and three warm FULL meaningful page navigations using the same readiness checks. Report samples and environment, fail warm median >=1s; no field/p95 claim.

Retain only screenshots and explicit content-free latency JSON. Both success AND failure artifact upload paths exclude auth state, traces and arbitrary files. Run staging rollback volume EXPLAIN ANALYZE for both SQL windows (<1s), and local production-build page timing with the same volume. This explicitly substitutes for a forbidden admin staging deployment; do not claim a staging portal was measured.

## Release gates

Review A/B/C/D with Terra, final Sol at immutable PR head, full unit/DB/API/lint/types/build/CodeQL/browser checks. Previous populated test database had four existing baseline assumptions failing (discovery/recommendations/global empty review events/group detail), reproduced without audit hooks; do not weaken fixtures or delete old actors. Fresh CI must pass ALL 66 fixtures. Apply A then B to staging using native migrations, run rollback fixtures and benchmark; then production after green review/checks. Native confirmation previously expired before any stage DDL; preflight current state and never bypass it. Verify function bodies/ACLs/search paths/cron job, merge and verify both production revisions and health, then close #149 with actual evidence. Do not claim missing gates complete.
