# Staged signup setup and Account organization

New teacher and student accounts enter one guided setup after password/email-code verification or Google authentication. Teachers complete About you, Background, What you teach, Private verification, and Review. Students complete About you, Learning, and Review. Required content may be in English or Arabic; both translations are not required.

Progress saves on navigation or Save and exit, which opens Account so an incomplete student's dashboard guard cannot immediately reopen setup. Private owner-only drafts use version checks. Final completion uses existing canonical validators in one transaction, preserves contacts and current avatar, and does not grant teacher approval. A changed canonical profile leaves the draft intact and offers a confirmed restart from the saved profile with a newer version. CVs remain private, PDF-only, at most 5 MiB and insert-only; photos retain the existing 2 MiB CAS upload flow. Existing approved teachers and optional migrated student profiles bypass required setup.

Account now owns profile, application/status, learning profile, security, teaching access, and deletion. Old personal routes redirect to the corresponding Account pages. Review-decision emails and notifications open the application status. Account overview is independent of the deletion Edge service. Deletion Google intent/session/proof checks remain, with callbacks returning to Account/delete. No new subscription or email-delivery service was enabled.

## Validation

- Final integrated unit suite: 474 tests across 75 files passed; ESLint, typecheck, and webpack production build passed.
- Database: 43 SQL files pass, including owner privacy, draft version checks, failed-finalization rollback, student/teacher successful completion, canonical conflicts, and monotonic restart. The legacy teacher-review test initially failed because it assumes no historical review events; the local guardian admin's fixture event was excluded only inside that test's rollback. No production history was deleted.
- The local concurrent-session regression `python3 tests/integration/setup-lock-order.py` passes: setup waits for the student row before locking the base profile, matching completion and profile-edit lock order.
- API: 173 existing real local API assertions passed, including permissions, capacity, schedule generation/concurrency, private contacts/materials, suspension, and teaching operations.
- Browser: GPT-6.1 Sol completed the Arabic mobile student flow, including login routing, Save and exit, resume, Back, reload, completion, and Arabic-interest deduplication. The controller completed teacher photo/languages/background/zero-years/specialization/new-private-CV/attestation/review/submission, verified a submitted snapshot with approval still false, and checked Account pages, Arabic mobile layout, and legacy redirects. A concurrent profile edit was rejected; confirmed restart loaded the new canonical name. A recovered setup URL with an old load=error flag opens the form rather than remaining stuck.
- Browser fixtures and uploaded files were removed; the local guardian admin was preserved. No production test users or emails were created.
- Sol reviewed Account, shared auth routing, database, and wizard changes and fixes. Further independent review/browser work stopped at the session usage limit; controller review and validation continued.

Live Google OAuth consent and actual production inbox delivery were not exercised. The shared post-auth routes are unit tested; SMTP quotas and production OTP lifetime are unchanged. Initial integrated unit failures were stale route expectations plus an availability-RPC mock after integrating the hotfix; those test contracts were corrected before final verification.
