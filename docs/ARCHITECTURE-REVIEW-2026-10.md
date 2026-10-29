# Architecture review and fix order (October 2026)

This review covers features, performance and security. Every item was checked against `main` at commit `56d20cb` and the repository's GitHub settings on 29 October 2026. Each item links to a GitHub issue with context, file pointers, tasks and acceptance criteria. Progress is tracked in [#161](https://github.com/abdulrahman-111/DarSak/issues/161).

Sizes: **S** = 1–2 days, **M** = 3–5 days, **L** = 1–2 weeks. Re-estimate when you pick an item up.

## Fix order

Work top to bottom. Items in the same step can run in parallel. The "Needs" column lists issues that must be finished first.

| Order | Issue                                                                                                                      | What                                                                                | Size | Needs                      | Why at this point                                                                |
| ----: | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | :--: | -------------------------- | -------------------------------------------------------------------------------- |
|     1 | [#130](https://github.com/abdulrahman-111/DarSak/issues/130)                                                               | Vercel deploy limit, `SANAD_ENABLED`, admin MFA enrolment (owner)                   |  S   | —                          | Nothing reaches users until deploys work.                                        |
|     2 | [#157](https://github.com/abdulrahman-111/DarSak/issues/157)                                                               | Branch protection, secret scanning, Dependabot, CODEOWNERS, secrets list            |  S   | —                          | Public repo with an unprotected `main`; mostly settings, about one hour.         |
|     3 | [#90](https://github.com/abdulrahman-111/DarSak/issues/90)                                                                 | Production emails never sent: SMTP root cause (owner)                               |  S   | —                          | Reminders, approvals and receipts all depend on email.                           |
|     4 | [#143](https://github.com/abdulrahman-111/DarSak/issues/143)                                                               | Run the email outbox and reminders every 5 minutes                                  | S/M  | #90                        | The daily cron means 1-hour reminders almost never arrive.                       |
|     5 | [#155](https://github.com/abdulrahman-111/DarSak/issues/155)                                                               | Catalog-driven RLS and SECURITY DEFINER guard, access matrix, CodeQL                |  M   | —                          | Catches permission mistakes in every later migration.                            |
|     6 | [#138](https://github.com/abdulrahman-111/DarSak/issues/138)                                                               | Playwright end-to-end tests in CI                                                   |  M   | —                          | Safety net for everything after it; base for #139, #140, #151, #153.             |
|     7 | [#141](https://github.com/abdulrahman-111/DarSak/issues/141)                                                               | Error tracking, uptime and cron heartbeats, tested restore, runbook                 |  M   | #130                       | We need to see failures before shipping more.                                    |
|     8 | [#103](https://github.com/abdulrahman-111/DarSak/issues/103)                                                               | Remaining Supabase advisor findings (leaked-password protection)                    |  S   | —                          | Small dashboard change with a direct security benefit.                           |
|     9 | [#158](https://github.com/abdulrahman-111/DarSak/issues/158)                                                               | SanDai hardening: 18+ age gate, injection test set, safety settings, budget breaker |  M   | #138                       | Must land **before** SanDai is enabled in production.                            |
|    10 | [#140](https://github.com/abdulrahman-111/DarSak/issues/140)                                                               | CSP report endpoint, two weeks of reports, then enforce; extra security headers     | S/M  | #138, #141                 | Report-Only mode collects nothing today.                                         |
|    11 | [#156](https://github.com/abdulrahman-111/DarSak/issues/156)                                                               | Abuse protection: rate-limit inventory, gaps, enumeration timing test               |  M   | #155                       | Closes the gaps around the existing Turnstile and quotas.                        |
|    12 | [#160](https://github.com/abdulrahman-111/DarSak/issues/160)                                                               | Data inventory, retention jobs, data export, deletion-completeness test             |  L   | #143                       | Privacy page must match reality; needed before minors (#146) or payments (#144). |
|    13 | [#159](https://github.com/abdulrahman-111/DarSak/issues/159)                                                               | Enable file uploads safely: byte checks, malware scan, quarantine                   | M/L  | #143, #155                 | Uploads are off at launch; turn them on only with these checks.                  |
|    14 | [#137](https://github.com/abdulrahman-111/DarSak/issues/137)                                                               | Measure real latency before and after                                               |  S   | #130                       | All current numbers come from a stub.                                            |
|    15 | [#151](https://github.com/abdulrahman-111/DarSak/issues/151)                                                               | Real-user monitoring, budgets, bundle-size guard                                    |  M   | #130, #138                 | Performance work after this point follows real data.                             |
|    16 | [#154](https://github.com/abdulrahman-111/DarSak/issues/154)                                                               | Fewer Arabic font weights, CLS-safe fallbacks, code-splitting                       |  M   | #151                       | Cheap wins on mobile; about 80 KB less per Arabic page.                          |
|    17 | [#152](https://github.com/abdulrahman-111/DarSak/issues/152)                                                               | Page-level RPCs, index audit, keyset pagination                                     |  L   | #151, #155                 | Largest server-side latency gain; needs the access matrix to stay safe.          |
|    18 | [#153](https://github.com/abdulrahman-111/DarSak/issues/153)                                                               | Caching rules, static workspace shell, optimistic UI                                | M/L  | #138, #152                 | Builds on the page RPCs; the two-user cache test lives in #138.                  |
|    19 | [#135](https://github.com/abdulrahman-111/DarSak/issues/135), [#136](https://github.com/abdulrahman-111/DarSak/issues/136) | Student and teacher workspace follow-ups                                            |  M   | #152, #153                 | Most items are covered by #152 and #153; finish the rest here.                   |
|    20 | [#145](https://github.com/abdulrahman-111/DarSak/issues/145)                                                               | Meeting links and one-tap Join for lessons                                          | S/M  | #143                       | Quick win; reminders carry the link.                                             |
|    21 | [#148](https://github.com/abdulrahman-111/DarSak/issues/148)                                                               | Ratings in discovery and on profiles; review prompts                                |  M   | —                          | Reviews already exist; this makes them useful for choosing teachers.             |
|    22 | [#147](https://github.com/abdulrahman-111/DarSak/issues/147)                                                               | Installable PWA, then web push                                                      |  M   | #143, #157                 | Reminders that reach phones without relying on email.                            |
|    23 | [#150](https://github.com/abdulrahman-111/DarSak/issues/150)                                                               | SanDai v2: streaming, visible quota, content-free feedback, evaluation set          |  M   | #158                       | Improves the assistant once it is safe to run.                                   |
|    24 | [#149](https://github.com/abdulrahman-111/DarSak/issues/149)                                                               | Append-only audit log and admin analytics                                           | M/L  | #143                       | Needed before money moves through the platform.                                  |
|    25 | [#144](https://github.com/abdulrahman-111/DarSak/issues/144)                                                               | Paid teacher subscriptions through an Egyptian gateway                              |  L   | #90, #143, #149, #160      | Revenue; depends on email, the audit log and privacy work.                       |
|    26 | [#146](https://github.com/abdulrahman-111/DarSak/issues/146)                                                               | Guardian accounts (**blocked** on the under-18 decision)                            |  L   | owner decision, #158, #160 | Only if DarSak decides to serve school-age students.                             |

Ongoing, alongside any step:

- [#139](https://github.com/abdulrahman-111/DarSak/issues/139) Accessibility and Arabic quality (axe in CI once #138 exists)
- [#142](https://github.com/abdulrahman-111/DarSak/issues/142) SEO gaps
- [#76](https://github.com/abdulrahman-111/DarSak/issues/76) Fresh-clone setup on an independent machine

## Main findings

These are the facts behind the order above.

- **Email and reminders:** `vercel.json` runs `/api/email/cron` once a day at 06:00 UTC. With the reminder windows in `enqueue_lesson_reminders`, only lessons starting between 06:10 and 07:00 UTC ever get a 1-hour reminder. Production email has also never been sent (#90).
- **Repository settings:** the repository is public, `main` has no branch protection, and secret scanning, push protection and Dependabot are disabled. The CI workflows themselves are already hardened (read-only permissions, actions pinned to commit SHAs, concurrency).
- **CSP:** the nonce policy runs in Report-Only mode unless `CSP_ENFORCE=true`, but it has no `report-uri` or `report-to`, so no violations are collected.
- **SanDai:** it sends only what the user typed and stores no prompts or answers. Gemini's terms require users to be 18 or older, and DarSak has no age check.
- **Uploads:** material and photo uploads are switched off at launch. Storage buckets are private with short signed URLs, but they trust the declared content type.
- **Errors:** `onRequestError` in `src/instrumentation.ts` logs only the route type; there is no error tracking or alerting.
- **Performance:** latency numbers from the recent work come from a local stub. Workspace pages still make 4–8 Supabase calls each. Nearly all pagination uses `OFFSET` (104 `p_offset` parameters across RPCs). Arabic pages load four font weights (about 178 KB) with fallback metric adjustment turned off.
- **Already in place:** Turnstile on auth forms, Supabase Auth rate limits, an admin login throttle with MFA, database quotas for SanDai, group feedback with moderation, a robust account-deletion pipeline, a sitemap with hreflang, and self-hosted fonts with an Arabic `unicode-range`.

## Definition of done (every item)

- Tests are included (unit, pgTAP or end-to-end, as fits).
- Migrations go to staging first, are verified there, then go to production.
- Both CI jobs, "Lint, typecheck, test & build" and "Database tests", pass.
- Arabic and English copy is reviewed, and RTL layout is checked at 390 px.
- Any documentation the issue names is updated.
