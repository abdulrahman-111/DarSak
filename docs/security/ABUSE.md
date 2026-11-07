# Abuse controls and remaining gaps

This inventory records controls visible in this repository. Provider-side limits
and deployed configuration are not inferred from local code or mocks.

## Existing controls

- **Admin login:** `apps/admin/src/app/[locale]/login/actions.ts` checks
  `loginAllowed` before password verification and records failed attempts in
  `apps/admin/src/lib/login-throttle.ts`. Migration
  `supabase/migrations/20261028153000_admin_login_attempts.sql` stores SHA-256
  email/IP hashes and defines public callable throttle functions. The admin
  README documents the 5 failures per email and 20 per IP per 15 minutes limits
  and possible temporary account lockout. The action permits password sign-in
  only when the RPC returns the boolean `true`; a blocked result uses the same
  generic credentials response as a wrong password, while RPC errors, thrown
  calls, and malformed results return the localized unavailable response. The
  throttle remains best-effort against direct public-key RPC calls: the functions
  are publicly callable, and concurrent failure recording is not an atomic
  per-attempt gate. TOTP remains separately required.
- **Problem reports:** `src/features/reports/actions.ts` requires a signed-in,
  active student or teacher and validates bounded subject, description, and page
  path input. `supabase/migrations/20261016141942_problem_reports.sql` serializes
  submissions per reporter with a database advisory lock, returns the existing
  report reference without inserting a duplicate within 60 seconds, and caps each
  reporter at 5 reports per hour. These SQL limits are shared across application
  instances, but apply only to the report endpoint. The action maps hourly-limit
  errors to a wait message; the duplicate case returns the existing reference.
- **Assistant:** `src/app/api/assistant/route.ts` bounds request bodies, requires
  same-origin requests and an active student/teacher, and reserves a persistent
  quota lease before provider work. `src/features/assistant/quota.ts` calls the
  reservation and release RPCs; the deployed limits are passed from
  `src/features/assistant/config.ts`. A refused reservation returns 429 with
  `Retry-After: 60`. This is conservative minimum retry advice, not an exact
  reset time: minute, daily, global, and in-flight limits share this response.
- **Authentication:** `src/features/auth/actions.ts` uses CAPTCHA options for
  login and signup, and delegates password and email-send throttling to the auth
  provider. Recovery responses are neutral for identity-dependent outcomes.
  Signup deliberately surfaces `user_already_exists` / `email_exists` as
  “This email is already registered” in `src/features/auth/errors.ts`; this
  preserves the product's duplicate-email signup UX and carries an email
  enumeration tradeoff. Login, registration, and recovery do not have a
  repository-owned shared request limiter. Local mocks do not establish
  provider-side CAPTCHA, rate-limit, or response-timing behavior.
- **Calendar and viewer:** `src/app/api/calendar/route.ts` requires an active
  signed-in student or teacher, validates date ranges, caps exported event counts,
  and calls the permission-checked `calendar_lesson_export` RPC from
  `supabase/migrations/20261014122647_calendar_lesson_export.sql`. The viewer
  endpoint (`src/app/api/viewer/route.ts` and
  `src/features/platform/viewer-state.ts`) returns a display-only private,
  per-user snapshot. These are access and data-size controls, not frequency
  limits.
- **Signed-in mutations:** server actions and database RPCs perform
  authentication, ownership, role, and state checks at their respective
  boundaries. Examples include `src/features/reports/actions.ts` and the
  calendar RPC above. These checks do not amount to a shared request-frequency
  limit.

## Remaining gaps

The repository does not provide one shared rate limiter for public auth flows,
calendar exports, or signed-in mutations. Problem reports have the specific
per-reporter duplicate and hourly caps listed above; those limits do not cover
other request paths. Provider-side controls and actual auth timing behavior
require deployment-level verification; unit tests with mocked providers cannot
prove them. Admin login throttling is specific to that portal and has the
fail-open condition documented above. The assistant retry header does not
disclose which quota dimension blocked the request or its exact reset time.
These gaps remain open for issue #156.
