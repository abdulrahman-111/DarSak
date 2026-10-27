# Floating Sanad and feature highlights implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for scoped Luna implementation and Sol review.

**Goal:** Make Sanad discoverable on every localized page and show DarSak's current capabilities clearly on its bilingual landing page.

**Architecture:** Mount one server-derived assistant launcher in the locale layout, with an accessible fixed icon and the existing native dialog. Guests get public help and sign-in guidance; active users retain current role guidance and the existing restricted AI endpoint. Expand server-rendered landing highlights with truthful feature copy and a separate clearly labelled pilot section.

**Tech Stack:** Existing Next.js/React, Tailwind, lucide icons and brand SVGs; no new packages or database changes.

**Design:** A global launcher is preferable to one per dashboard: it covers public, account and auth pages without duplicate buttons. Keep role/auth checks server-side and reuse React-cached viewer/status reads. Use a 56px logical-end floating target above the mobile workspace bar and safe-area inset, below navigation overlays, with subtle reduced-motion-aware interaction. The dialog remains keyboard accessible, and closes on route/identity changes. Do not fetch capability status until opened; guests never request AI status. No new inference permissions.

**Landing scope:** Show current profiles/catalogues, discovery/saved groups, enrollment/contact after acceptance, schedules/classes/link resources, assignments/feedback/attendance, one-off sessions/time requests, matching requests/waitlists, teacher scheduling/lesson-management tools, sharing/notifications/reports. Sanad and automatic Google Meet remain explicitly staging pilots; do not imply general availability or verified live inference. No pricing, payment, renewal or email delivery promises.

## Review focus

- One launcher on every route, including guest/auth pages, without exposing protected guidance or AI access.
- Mobile navigation and launcher do not overlap; modal, keyboard focus, safe areas and RTL behave correctly.
- No stale chat crosses routes/accounts; no added eager provider/status requests or duplicate uncached viewer reads.
- Feature wording matches implemented workflows and clearly separates restricted pilots.

## Tasks

- [ ] Luna: global launcher, guest guidance, floating icon, remove shell duplicate, focused regression checks.
- [ ] Luna: bilingual landing feature sections using existing assets and routes, preserving role redirects.
- [ ] Luna: opening an unread notification performs an authorized POST, marks only that notification read, refreshes unread counts and navigates to its server-derived destination. Rendering/prefetching the list never marks notifications read; failure stays visible and retryable.
- [ ] Sol: review completed source, correct actionable findings, test guest/student/teacher/admin mobile/desktop English/Arabic in browser.
- [ ] Root: unit/lint/typecheck/format/build; PR into staging, CI, merge and deploy only staging; verify exact commit, aliases and localized pages.
