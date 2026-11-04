# Issue 138 browser acceptance

The four Playwright projects exercise English and Arabic on desktop and mobile against a local production build and isolated Supabase fixtures. Each project gets distinct users and database IDs. Browser assertions verify saved state after a reload; the existing assignment review, attendance, notification read, role access, and session-switch workflows remain in place.

This completion adds teacher-created manual lessons with reload verification, and a teacher reply to seeded published student feedback with the pending reply visible again after reload. Feedback replies are moderated before public display; the test verifies the teacher workflow and persisted pending state. Assignment feedback remains separately covered by the existing assignment workflow.

The current suite does not prove a lapsed teacher cannot continue teaching, or a notification arriving live while the inbox is already open: its notification is seeded before the browser starts. Those scenarios remain open for issue 138. Signup email and production email delivery are outside this task. No retries are configured.

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
