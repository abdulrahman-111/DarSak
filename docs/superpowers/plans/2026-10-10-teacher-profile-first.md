# Rich Teacher Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Sol designs and reviews; GPT-6 Luna implements small tasks, as already authorized.

**Goal:** Ship descriptive, customizable teacher profiles first, preserving existing biography, photo, contact privacy and authorization.

**Architecture:** Store canonical descriptive content and section preferences privately, expose an eligible visible-only public projection, and preserve legacy public-teacher result shapes. Use a fixed structured editor and shared public renderer, with separate cover-image actions. The following catalogue phase replaces subject selection; the later monthly-access phase extends eligibility predicates rather than making this phase depend on unimplemented renewal code.

**Tech Stack:** Existing Next.js 16/React/TypeScript/Zod, Supabase Postgres/Auth/Storage, Vitest, SQL and local API test harnesses. No new product dependency.

**Spec:** `docs/superpowers/specs/2026-10-10-teacher-customization-approvals-ux-design.md`, Rich, customizable teacher profiles; `docs/superpowers/specs/2026-10-10-final-release-scope.md`.

## Global Constraints

- English/Arabic fallback and mobile RTL; existing rows, IDs, roles, approval rules and contact visibility remain intact.
- Contacts default to enrolled students; an explicit public setting remains independent of layout/section visibility.
- Qualifications are self-reported, optional and not verified. No required credential, phone or contact publication.
- About: 5,000 characters per language; approach/goals: 2,000 each; up to 10 qualification and 10 experience entries; titles/organizations: 120; entry descriptions: 1,500.
- New precise bounds: city 120 characters, at most 10 teaching-language labels of 60 characters, serialized descriptive payload at most 65,536 UTF-8 bytes. Teaching mode: online/in_person/both or unset.
- Layouts: classic/compact. Palettes: teal/indigo/olive. Optional sections: about/qualifications/experience/approach/goals. Fixed unique ordering; no arbitrary markup/CSS/URLs.
- Cover: private teacher-avatars bucket, JPEG/PNG/WebP, maximum 2,097,152 bytes, ownerUUID/cover/fileUUID.ext; preserve existing avatar paths.
- No production reset/seed, historical migration edit or retrospective notification. New SQL filename comes from `supabase migration new`, after CLI help.
- Use `/workspace` saved startup helpers, Node tools PATH, and local fixtures. Never print environment secrets. Public build/test success requires actual results.

## Review Focus

- Hidden About cannot survive in raw public teacher_profiles.bio or legacy RPC/search output; canonical text stays owner/admin-only.
- Repeated/concurrent saves do not erase other profile sections or silently overwrite a newer version.
- Pending/suspended/foreign actors and invalid raw JSON cannot bypass field bounds, ownership or public eligibility.
- Failed image replacement and forged owner/kind paths preserve the current avatar/cover; cleanup does not delete another concurrent saved cover.
- Owner visitor preview never exposes enrolled-only contacts or grants teaching-data access; optional missing content remains valid.

## Files and Interfaces

Create `src/features/teacher/profile-details-domain.ts`, `profile-details-actions.ts`, `profile-details-data.ts`, `profile-details-form.tsx`, `profile-cover-actions.ts`, `profile-cover-editor.tsx`, and `src/components/public/teacher-profile.tsx`. Extend existing `profile-data.ts`, `profile-actions.ts`, teacher/public profile pages and existing profile/avatar test harnesses. Do not grow profile-forms.tsx into a page builder.

Domain contract: `LocalizedText = { ar: string; en: string }`; `ProfileEntry = { id: string; title: LocalizedText; organization: LocalizedText; description: LocalizedText; start_year: number | null; end_year: number | null; current: boolean }`. Years are integers 1900 through current Cairo year + 1, ordered when both present, and end_year is null when current.

`RichProfileInput` contains about, approach, goals, qualifications, experience, languages, city, teaching_mode, layout, palette, section_order and hidden_sections. Export `richProfileSchema`, `emptyRichProfile`, `localizedProfileText(value, locale)`, `visibleProfileSections(input)`, and `teacherCoverPath(teacherId, fileId, mimeType)`. The schema rejects unknown layout/section identifiers, duplicate entry IDs/sections and oversized serialized payloads.

