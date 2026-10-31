# Architecture

DarSak is a bilingual Next.js application using the App Router. Routes under `src/app/[locale]/` serve English and Arabic pages. `next-intl` provides locale routing and messages live in `messages/`.

## Application structure

- `src/app/` contains route pages, layouts, callbacks, and API endpoints.
- `src/features/` groups feature-specific server actions, data access, domain rules, and interface components. Current areas include authentication, student and teacher workspaces, groups, lessons, resources, reports, email, and administration.
- `src/components/` contains shared UI and navigation.
- `src/lib/supabase/` creates browser, request-scoped, and server-admin Supabase clients.
- `supabase/migrations/` defines the database schema and transactional operations. `supabase/functions/delete-account/` implements account deletion and its worker endpoint.

## Data and access

Supabase Auth handles email/password accounts and the optional Google provider. Postgres stores profiles, education catalogues, groups, enrollments, lesson schedules, resources, and operational records. Row-level security and database functions enforce access rules. Existing binary objects in Supabase Storage remain readable and removable, but the current launch policy does not allow new lesson-file, teacher avatar, cover, or CV uploads. Student profile image uploads are not supported.

Students can discover public teacher and group profiles, request enrollment, and access class lessons and resources after enrollment. Teacher contact details are available only to students with accepted enrollment. Admins review teacher applications, manage the education catalogue, and handle reports. Newly shared lesson resources must be links; new notes and file resources are rejected. Existing legacy binary objects remain readable and removable. Teacher applications may include an optional Google Drive CV link.

See [Caching](CACHING.md) for the public discovery cache boundaries, request-local viewer lookup, and private workspace cache behavior.

Teacher plan quota enforcement is disabled by default and only takes effect when its database configuration enables it and its effective date has arrived.

## Authentication and email

Email confirmation is enabled. Signup confirmation uses the numeric token supplied by Supabase, and the app accepts codes from 6 to 10 digits. Supabase Auth confirmation and recovery messages use the configured Auth SMTP provider. Password changes from account security require the current password. App notifications use a separate transactional outbox and Gmail SMTP worker, enabled only in production when its server environment is complete.

Google sign-in is optional and staged: configure Supabase's Google provider and callback URLs, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` for the app. New Google users choose a student or teacher role and complete role-specific account setup; returning users keep their existing role.

## Scheduled work

`vercel.json` schedules the email outbox and account-deletion workers. Both Vercel routes require `CRON_SECRET`. The deletion Edge Function has gateway JWT verification disabled because its handler validates each user bearer token and rechecks the user with Supabase Auth; destructive user requests also require password or fresh Google reauthentication. Worker requests require `ACCOUNT_DELETION_WORKER_SECRET`, whose SHA-256 hash must match `dars_private.account_deletion_worker_config.key_hash`.
