# Custom Subjects and Years Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. GPT-6 Luna implements scoped tasks; Sol reviews each task.

**Goal:** After richer profiles, let teachers create subjects, years and student categories and use them in profiles and guided group setup.

**Architecture:** Extend existing subjects/education_nodes/offerings with immutable owner IDs and archive flags, preserving groups.offering_id and public RPC columns. Shared catalogue stays admin-managed; teacher-owned pairs accept shared or same-owner components, with atomic pairing/draft save and retained historical references.

**Tech Stack:** Existing Next.js/TypeScript/Zod/Supabase/Vitest and SQL/local API/browser harnesses; no dependency additions.

**Spec:** expanded design's catalogue sections, and `2026-10-10-final-release-scope.md`. Depends on the profile-first plan.

## Global Constraints

- Preserve English/Arabic, mobile, saved drafts, profile section/privacy behavior and current publication/lesson authorization.
- Teacher name labels: trimmed, at least one language present, each at most 120 characters; the other falls back.
- Ownership nullable only for existing shared records and immutable; no ON DELETE SET NULL promotion to shared.
- Custom node kinds custom_year/student_category, parent_id NULL; shared hierarchy rules remain.
- Archive hides new selections, not existing history; unchanged archived references may remain saved.
- New SQL uses CLI-generated filenames; deployed historical migrations are never edited.

## Review Focus

- Publicly readable foreign custom labels still cannot be selected in another teacher's profile/group.
- Profile save retains existing hidden/private rich sections and unchanged archived specializations.
- Concurrent pair creation produces one pair, and failed/stale group save leaves no dangling partial pair.
- Archive races cannot admit new archived selections; duplicate-group gives an actionable refusal.
- Anonymous grants remain narrow; accepted-student historical labels survive teacher suspension/expiry later.

## Task 1: Catalogue contracts and domain validation

**Files:** create `src/features/teacher/catalogue-domain.ts`, `tests/unit/teacher-catalogue.test.ts`.

**Interfaces:** `CatalogueLabelInput = {name_ar:string;name_en:string}`; `TeacherCategoryKind = 'custom_year'|'student_category'`; export `catalogueLabelSchema`, `teacherCategorySchema`, `catalogueDisplayName(row,locale)` and `canSelectCatalogueRow(row,teacherId,retainedId?)`.

- [ ] Write failing tests for Arabic-only labels, empty/bounded labels, same labels across teachers, foreign readable-but-unselectable rows and unchanged archived references.
- [ ] Run `npm run test -- tests/unit/teacher-catalogue.test.ts`; confirm intended failures.
- [ ] Implement shared-or-own active-choice validation with explicit retained unchanged selection; rerun unit tests/typecheck.
- [ ] Commit; Sol reviews the contract before DB work.

## Task 2: Owner-scoped schema, private reads and atomic writes

**Files:** CLI-generated `teacher_owned_catalogue` migration; `tests/database/teacher_catalogue.sql`; modify run.sh/API harness.

**Interfaces:** authenticated catalogue mutations `save_teacher_subject(p_id uuid,p_name_ar text,p_name_en text) -> uuid`, `save_teacher_category(p_id uuid,p_kind text,p_name_ar text,p_name_en text) -> uuid`, `set_teacher_catalogue_archived(p_kind text,p_id uuid,p_archived boolean) -> void`; own IDs derive from auth.uid(). Atomic group draft RPC accepts subject/category IDs and validates existing draft owner/status before creating the pair and saving details in one transaction.

- [ ] Write failing SQL/API cases for shared-admin preservation, cross-owner raw REST/RPC spoofing, duplicate labels across teachers, visibility of draft-only versus published labels, student shared-only new selection, account deletion and immutable ownership.
- [ ] Run local checks to confirm intended missing-schema failures.
- [ ] Add owner_teacher_id/archived_at, owner FK deletion behavior, custom-kind validation, shared/owned partial pair uniqueness and UUID-backed internal slugs. Preserve existing shared IDs and admin editing.
- [ ] Implement owner/admin RLS and mutations, consistent catalogue row locks, atomic pair/draft save and delta specialization saves. Guard direct groups/specialization/student writes and publication according to target teacher ownership.
- [ ] Test simultaneous pair creation, rollback on invalid draft, concurrent archive/save, unchanged archived profile selection and refusal to duplicate archived offerings. Audit public specialization/discovery projections for draft/foreign leakage without changing result columns.
- [ ] Run SQL/API regression; commit; Sol reviews DB security and concurrency.

## Task 3: Catalogue management and subject/category selectors

**Files:** create `catalogue-actions.ts`, `catalogue-data.ts`, `catalogue-forms.tsx`, `src/app/[locale]/teacher/catalogue/page.tsx`; modify teacher navigation, setup/profile data/forms/actions.

**Interfaces:** loaders return explicit shared-or-own choices, independent of broader readable public metadata; mutations preserve values and return localized IDs/error feedback; inline creation selects the newly saved row.

- [ ] Add domain/API/browser cases for inline create retaining unsaved group details, saved draft refresh, renamed references, archive/restore and rich-profile preservation.
- [ ] Confirm the new flow is absent, then implement subject/category management and separate selectors with inline Add.
- [ ] Update profile specialization selection with the same allowed pairs; preserve hidden descriptive sections, archived unchanged choices and profile-first compatibility.
- [ ] Preserve the details → weekly schedule → review/publish flow and offer actionable validation/error/empty states in EN/AR.
- [ ] Run unit/SQL/API, lint/typecheck and mobile browser checks; commit; Sol reviews integration.

## Task 4: Public discovery and phase validation

**Files:** existing public/discovery data/UI, catalogue SQL/API tests and `docs/implementation/TEACHER_CATALOGUE_VALIDATION.md`.

- [ ] Test that public filters list shared choices plus custom labels actually used by eligible published groups; draft-only labels and unrelated private specializations are absent.
- [ ] Test accepted-student historical labels and teacher/admin edit choices separately, without broad anonymous grants or circular RLS.
- [ ] Run full unit/database/API checks, lint/typecheck and build; verify profile/cover regressions and Arabic mobile selectors. Record actual results and environmental limitations.
- [ ] Sol reviews the phase, update the draft PR/validation and preserve migration mappings. Monthly-access restrictions arrive in the following renewal phase and must extend these predicates explicitly.
