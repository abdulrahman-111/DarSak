# Student learning profile

New students complete their full name, age range, school/university year or learning category, interests, and learning goal after signup. School name is optional. Existing students retain access and receive a completion prompt. English and Arabic forms support mobile layouts and editable profiles.

Private details are readable by the active owner and authorized administrators, never by teachers or other students. The owner-scoped save RPC validates every required value, saves the canonical name and learning profile atomically, and rejects stale versions. Existing shared-course selection retains its narrow offering_id update permission; new private fields cannot be written directly. The migration leaves existing students optional before enabling the required default for future signups. Authentication triggers, enrollment and lesson permissions remain intact.

Interests link to the existing teacher discovery search using its encoded `query` parameter. This is a discovery shortcut; no automated matching or age-based recommendation service is added.

Validation results are recorded in the associated pull request after the unit, SQL, API, lint, type/build and independent Sol browser checks complete. Local test users and data are removed after browser verification; no production fixtures are created.

Verified locally: 39 SQL suites, 173 real API assertions, lint, explicit typecheck, webpack production build, and six independent GPT-6.1 Sol browser checks passed. Browser coverage includes new-account redirect, stale-form retention and refresh, canonical name save, encoded discovery links, grandfathered dashboard access, Arabic mobile updates/no overflow, and private REST access restrictions. An initial API failure exposed the legacy offering_id permission regression; the final run passes after preserving only that column grant. An initial dashboard unit mock lacked the new query; it was corrected and the focused 13-test run passed.

Final complete unit run: 389 tests across 62 files passed.
