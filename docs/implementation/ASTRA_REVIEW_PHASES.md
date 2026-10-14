# Astra review implementation plan

Goal: implement every actionable review finding and all six proposed features through small independently releasable phases. User approved all recommendations and requests simple implementation without additional questions. Use GPT-6 Luna for implementation and Sol review. Existing Next.js/Supabase/Postgres architecture retained.

Global constraints: English/Arabic, mobile and RTL; authorization and teacher approval preserved; contacts default enrolled. No shared cache of private/viewer data. No new dependencies unless needed. Monthly renewal skipped; attendance, calendar export, schedule notifications and email delivery deferred. Pinned text announcement is not a notification service. Never test against real production accounts. Each phase: draft PR, review, relevant unit/database/API/browser checks, lint/typecheck/build; migrate before dependent production promotion; merge and verify deployment. Record failures and measurements honestly.

## Phase 1 — Core workflow stability
- Materials actions: correct `group.teacher_id` alias; remove object before metadata, confirm exact object removal, retry missing objects safely; failed-upload cleanup with narrow owner/lesson path RLS, no service key. Actual action/API regression plus foreign-owner denial.
- Enrollment RPCs: same active approved teacher eligibility as discovery; parent group before enrollment lock, reject archived acceptance, preserve serialized capacity. SQL eligibility/states and orchestrated concurrency regression.
- Schedule RPC: exclude archived groups and historical lessons from ongoing reservations; reject archived target; preserve active recurring and future dated conflicts. SQL replacement-group/history/stale mutation regression.
- Remove unsupported Reports nav; admins retain existing admin Reports destination. EN/AR role link smoke checks.

## Phase 2 — Bounded data and measured speed
- Stable complete catalogue pagination over API cap; narrow searchable teacher selector; paged group roster; dashboard bounded previews/counts independent of archive history; request enrollment page directly with clamp only when needed.
- Repeatable local fixture benchmark (queries, rows, payload, p50/p95 server/nav where measurable). Explain discovery query plans; filter eligible groups before seat aggregates if plan proves global work. Keep existing indexes; add only plan-supported indexes. No capacity/latency claims without evidence.
- Lightweight structured action failure code/duration/correlation diagnostics excluding sensitive values.

## Phase 3 — Role UX and profile reliability
- Compact expandable mobile account navigation; today's lesson and pending tasks first; student next lesson group name; actionable localized errors and visible keyboard focus. Admin queue context and preserved filters. Delete/archive eligibility guidance.
- Align published schedule editing with draft editing and explain future generated lesson behavior.
- Expected-path guarded avatar saves/removal following cover pattern; concurrency regressions.
- Unsaved-change indicator/leave protection on rich profile sections; preserve successful submission behavior, no server autosave.

## Phase 4 — Everyday resource management
- Teacher roster/request scoped search and group filters using paged RPC/counts.
- Student resources finder by accepted enrolled group, type/title, bounded pages, material counts and private signed download access.

## Phase 5 — Student planning
- Student-owned saved group shortlist with RLS; unavailable saved entries show status safely, no hidden teacher/contact disclosure.
- Warning before requesting group if weekly/actual dated schedule overlaps accepted groups; informational not new enrollment prohibition; Cairo timezone and cancellations correct.

## Phase 6 — Group communication
- Owner-authored pinned text announcement with edited timestamp visible only to accepted members, owner/admin as appropriate. No email/push or schedule notifications. Archive/history behavior deliberate.

Review focus: foreign IDs/roles, suspended/unapproved teachers, archived stale actions, races/storage partial failures, API cap and matching counts, RTL long content/keyboard/pending states. Delegate independent tasks with disjoint files; root reviews every diff. Keep a progress ledger with commits, validation, PR, migrations and deployment per phase.
