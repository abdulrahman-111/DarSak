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
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/security_hardening.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/recurring_generation.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_contacts.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_profile_details.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_avatars.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_profile_covers.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/lesson_preview.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/lesson_generation.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/schedule_slot_deletion.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_publication.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/group_duplication.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/discovery.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_catalogue.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/public_teacher_specialization_labels.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_reviews.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_management_controls.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/teacher_enrollment_page.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/enrollment_schedule_stability.sql
