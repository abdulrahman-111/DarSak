# Dashboard, navigation and management release

This release improves the student, teacher and administrator dashboards, visible mobile navigation, active-page feedback, student class/material/discovery screens, and public group sharing. English and Arabic remain supported. Sharing requires the actual public group projection; an authorized owner-only fallback does not expose sharing controls.

Teachers and administrators can cancel/archive groups, which cancels future scheduled lessons and rejects pending requests while preserving accepted memberships, history and materials. Permanent deletion is limited to unused draft/archived groups and eligible future manual lessons without materials or stored files. Generated lessons retain their identity and use cancellation instead. Existing authorization checks remain in the database and server actions.

Monthly renewal and the final email/password-recovery phase were skipped by the user. Attendance, calendar export and new notifications are deferred.

## Validation results

- `npm test`: 178 tests passed in 26 files.
- `npm run lint`: passed with zero errors and one existing `profile-cover-editor.tsx` image warning.
- `npm run build -- --webpack`: passed, including TypeScript, on final product commit `6a6b2d02ed1c7e75f3a92f14400c52a40c766278`. Final changed-page/action ESLint and standalone typecheck also passed. Local Webpack is used because this environment previously failed to run Turbopack.
- Fresh application migrations and seed atop the local Supabase framework: all 16 registered SQL suites passed with the final SQL source. The throwaway database was removed; existing local data was not reset. This validates application migrations, not a full Supabase service bootstrap.
- Local authenticated API: 169 assertions passed. Earlier failures came from management fixtures using an owner as a foreign actor, reusing a suspended actor, and expecting an accepted enrollment after an earlier test removed it. Explicit management fixtures corrected those assumptions. The final assertions separately verify cancellation, enrollment/history/material retention and stale create/generate/reschedule denial.
- Sol approved final product commit `6a6b2d02ed1c7e75f3a92f14400c52a40c766278`. Reported issues are resolved: restored admin publish/draft controls, live archived-status checks after the calendar lock, and deletion redirects with accessible localized feedback.
- Local production-build browser checks passed: student/teacher/admin dashboards and keyboard-accessible active navigation in EN/AR at 390px without overflow; admin draft/publish/archive controls; share controls visible only for actual public projection; generated-lesson cancellation; archive confirmation, accepted memberships, cancelled future lessons and retained materials/history; student archived-class links and materials access.
- Browser checks initially required setup corrections: use the supported publication RPC and explicitly handle native confirmation dialogs. They then identified lost feedback when deleting from a detail page. After the redirect fix, only the affected flows were repeated: English teacher group deletion, Arabic teacher lesson deletion, and Arabic admin group deletion at 390px. Dismissals preserved rows; accepted deletions removed rows, redirected to the correct list, and displayed localized success feedback. All disposable local fixtures were cleaned up.

## Preview incident

The earlier preview `dpl_49omZSHbwskHRZjHKzgEnJYjSGqC` failed with `git_info_fail` before the application build. A redeploy using the existing Git integration succeeded: `dpl_3BFNKyL4VGp7uivwncz8gTJ3AVHp`, READY at commit `2e9d3f56225646d93997eb0fb627e1d7daf6bb53`. This did not require an application-code workaround. Detailed Vercel logs returned a scope permission error; deployment metadata and the successful replacement build provide the available evidence.

Deployment readiness is verified through Vercel metadata. Direct hosted HTTP/browser verification is unavailable from this workspace; browser validation used the final local production build against local Supabase. Production teacher contacts and real approvals were not changed for testing.

## Database release

Applied only `20261012131933_teacher_management_controls.sql` to production as migration `20261012141641` (`teacher_management_controls`), SHA-256 `4c5be2378b7246e6b3d28169e9ebc7d69fc25c4392d1f3e5331cbfa0e4fb5976`. Production migration count is 23. Before/after counts were unchanged: 9 profiles, 1 approved teacher, 5 groups and 12 lessons. No real accounts, groups, lessons, materials or approvals were changed for testing.
