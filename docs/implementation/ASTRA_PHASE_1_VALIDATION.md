# Core workflow stability validation — 2026-10-14

Phase 1 corrects the material ownership alias, confirms Storage removal before metadata deletion, permits narrowly scoped orphan cleanup, checks enrollment eligibility against live teacher status/approval, aligns enrollment/cancellation lock ordering, frees weekly reservations held by archived groups or historical lessons, and removes the broken global Reports destination for non-admins.

Sol reviewed every Luna change. Review caught and corrected an ownership test that failed to inspect the filter, a mock chain error, unrelated-error false positives in SQL, and invalid published-group fixture setup. No open material review findings.

Validation:
- 271 unit tests across 34 files passed.
- All 21 database regression files passed on a freshly initialized local schema with the complete migration sequence and seed.
- Existing integration suite: 171 real local API assertions passed.
- Built-app browser checks: EN/AR 390px teacher workspace without overflow/broken Reports link; actual link/note/PDF form submissions; accepted student PDF download and foreign-teacher denial; actual file+metadata removal; owner-only orphan cleanup.
- Concurrent capacity-one decisions serialize to exactly one acceptance. Group lock held by cancellation while another session accepts: no deadlock, archived acceptance rejected.
- Typecheck passed. ESLint: zero errors, one pre-existing cover-image warning.
- Default local Turbopack build failed first on an external node_modules symlink, then on a sandbox-restricted worker port. A local dependency directory resolved the symlink issue; supported webpack production build passed. Vercel default preview build READY at exact reviewed head d21d05b9e8f310e99bd45adfe07f06c5b498440b.

Local environment notes: initial reset attempted a blocked registry; documented slim images were used instead. A setup directory error was resolved by preparing supabase/.branches. Recreated local Auth inherited email confirmation; local-only auto-confirm was restored for disposable API fixtures. None of those settings changed production Auth.

Production release: migrations apply before merge-dependent production deployment. PR https://github.com/abdulrahman-111/Dars/pull/12. Deployment completion is recorded separately in the progress ledger. No production accounts are used for destructive regression tests.
