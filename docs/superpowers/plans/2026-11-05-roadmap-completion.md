# Remaining free-plan roadmap implementation plan

**Goal:** Finish and verify the approved roadmap, closing individual issues only when their current acceptance is supported by evidence.

**Method:** Sol explores and reviews; GPT-6 Luna implements small tasks. Reuse this isolated worktree. Batch reviewed local commits into one ready PR preview, retain all CI checks, and permit a production build after merge. Preserve existing administrator/staging deployment restrictions; never replace an unread dashboard build-ignore command.

**Constraints:** English/Arabic, mobile usability and server-side authorization remain mandatory. No email-delivery work, paid services/subscriptions, guardians, upload enablement or canceled age confirmation. No dependency installation into shared `node_modules`, global database reset, broad fixture mutation or production test data. Hosted changes require staging-first validation. Time-dependent and external acceptance stays open until actually observed.

## First batch: browser reliability and preview noise

- [ ] Restore the narrow Dependabot automatic-deployment veto without changing CI or existing branch restrictions. Avoid adding an unconfigured docs-only classifier.
- [ ] #138: real notification arrival and read state while the inbox is open.
- [ ] #138: viewer endpoint failure recovery, logout response race, usable server-authorized mobile navigation and role/session boundaries.
- [ ] #138: isolated teaching-access withdrawal and free-phase expiry control; rejected writes remain absent.
- [ ] #138: visitor browse-to-register navigation, stopping before excluded email delivery. Disabled upload-download acceptance remains with deferred #159; do not claim it tested.
- [ ] Sol reviews each small change; run focused checks before a single PR push, full exact-head CI and preview checks before merge, and production verification before issue closure.

## Following batches

- [ ] #184 compatible dependency remediation or an explicitly reviewed mitigation.
- [ ] #142 remaining metadata/sitemap checks and external preview/search validation.
- [ ] #137/#151 real latency and privacy-safe measurement, with bundle budgets.
- [ ] #152/#153/#154/#135 measured query, caching, navigation and mobile payload improvements.
- [ ] #155/#156 authorization/access matrix and abuse protections.
- [ ] #140 CSP reporting and staged enforcement, retaining observation periods.
- [ ] #141 free operational monitoring and verified recovery coverage.
- [ ] #139 accessibility, keyboard, RTL, contrast and real assistive-technology evidence.
- [ ] #160 data inventory, retention, export and deletion completeness.
- [ ] #158/#150 SanDai breaker, real free-quota evaluations, streaming and feedback.
- [ ] #147 remaining installation validation and web push without reviving email work.
- [ ] #145 meeting links and protected Join; #148 ratings; #149 audit history and efficient admin analytics.
- [ ] Reconcile tracker #161 last. Keep #90/#143/#144/#146/#159 deferred rather than claiming implementation.

Progress, immutable review artifacts and command evidence live under `/workspace/shared/roadmap-completion-20261105/`. Detailed first-batch briefs are in `issue138-brief.md` and `preview-plan.md` there. These are operational handoff files, not additional runtime dependencies.
