#!/usr/bin/env bash
set -euo pipefail
if ! command -v psql >/dev/null 2>&1; then
 echo "SKIP: psql is not installed; run against local Supabase/PostgreSQL." >&2
 exit 2
fi
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/foundation.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/security_hardening.sql
psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 -f tests/database/recurring_generation.sql
