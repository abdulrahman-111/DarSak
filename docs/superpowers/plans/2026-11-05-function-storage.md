# Function storage reduction implementation plan

**Goal:** Reduce unnecessary native image dependencies in Vercel function traces without changing application behavior.

**Architecture:** Both Next.js applications exclude only musl and wasm Sharp alternatives when `VERCEL=1`. Linux glibc Sharp and libvips remain. Other hosts retain their existing tracing behavior. A dependency-free script reports actual local trace sizes; those sizes are explicitly not Vercel billed storage.

**Constraints:** Free plan only. Preserve bilingual images, authorization, separate administrator application, previews and production rollback. No database or email changes. No dependency installation, shared node_modules edits or database resets. Existing local traces are a baseline, not exact deployed artifacts.

## Task 1: Narrow tracing exclusions and measurement

- Modify `next.config.ts` and `apps/admin/next.config.ts`: condition exclusions on `process.env.VERCEL === '1'`; exclude `@img/*linuxmusl*` and `@img/sharp-wasm32` only. Cover administrator hoisted dependencies explicitly with `../../node_modules/` patterns. Retain glibc native packages and next/og assets.
- Add `scripts/measure-function-traces.mjs`: accept a Next build directory, resolve NFT entries relative to each manifest, report manifest count, unique bytes, largest route, missing entries and Sharp variants without dumping paths or secrets. Missing files fail. Distinguish unique bytes from summed traces and billed storage. Keep it simple and dependency free.
- Add measurement after both production builds in `.github/workflows/ci.yml`; exercise Vercel tracing during these builds using step-local `VERCEL=1`. Preserve other CI jobs and environment boundaries.
- Document rationale, reproducible commands and limits in `docs/DEPLOYMENT.md`. Do not promise an immediate reduction of the rolling usage card or delete history.
- Validate script using temporary synthetic overlapping manifests and missing-file handling, verify config glob coverage for root and hoisted dependencies, and check formatting/lint/typechecks. Run both real builds via CI, review trace reports and verify image optimizer, icons and bilingual OG responses before merging.
- Sol reviews the completed diff; fix any important findings. Open PR, attach it, require CI and preview readiness before merge; verify production readiness afterward.

## Operational follow-up

Inventory retained deployments separately. Current screenshot: team Functions Storage 8.05 GB / 10 GB, last 30 days. Native connector presently lacks deployment deletion/retention operations and no browser control tool or configured Vercel CLI identity is available. Preserve live deployments and rollback candidates. Only claim dashboard quota reduction after observing it.
