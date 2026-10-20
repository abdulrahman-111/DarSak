#!/usr/bin/env bash
set -euo pipefail
if ! command -v psql >/dev/null 2>&1; then
 echo "SKIP: psql is not installed; run against local Supabase/PostgreSQL." >&2
 exit 2
fi
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/foundation.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/auth_role_fallback.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/google_teacher_signup.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/student_learning_profile.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/account_setup_drafts.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/security_hardening.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/recurring_generation.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_contacts.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_profile_details.sql
# The avatar race/permission fixtures assume the app is live and both
# avatar CAS migrations, including the post-rollout column revoke, are applied.
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_avatars.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_avatar_concurrency.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_profile_covers.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/lesson_preview.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/lesson_generation.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/schedule_slot_deletion.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/public_schedule_visibility.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_publication.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_duplication.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/discovery.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_catalogue.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/published_group_details_edit.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/public_teacher_specialization_labels.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_reviews.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_applications.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_management_controls.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_enrollment_page.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_dashboard_summary.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_enrollment_page.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/student_enrollment_page.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/public_teacher_choices.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/enrollment_schedule_stability.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/student_resource_finder.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/student_saved_groups.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/student_schedule_overlap.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_pinned_announcements.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/lesson_attendance.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/calendar_lesson_export.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/user_notifications.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/monthly_teacher_access_engine.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/monthly_teacher_access_enforcement.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/email_outbox.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/problem_reports.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_rules.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_learning_details.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/unified_group_details.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/student_class_workspace.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/attended_feedback.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/links_only_launch.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/launch_health.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/signup_email_availability.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/rls_auth_uid_initplan.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/account_deletion.sql
# tests/database/concurrency.sql is not run here: it is the postcondition for a
# manual two-session race (see its header) and needs that setup first.
