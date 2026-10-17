# Launch wording and usability polish

## Result

DarSak is presented as a place to connect learners with teachers, find suitable learning groups, and keep schedules and resources organized. English and Arabic marketing no longer directly position it as a private-lessons marketplace. Copy remains accurate about teacher account review, enrollment decisions, guest previews, and teacher contact visibility.

The landing page explains the student and teacher benefits, labels its timetable as an example, and answers four practical questions using native expandable sections. Arabic headings have more readable line spacing. Payment arrangements remain private to authenticated teachers after signup; public pricing still compares plans without collection instructions. Subscription enforcement stays disabled; this phase has no database migration or payment integration.

Student home prioritizes discovery, groups/requests and timetable, with materials and saved groups available as secondary links. Teacher home gives application status a clear account link and keeps today's work and next steps visible. Admin home brings teacher reviews and open reports forward. Copy no longer promises unsupported personalized recommendations or points teachers at the retired renewal form.

Shared navigation has larger touch targets, clear keyboard focus, a skip-to-content link, a wrapping mobile footer and current-section context in the mobile workspace menu. The duplicate admin plan link, which led to the same teacher list, is removed. The mobile menu closes after a completed route change and returns focus from a closing navigation link to its visible summary. A cancelled navigation keeps the menu open. Motion uses CSS: existing short page introductions and card feedback, plus a short example acceptance-message entrance and menu-chevron transition. Reduced-motion preferences disable entrance/hover movement. No animation library or new dependency is added.

## Bugs addressed

- An expanded mobile workspace menu remained open after completed navigation, obscuring the new page. It now closes on a pathname change, preserves cancelled navigation and restores keyboard focus when needed. The bug was reproduced after waiting for the new URL and section label, rather than treating a pending navigation as a failure.

- Mobile navigation matches the raw role path independently from its translated display label, so nested pages report their current section rather than Overview.
- Switching language on sign-in/setup rewrites safe internal `next`/`returnTo` targets. The intended group survives the switch; unsafe or malformed targets are discarded. Existing authorization and redirect allowlists remain unchanged. Bidirectional, query/fragment, unrelated-filter and invalid-target regression tests cover this behavior.

## Review and verification

Independent GPT-6.1 Sol review examined copy accuracy, role navigation, redirect safety, accessibility, reduced motion and performance impact. No remaining P1/P2 source-review blocker was identified. Implementation was delegated in small scopes to GPT-6 Luna and reviewed by Sol.

- Full unit suite: 512 tests passed across 82 files.
- Existing real local API regression suite: 173 assertions passed.
- Database regression scripts: 6 foundation + 30 enforcement assertions passed; both rolled back their fixtures. No schema changes in this phase.
- ESLint and TypeScript checks passed.
- Guest landing/pricing and student/teacher/admin dashboards passed English/Arabic checks at 390px and 1440px: correct direction, readable layouts and no horizontal overflow.
- Authenticated enrollment → teacher approval → student lesson and note access passed. Browser language switching preserved the intended group; reduced motion disabled hero and acceptance-message animation; FAQ keyboard interaction passed. Webpack production build passed. The final mobile menu regression passed after completed Arabic navigation; the original failure reproduced with the menu open and the rerun confirmed it closed. Seven focused navigation tests, lint and typecheck also passed after this last change.

An initial full-suite run exposed a stale test mock missing the newly exported mobile navigation summary. The mock was corrected without weakening the student navigation assertions, and the full rerun passed. The browser harness now waits for the persisted pending-enrollment state, because successful revalidation replaces the request form rather than retaining its transient success element. These harness corrections do not change enrollment authorization or behavior.

Local test users and learning data are temporary; no production test accounts or emails are used.
