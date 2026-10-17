# Application and discovery refinements

Normal account password changes require the current password, independently verified using an isolated, non-persistent client and the verified account email. Only the original request session updates the password. Recovery requires a fresh successful recovery callback and a short-lived HMAC proof bound to the verified user and session. AUTH_RECOVERY_SECRET is server-only, minimum 32 bytes, and is provisioned separately for production and preview. Missing configuration fails closed.

Teacher CVs are optional Google Drive links (HTTPS, exact drive.google.com host, maximum 500 characters), visible through the existing private owner/admin application flow. Submitted snapshots retain the link. Existing uploaded CVs remain readable and are shown independently of a newer Drive link. New forms do not upload CVs. Required experience, qualification, photo, phone, specialization and attestation checks remain.

Setup includes bilingual examples and visible character limits. Teachers can create a private subject and select its new combination without leaving setup. Only selectable levels are offered. The pair validator accepts canonical PostgreSQL UUIDs, including legacy seeded IDs, while rejecting malformed identifiers; database ownership checks still apply.

Students retain full discovery filters and paging. Guests see a fixed preview of up to three teachers and three groups with a student registration prompt. Teachers/admins are redirected from the discovery listing and do not see its global navigation link. Admin navigation says Reports; teacher navigation says Report a problem. Individual public share pages and existing public-data read policies are preserved; this is browser access behavior, not a new confidentiality boundary.

## Validation

- Full unit suite: 488 tests across 78 files passed.
- Focused database scripts: teacher_applications.sql, account_setup_drafts.sql and teacher_catalogue.sql passed, including no-CV completion, valid/invalid Drive URLs, private reads and legacy snapshots/download authorization.
- Existing real local API suite: 173 assertions passed.
- ESLint and typecheck passed. Webpack production build passed before the final canonical-ID validator adjustment; final release build pending.
- GPT-6.1 Sol reviewed application/privacy, discovery, password/recovery and wizard fixes. Desktop and Arabic mobile browser navigation checked for guests, students, teachers and admins; local preview data is empty, so populated preview limits are verified by bounded-query unit tests.
- Root real browser checks reject a wrong current password, accept a correct password change, and reject ordinary sessions on the recovery route. Final genuine recovery and custom-subject setup checks are pending.
- Early integration failures included obsolete upload tests, a synchronous helper exported from a server-action module, a stale admin navigation label, and strict UUID validation rejecting seeded categories. These were corrected. Initial recovery assumptions were tested against local GoTrue: AMR is otp, and current_password can be ignored without a provider flag. The implementation uses explicit password verification and signed recovery proof instead.
- No production test accounts, test emails, or destructive production tests were used. New CV migration applied in production; nullable column, RLS, denied anonymous read/save, authenticated save and optional-CV criterion verified by metadata queries.

## Hosting follow-up

Vercel project renamed darsak. darsak.vercel.app is owned by another team; darsak-platform.vercel.app was attached as the available alternative. Existing login origin is preserved until hosted Supabase Site URL/redirect configuration can be changed. The connected Supabase tools cannot change Auth settings. Repository rename to DarSak is requested but unavailable through the connected GitHub operations; CLI authentication is unavailable. Existing repository and PR references remain valid.
