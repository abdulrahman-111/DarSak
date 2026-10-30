# Local database restore rehearsal — 2026-10-30

This was a synthetic-data rehearsal using the disposable local Docker container `supabase_db_darsak-roadmap-20261029`. It dumped source database `postgres` in custom format and restored to a new database named `darsak_restore_rehearsal_20261030` in the same PostgreSQL 15.19 container.

The dump was 1,464,124 bytes and took 271 ms. Recreating the target and running `pg_restore` took 1.674 seconds; that figure excludes manual grant repairs and validation, and is not an RTO measurement. After restoring, the target contained 83 migration-history rows, 24 `auth.users` rows, and 34 logical public tables with 143 rows total. All 34 public tables had RLS enabled. The exact public-table counts, read from the restored target after testing, were:

```text
account_setup_drafts=0, assignment_submissions=2, booking_requests=0, booking_slots=0,
education_nodes=9, enrollments=4, group_assignments=6, group_learning_details=4,
group_lesson_exclusions=0, group_pinned_announcements=0, group_schedule_slots=4, groups=4,
lesson_attendance=2, lesson_materials=6, lessons=8, notifications=0, offerings=3,
platform_settings=2, profiles=24, reports=0, student_profiles=20, student_saved_groups=0,
subjects=3, teacher_applications=4, teacher_contacts=0, teacher_profile_details=4,
teacher_profiles=4, teacher_review_events=8, teacher_review_state=4,
teacher_rules_acceptances=0, teacher_specializations=4, user_notification_preferences=0,
user_notifications=14, waitlist_entries=0.
```

All ten SQL suites under `supabase/tests` passed with `pg_prove` as database role `postgres`: 304 assertions. Test-created Auth fixture rows were absent after the suites. Ownership checks matched for 305 non-extension routines, including `public.publish_group`; RLS policy metadata matched across 70 policies. The restore needed manual database-level ACL grants and `graphql` / `graphql_public` schema grants before effective grants matched. These repairs are not automatic parts of this archive workflow.

The restore reused the existing cluster roles; global role definitions are not included in a database-only `pg_dump`. Database-specific settings and Auth provider configuration were not restored. Storage object payloads were outside the exercise. The source was active during the rehearsal and received a SanDak quota SQL update in that window; `public.sanad_reserve_request` therefore differed from the final live source when compared. Counts above come from the restored target, not a later comparison with the changing source. This record does not establish full archive parity, hosted recovery capability, configured backups or PITR, or a completed Storage/Auth restore.

The restore database, dump, and temporary test files were removed after validation. The source database was left in place.
