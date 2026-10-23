# Starter issue proposals

These are ready-to-adapt issue descriptions, not claims that issues or contributions already exist. A maintainer can publish them after checking for duplicates and confirming scope. Ask to take an issue before starting overlapping work.

## 1. Verify setup from a fresh clone

**Suggested labels:** documentation, good first issue

**Problem:** The maintainer's environment can hide missing setup steps.

**Scope:** Follow [Development](DEVELOPMENT.md) on an independent machine with Node.js 24, Docker, and the Supabase CLI. Use a disposable backend and synthetic accounts. Note OS and tool versions.

**Acceptance:** A pull request fixes every missing or unclear step encountered and includes the commands run, results, and remaining limitations. No maintainer credentials or existing workspace scripts are used.

## 2. Review Arabic and English enrollment messages

**Suggested labels:** translation, good first issue

**Problem:** Enrollment states and errors must be understandable in both languages.

**Scope:** Review `messages/ar.json`, `messages/en.json`, and the student/teacher enrollment screens. Reproduce pending, accepted, rejected, and cancelled states with synthetic accounts. Report ambiguous wording before changing product meaning.

**Acceptance:** Translation keys stay aligned, both languages convey the same state, screenshots show the changed messages, and relevant checks pass.

## 3. Audit keyboard use in the group discovery filters

**Suggested labels:** accessibility, good first issue

**Problem:** Students should be able to filter and select groups using a keyboard.

**Scope:** Inspect `src/app/[locale]/groups/` and `src/app/[locale]/teachers/` and the filter components it imports. Test focus order, labels, submission, and clearing filters in both languages. Keep changes limited to reproducible accessibility issues.

**Acceptance:** The issue includes browser and reproduction steps; the pull request makes the affected controls keyboard-operable with visible focus and meaningful labels, and records manual verification.
