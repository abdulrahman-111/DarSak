# Deployment and operations

## Pilot authentication

The user has chosen a non-commercial pilot without email delivery. Configure Supabase Email provider with **Confirm email disabled**. Users register with email and password and can sign in immediately. Email ownership is not verified in this configuration. Do not expose a password-reset control claiming that a recovery email was sent; add custom SMTP and confirmation/recovery later. Existing signed-in users can change their password. Operator-assisted recovery is through the Supabase dashboard after verifying the user's identity outside the application.

## Local development

Use Node 22 and Docker. Install with `npm ci`, start the backend with `npx supabase start`, and obtain local API values from `npx supabase status`. Put the local API URL and publishable/anon key in `.env.local` using `.env.example`. Keep the service-role key outside the application environment unless running an operator/test command. `npx supabase db reset` applies migrations and catalogue seeds to the local instance; it destroys only the selected local development database, so never use it as a production deployment command.

Start the application with `npm run dev`. Register separate student and teacher accounts through the UI. Register an operator account and promote its UUID with `scripts/bootstrap-admin.mjs`, supplying the local URL and service-role key only to that process. Admin then approves the teacher. Demo/test accounts must never be seeded automatically into a cloud project.

## Supabase cloud

1. Create/select a Free project in the intended account. Record the project reference, API URL and publishable key without committing secrets.
2. Link the CLI: `npx supabase login`, then `npx supabase link --project-ref <reference>`.
3. Review migrations and run `npx supabase db push`. Seed only the academic catalogue using the checked-in seed SQL, not local test users.
4. Confirm RLS, private bucket restrictions and function grants were applied. Disable email confirmation for the pilot.
5. Set Site URL to the production app origin and restrict redirect URLs to known production/preview origins. Do not grant unrestricted arbitrary redirects.
6. Create the first administrator through the operator bootstrap. Verify unapproved teachers cannot publish before approving pilot teachers.

## Vercel

The user confirms this is a non-commercial application. Use Hobby only while eligible. Import the intended GitHub repository or use the official Vercel CLI. Framework is Next.js, install is `npm ci`, build is `npm run build`. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the target environment. Never configure a service-role key as a NEXT_PUBLIC variable. Preview environments must not run destructive tests against production data.

Use the provided vercel.app domain initially. Verify both /ar and /en, fresh signup/login, admin approval, group publication, enrollment, schedule, lesson generation and private downloads on the deployed origin. Local green tests alone do not establish cloud deployment success.

## Backups and quotas

Supabase Free has no automatic backups. Before the pilot, export database data/schema using the Supabase CLI's documented dump process and copy private Storage objects separately. Store exports encrypted outside Git, with controlled operator access. Prove restoration into a disposable project; a SQL dump does not include Storage file bytes or all managed authentication configuration. Record auth settings and bucket policies alongside the restore procedure.

Monitor database size, object storage, egress and active users in the Supabase dashboard. Use the application file limit and quotas; archive unneeded resources deliberately. Do not keep a Free project artificially active. Expect pausing after inactivity and follow the provider's restore workflow. Review plan suitability before larger cohorts, revenue-related use or stronger uptime promises.

## SMTP later

Configure a supported SMTP provider, verify the sender domain, set confirmation/recovery templates in both languages where supported, add callback/recovery routes and end-to-end tests, then enable confirmation for new users. Do not silently change existing account access. Test delivery with a non-team email account before announcing recovery support.

## Current external prerequisites

At implementation start, no Supabase or Vercel deployment credentials or connected projects were present. Their plugins are discoverable but not installed. Local development and verification can proceed independently. Cloud launch is pending authenticated account access and project selection, not assumed complete.