DB contract: owner/admin-readable `teacher_profile_details` keyed by teacher_id, canonical JSON details and monotonic integer version; `teacher_profiles.cover_path` is the visible reference. `save_teacher_profile_details(p_details jsonb,p_expected_version bigint)` returns the new version for the authenticated teacher; `public_teacher_profile_details(p_teacher_id uuid)` returns visible-only JSON or no eligible result. Public JSON contains neither hidden values nor the hidden-section list/private metadata. Keep `public_teachers()` columns unchanged.

## Task 1: Domain and compatibility tests

**Files:** create domain file and `tests/unit/teacher-profile-details.test.ts`; extend `tests/unit/teacher-avatar.test.ts` for cover paths.

**Interfaces:** produces the domain contract above; consumes existing teacher avatar MIME mapping and safe contact-link semantics.

- [ ] Write failing tests `single_language_falls_back`, `optional_empty_profile_valid`, `unknown_or_duplicate_sections_rejected`, `entry_and_total_payload_limits`, `invalid_year_order_rejected`, `cover_path_is_distinct_from_avatar`, and `hidden_about_omitted`. Use exact bounds/enums above.
- [ ] Run `npm run test -- tests/unit/teacher-profile-details.test.ts tests/unit/teacher-avatar.test.ts`; confirm failures are missing behavior, not tool/configuration errors.
- [ ] Implement schemas/helpers and deterministic visible-only visitor data; allow exact inclusive limits and reject overflow/invalid types.
- [ ] Rerun targeted tests and `npm run typecheck`; require both pass.
- [ ] Commit the scoped domain/tests; Sol reviews before DB implementation starts.

## Task 2: Private canonical data and safe public projection

**Files:** create CLI-generated `rich_teacher_profile_details` migration, `tests/database/teacher_profile_details.sql`; modify `tests/database/run.sh` and local `tests/integration/api.mjs`.

**Interfaces:** consumes RichProfileInput; produces table/RPC contracts above and a stable legacy visible bio. RPC mutations use auth.uid(), active teacher validation, private row lock, expected-version check and bounded server-side JSON validation.

- [ ] Write failing SQL/API cases `backfill_preserves_bio`, `hidden_bio_absent_from_raw_rest_and_public_teachers`, `foreign_private_details_denied`, `invalid_raw_details_rejected`, `stale_version_does_not_overwrite`, `contact_save_does_not_replay_stale_about`, `new_pending_teacher_has_empty_editable_details`, and `existing_contacts_unchanged`.
- [ ] Run tests against disposable/local Postgres and confirm the intended missing schema/guard failures.
- [ ] Create the migration via discovered CLI help; add RLS/grants, backfill existing bio into its owner's preferred-language slot, and initialize new teachers without exposing canonical rows. Missing translations fall back; no competing About field.
- [ ] Implement save/public RPCs and synchronize only visible canonical About into legacy teacher_profiles.bio. Audit raw teacher_profiles writes and legacy save_teacher_profile so they cannot re-expose hidden content or diverge from canonical About. Preserve existing callable signatures and private-contact grants. Add `save_teacher_profile_account(p_full_name text,p_headline text,p_offering_ids uuid[],p_phone_number text,p_whatsapp_number text,p_contact_email text,p_visibility text)` for core settings without an About argument, so editing contacts cannot replay a stale bio. Retain legacy save_teacher_profile explicitly as a compatible canonical About writer with all other rich fields preserved.
- [ ] Run SQL suite with local SUPABASE_DB_URL and `/workspace/dars-check-api.sh`; verify public/anonymous/private helper grants and rollback/fixture cleanup.
- [ ] Commit; Sol reviews privacy, direct writes, compatibility and migration upgrade before continuing.

## Task 3: Cover-image storage and actions

**Files:** create CLI-generated `teacher_profile_covers` migration, cover actions/editor, `tests/database/teacher_profile_covers.sql`; extend avatar/API harnesses and run.sh.

