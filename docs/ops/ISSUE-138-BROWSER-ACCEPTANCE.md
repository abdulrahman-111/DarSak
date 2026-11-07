# Issue 138 browser acceptance

The four Playwright projects exercise English and Arabic on desktop and mobile against a local production build and isolated Supabase fixtures. Each project gets distinct users and database IDs. Browser assertions verify saved state after a reload; the existing assignment review, attendance, notification read, role access, and session-switch workflows remain in place.

This completion adds teacher-created manual lessons with reload verification, and a teacher reply to seeded published student feedback with the pending reply visible again after reload. Feedback replies are moderated before public display; the test verifies the teacher workflow and persisted pending state. Assignment feedback remains separately covered by the existing assignment workflow.

The remaining browser cases now cover a real notification inserted after its recipient's Postgres subscription is ready, arrival in an already-open inbox, persisted read state and recipient isolation. The same case starts with a failed viewer endpoint, exercising the server-authorized navigation fallback and its single notification subscription.

Viewer cases cover cold 503/network failures, recovery, a delayed real response after UI logout, same-browser role changes and guest navigation from discovery to registration without submitting signup. Display state stays in memory; a full document load waits for a fresh viewer read instead of restoring a sessionStorage snapshot. Server-authorized shell hints provide a display fallback when that read fails, with AI disabled for hint-only state. Successful API responses remain authoritative. All protected data and mutations still require server authorization.

The teaching-access cases use a separate teacher and resources. One control proves approved teachers retain free-phase access when only legacy dates expire. The other withdraws that fixture's approval, checks protected redirects, submits an already-open form and verifies no lesson was written. Targeted fixture changes are restored in `finally`; global policy and immutable grant/review history are not rewritten. The existing operator synchronization trigger may append its normal review events for this synthetic teacher.

Generated seed SQL is checked without a database by `node tests/e2e/support/seed.test.mjs`, including the new actor and resource IDs. Run `npm run e2e` on the isolated fresh stack for actual integration; code and fixture checks alone do not establish browser acceptance. CI results and deployed verification are recorded in the issue's closing comment. No retries are configured.

Signup/email verification and production email delivery remain deferred under #90/#143. File uploads are disabled at launch, so these cases verify private resource/lesson authorization rather than claiming a private Storage download workflow; enabled-upload acceptance remains with #159. Axe, Lighthouse and CSP acceptance remain in their own roadmap issues. Desktop coverage remains 1280×900, alongside 390×844 mobile, in English and Arabic.

## Negative-control evidence

Both controls were run on 2026-11-04 against a loopback local database and a production build in Chromium, using the EN desktop project. The temporary mutations were applied to the isolated database only and were removed before rerunning the checks. The app harness refuses non-loopback targets; no shared or hosted database was used.

To make the notification read persistence assertion fail, the control replaced the body of `mark_notification_read` with `BEGIN RETURN; END`, preserving its UUID parameter, void return type, security-definer setting, and search path. The `opening a seeded notification marks it read and clears its badge after reload` test failed as expected at its `read_at` non-null assertion. The original function was restored and the notification test passed.

To make cross-student lesson authorization fail, temporarily add a separate permissive policy:

```sql
create policy e2e_negative_lesson_read on public.lessons
for select to authenticated using (true);
```

Then remove only that temporary policy:

```sql
drop policy e2e_negative_lesson_read on public.lessons;
```

The `an outsider cannot see another student’s class, lesson, or private resource` test failed as expected at the outsider's direct PostgREST lesson query, receiving the foreign lesson instead of an empty result. The existing `lesson_read` policy was left unchanged; after dropping the temporary policy, the security test passed. Both restored browser checks passed together (2/2, no retries).

## Acceptance ledger

| Acceptance area                                                                                                        | Implementation and browser evidence                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Teacher-created manual lessons and moderated feedback replies persist after reload                                     | `tests/e2e/learning.spec.ts`                                        |
| Notification read state persists; a live notification reaches the open inbox and remains recipient-scoped              | `tests/e2e/notifications.spec.ts`                                   |
| Viewer failures recover safely across logout, account and role changes, and guest registration navigation              | `tests/e2e/viewer-state.spec.ts` and `tests/e2e/security.spec.ts`   |
| Teaching access remains available in the approved free phase and withdrawal blocks protected reads and writes          | `tests/e2e/teacher-access.spec.ts`                                  |
| Browser coverage runs in English and Arabic on desktop and mobile, against the production build, with retries disabled | Four Playwright projects in CI; 1280×900 desktop and 390×844 mobile |

The clean browser CI run [42371237124](https://github.com/abdulrahman-111/DarSak/actions/runs/42371237124) used head commit `b79ecfd`, whose tree is identical to the source commit `95e0770` merged into `main`. It recorded 112 passing browser tests with zero retries across the four projects. Record the exact head commit's CI result in the Issue 138 closing comment; do not substitute this baseline run for final-head evidence.

Signup and production email delivery remain excluded under #90 and #143. Private upload/download acceptance remains excluded while uploads are disabled; the current cases cover links and authorization, with enabled-upload coverage tracked by #159. Axe, Lighthouse, CSP, and the separately tracked work in #139, #140, #151, and #153 remain outside this issue's acceptance scope.

## CI negative-control protocol

PR #207 is an intentionally unmerged negative-control demo. Its CI run 42391093011 is pending review of the actual run evidence; this document does not claim that the run failed or that both controls produced their expected browser failures. Record the observed jobs, test names, and assertion outcomes in Issue 138's closing comment after reviewing that run. Keep PR #207 unmerged and separate from the real Issue 138 change.

The negative-control SQL and workflow step exist only on the demo branch for PR #207. The real Issue 138 change contains no negative-control SQL or application changes. The controls target only the fresh CI-local Supabase database at `127.0.0.1:54322`; they are not migrations or production changes. The dated local evidence above remains historical and separate from CI evidence for PR #207 and from exact-head acceptance results.
