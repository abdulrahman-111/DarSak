# Role-aware Home and navigation

Active students, teachers and administrators now open their respective locale dashboard from Home and the header logo. Default login goes directly to that dashboard; the strict same-locale group/class return-path allowlist remains supported. Anonymous visitors retain the public landing page and everyone can browse groups. Missing or suspended profiles do not receive an active role destination. Generic English/Arabic loading feedback is available during route transitions.

The server-only request viewer uses React `cache()` to share verified Auth identity and the canonical own-profile query within one server-rendering request. There is no persistent or cross-user cache. Proxy verification, fresh login profile lookup, mutation checks and existing database authorization remain in place. No dependency, database schema or migration changed.

## Navigation diagnosis and measurements

An instrumented local production server recorded only outbound endpoint paths, response status and elapsed time; headers, cookies, tokens and profile bodies were not logged. Three disposable role fixtures made isolated authenticated HTTP GETs with browser pages closed to avoid prefetch contamination.

| Role | Before: profile endpoint calls | After: profile endpoint calls | Auth verification calls before/after |
| --- | ---: | ---: | ---: |
| Student | 3 | 1 | 2 / 2 |
| Teacher | 3 | 1 | 2 / 2 |
| Admin | 4 | 3 | 2 / 2 |

The admin totals include two required student/teacher count queries; the remaining own-profile lookup is now one. Both Auth calls remain: proxy verification and server rendering. The old login trace passed through `/en/dashboard` before the role page; the new EN/AR login traces reach the role dashboard directly.

These measurements establish reduced database work and one fewer redirect. Single local response timings varied (before student/teacher/admin: 206/127/127 ms; after: 143/139/256 ms), so they do not establish a production speed percentage or latency guarantee. Production network latency was not measured.

## Validation

- `npm test`: all 185 tests passed in 26 files. The first full run hit a test-only `server-only` import boundary in the public catalogue suite; mocking its unused request viewer fixed the test while preserving the product guard. The affected 25 tests and then the complete suite passed.
- `npm run lint`: zero errors and one existing profile-cover image warning. Changed files passed scoped ESLint.
- Standalone typecheck and final product `npm run build -- --webpack`: passed. Later changes were test/documentation only.
- Sol approved product `deb1587387f59e4176852e4a67940741837e15c7`, including request isolation, Auth/status guards, redirects, safe return paths and EN/AR loading feedback.
- Browser/API flows on the local production build passed: anonymous EN/AR landing and visible mobile discovery; default EN/AR login for all three roles without the generic dashboard hop; role-aware header logo; localized signed-in Home redirects; real public-group login return; wrong-role denial without teacher workspace exposure; suspended/missing-profile denial settling at login without loops. Fixtures were cleaned up.
- Browser setup assertions were corrected for hidden desktop versus visible mobile links and intermediate guarded redirects. Successful role flows were retained while only the remaining account-denial checks were repeated.

Hosted release readiness is verified through Vercel deployment metadata at the exact commit. Direct hosted browser/HTTP verification is unavailable from this workspace; browser and call-count evidence is from the local production build with local Supabase. Existing database suites were not repeated because no SQL, policies or migrations changed.