**Interfaces:** `uploadTeacherCover(locale, previousState, formData)` and `removeTeacherCover(locale, previousState, formData)` return existing TeacherProfileActionState. Separate cover read/upload/delete helper names; existing avatar contracts stay unchanged.

- [ ] Write failing tests for current-cover public signing, pending owner-only signing, foreign owner/kind spoofing, MIME/content mismatch, exact 2 MB boundary, failed metadata save, concurrent replacement and independent avatar preservation.
- [ ] Run targeted unit/SQL/API tests and confirm missing behavior.
- [ ] Add exact cover-path checks/storage policies; validate file signature/type before upload. Keep lesson-material policy grants intact. Owner/admin paths are independent of future monthly eligibility; public signing will gain monthly checks in that later phase.
- [ ] Implement upload/save/verify/cleanup and removal. Recheck current reference before cleanup; uncertain saves keep files private and report uncertainty. Do not delete a concurrently chosen reference. Extend account-deletion cleanup to covers.
- [ ] Run cover/legacy-avatar SQL/API checks and typecheck; acknowledge signed-URL TTL rather than claiming instant asset revocation.
- [ ] Commit; Sol reviews storage/action behavior before the UI task.

## Task 4: Editor, visitor preview and public presentation

**Files:** create data/actions/form/public-renderer modules; modify existing profile data/actions, `src/app/[locale]/teacher/profile/page.tsx`, and `src/app/[locale]/teachers/[id]/page.tsx`.

**Interfaces:** details loader returns `{details, version, error}`; save action returns `RichProfileActionState = {error?:string;success?:string;fieldErrors?:Record<string,string>;version?:number} | null`; shared renderer consumes only visible visitor data and safe contacts/groups. Public page loads `discover_groups` filtered by teacher and preserves safe counts/next lessons.

- [ ] Write unit cases for bilingual section order, hidden sections, legacy defaults, optional completeness and preview contact exclusion. Add browser cases retaining entries/values after failed save and stale-version rejection.
- [ ] Run targeted checks and confirm intended missing behavior.
- [ ] Implement grouped editor, bounded repeaters, two layouts/three palettes, move-up/down controls, visibility toggles, character feedback and explicit Save/Preview. Preview is owner-local and clearly labeled; never submit visibility changes implicitly.
- [ ] Remove the competing legacy bio input from the core form; the rich editor is the single About editor. Core name/headline/contact/specialization saves call save_teacher_profile_account and preserve canonical details regardless of save interleaving; reuse contact settings. Keep existing specialization selection for now. Use session-scoped clients; revalidate both languages and relevant profile/discovery routes after save.
- [ ] Render eligible group cards and a clear choose-group action. No invented availability/verification metrics. Blank optional sections collapse cleanly; invalid legacy theme values fall back safely. Preserve semantic heading order/focus and Arabic layout.
- [ ] Run EN/AR desktop and 390px browser flows, domain/contact/avatar regressions, lint and typecheck; commit and obtain Sol review.

## Task 5: Profile-phase validation and reviewable delivery

**Files:** create `docs/implementation/RICH_TEACHER_PROFILE_VALIDATION.md`; update progress/schema contract with actual results.

- [ ] Run full `npm run test`, database run.sh and local API harness after all migrations. Verify upgrading existing rows and rebuilding a disposable database, with no production reset.
- [ ] Run `npm run lint`, `npm run typecheck`, and `npm run build`. If default Turbopack hits the known sandbox issue, report it and separately run `npm run build -- --webpack`; do not label default build as passed.
- [ ] Perform browser checks for owner/admin/foreign/pending/suspended roles, public hide/show, unknown field rejection, cover replacement/removal, enrolled-only contacts, stale saves, AR mobile and local fixture cleanup.
- [ ] Record exact evidence and limitations. Monthly expiry integration is phase 4, not claimed complete here; custom catalogue integration follows immediately in phase 2.
- [ ] Sol reviews the completed diff. Create/update a draft PR and attach it to the chat, with profile-first scope and validation. Preserve the user's existing migration/deployment authorizations and remote history when release integration occurs.
