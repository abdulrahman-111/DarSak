# Dependency Compatibility Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development task by task.

**Goal:** Resolve the failed dependency upgrades without weakening type, lint, security, or deployment checks.

**Architecture:** Use the newest compiler supported by the current lint/compiler-API consumers (TypeScript 6.0.3), retain ESLint 9 until its plugins support 10, and migrate both apps to Tailwind 4.3.3 with its PostCSS adapter. Preserve existing appearance and role boundaries. Unsupported major PRs are superseded with explicit compatibility evidence rather than force-installed.

**Tech stack:** Next.js 16.4.3, Node 24, npm workspaces, TypeScript, Tailwind, ESLint, Playwright.

**Spec:** User request to resolve dependency failures; existing runtime/design remain the contract.

## Constraints and review focus

- No forced peer resolutions, ignored type errors, disabled lint/security rules, or production database changes.
- Keep public and administrator apps independently buildable; preserve English/Arabic and mobile styling.
- Preserve the TypeScript compiler API used by both AST guards.
- Preserve Tailwind v3 utility appearance, focus/forced-colors behavior, and form typography after native CSS layering changes.
- Keep dependency policy exceptions narrow and documented; other updates and GitHub checks remain enabled.

## Task 1: Supported compiler and lint policy

- [ ] Reproduce unsupported peer/API contracts from npm metadata and existing failed builds.
- [ ] Pin TypeScript 6.0.3 in both workspaces; keep ESLint 9.39.5; update compatible parser dependencies only as required.
- [ ] Document/encode the incompatible TypeScript >=6.1 and ESLint >=10 ranges in Dependabot, with reasons.
- [ ] Regenerate lockfile without peer overrides, then run clean install, typechecks, lint, AST guard tests, and both builds.

## Task 2: Tailwind 4 migration

- [ ] Reproduce old PostCSS plugin failure on Tailwind 4; migrate both PostCSS configurations to @tailwindcss/postcss.
- [ ] Load existing theme configuration explicitly, scope source scanning, update removed/renamed utilities, and preserve preflight/base styling with layers.
- [ ] Remove obsolete Autoprefixer dependency only after adapter handles prefixes; update both workspace manifests and lockfile.
- [ ] Add a meaningful compiled-CSS regression check for theme tokens, utility output, and both apps' source coverage.
- [ ] Run lint, format, unit, typechecks, both production builds, and browser workflows across desktop/mobile and English/Arabic. Inspect representative public/admin rendered pages.

## Task 3: Integration and deployment

- [ ] Sol reviews the resulting diff and validation evidence; resolve findings.
- [ ] Open a draft repair PR, run all required CI including real database/API/browser workflows, and verify Vercel preview.
- [ ] Supersede incompatible bot PRs with clear compatibility explanations; merge only after checks pass.
- [ ] Verify public/admin production deployments and public health, then resume roadmap work.
