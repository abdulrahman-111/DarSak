#!/usr/bin/env bash
set -uo pipefail
if ! command -v psql >/dev/null 2>&1; then
 echo "SKIP: psql is not installed; run against local Supabase/PostgreSQL." >&2
 exit 2
fi
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"

# Fixtures run in this order. Each one runs even if an earlier one fails, so a
# single run reports every failure; the script exits non-zero if any failed.
# The avatar race/permission fixtures assume both avatar CAS migrations,
# including the post-rollout column revoke, are applied.
# tests/database/concurrency.sql is not listed: it is the postcondition for a
# manual two-session race (see its header) and needs that setup first.
# monthly_teacher_access_engine.sql and monthly_teacher_access_enforcement.sql
# are also not listed: they assert the monthly free-month/renewal model that
# 20261017191934_teacher_plan_quota_foundation.sql replaced (approved teachers
# now have open access and can_renew is false until plan quotas activate).
# The new model is covered by supabase/tests/teacher_plan_quota_*.test.sql.
# Rewrite or delete them once the quota rollout is final.
fixtures=(
  tests/database/foundation.sql
  tests/database/auth_role_fallback.sql
  tests/database/google_teacher_signup.sql
  tests/database/student_learning_profile.sql
  tests/database/student_group_recommendations.sql
  tests/database/account_setup_drafts.sql
  tests/database/security_hardening.sql
  tests/database/recurring_generation.sql
  tests/database/teacher_contacts.sql
  tests/database/teacher_profile_details.sql
  tests/database/teacher_avatars.sql
  tests/database/teacher_avatar_concurrency.sql
  tests/database/teacher_profile_covers.sql
  tests/database/lesson_preview.sql
  tests/database/lesson_generation.sql
  tests/database/schedule_slot_deletion.sql
  tests/database/public_schedule_visibility.sql
  tests/database/group_publication.sql
  tests/database/group_duplication.sql
  tests/database/discovery.sql
  tests/database/teacher_catalogue.sql
  tests/database/published_group_details_edit.sql
  tests/database/public_teacher_specialization_labels.sql
  tests/database/teacher_reviews.sql
  tests/database/teacher_applications.sql
  tests/database/teacher_management_controls.sql
  tests/database/teacher_enrollment_page.sql
  tests/database/teacher_dashboard_summary.sql
  tests/database/group_enrollment_page.sql
  tests/database/student_enrollment_page.sql
  tests/database/public_teacher_choices.sql
  tests/database/enrollment_schedule_stability.sql
  tests/database/student_resource_finder.sql
  tests/database/student_saved_groups.sql
  tests/database/student_schedule_overlap.sql
  tests/database/group_pinned_announcements.sql
  tests/database/lesson_attendance.sql
  tests/database/booking_requests.sql
  tests/database/booking_proposals.sql
  tests/database/waitlists.sql
  tests/database/assignments.sql
  tests/database/calendar_lesson_export.sql
  tests/database/user_notifications.sql
  tests/database/enrollment_accepted_notification.sql
  tests/database/email_outbox.sql
  tests/database/problem_reports.sql
  tests/database/teacher_rules.sql
  tests/database/group_learning_details.sql
  tests/database/unified_group_details.sql
  tests/database/student_class_workspace.sql
  tests/database/attended_feedback.sql
  tests/database/links_only_launch.sql
  tests/database/launch_health.sql
  tests/database/signup_email_availability.sql
  tests/database/rls_auth_uid_initplan.sql
  tests/database/account_deletion.sql
)

failed=()
for fixture in "${fixtures[@]}"; do
  echo "== $fixture"
  if ! psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f "$fixture"; then
    failed+=("$fixture")
  fi
done

echo
if ((${#failed[@]})); then
  echo "FAILED (${#failed[@]}/${#fixtures[@]}): ${failed[*]}"
  exit 1
fi
echo "All ${#fixtures[@]} database fixtures passed."
