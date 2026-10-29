# Configuration and secrets

This inventory lists names and responsibilities, never values. It covers the public app,
the separate production administrator app, the isolated staging app, and Supabase.
Current scope uses existing free plans. Email operations and paid integrations are deferred.

## Inventory

| Names                                                                                                                                       | Location and access                                                                                                                                     | Rotation or review                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                                          | Public app and matching staging environment; admin uses the production project. Browser-visible configuration, not secret authorization.                | Review on backend/key changes; deploy after replacement. RLS remains mandatory.                                                  |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                                 | Public build configuration in the appropriate Vercel project.                                                                                           | Review with domain/provider changes.                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                                                                 | Supabase and public app server workers where required; operator-only access. Never in the admin app or browser. Staging must use its own project's key. | Rotate immediately on suspected disclosure; quarterly access review.                                                             |
| `AUTH_RECOVERY_SECRET`                                                                                                                      | Public app server-only Vercel Secret; separate production and staging values.                                                                           | Rotate on disclosure and review quarterly; rotation invalidates outstanding recovery proofs.                                     |
| `ACCOUNT_DELETION_WORKER_SECRET`                                                                                                            | Public app server-only Vercel Secret. Only its SHA-256 digest belongs in `dars_private.account_deletion_worker_config.key_hash`.                        | Rotate on disclosure; review quarterly. Update the worker and digest together, then test synthetic deletion on staging.          |
| `CRON_SECRET`                                                                                                                               | Public app server-only Vercel Secret authenticating existing scheduled routes.                                                                          | Rotate on disclosure; review quarterly. Operational changes and rotation are deferred while email/cron work is excluded.         |
| `GEMINI_API_KEY`                                                                                                                            | Public/staging app server-only Vercel Secret. Never in the admin app. Prefer distinct provider keys for each environment.                               | Rotate on disclosure and review provider restrictions/usage monthly. Do not activate billing or a paid key as part of this work. |
| `SANAD_ENABLED`, `SANAD_USER_DAILY_LIMIT`, `SANAD_USER_MINUTE_LIMIT`, `SANAD_GLOBAL_DAILY_LIMIT`, `SANAD_GLOBAL_CONCURRENCY`, `CSP_ENFORCE` | Server configuration; no credential values.                                                                                                             | Review alongside assistant/security releases. Quotas do not guarantee zero provider charges.                                     |
| `ADMIN_APP`, `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `SUPABASE_EXPECTED_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_EXPECTED_PROJECT_REF`                 | Environment identity controls; admin production-only. These are configuration, not secrets.                                                             | Review whenever a deployment target changes.                                                                                     |
| Google OAuth client secret                                                                                                                  | Supabase Auth provider configuration; operators only. Google sign-in client IDs are public identifiers.                                                 | Rotate in Google Cloud and update Supabase together on disclosure; quarterly access review.                                      |
| Turnstile secret                                                                                                                            | Supabase Auth CAPTCHA configuration when enabled; operators only. The site key is public.                                                               | Rotate through Cloudflare and update the consuming provider; quarterly access review.                                            |
| `GMAIL_APP_PASSWORD` and Auth SMTP credentials                                                                                              | Existing worker Vercel Secret and Supabase Auth SMTP respectively; operators only.                                                                      | Inventory only: email delivery, credentials, and rotation are outside the current scope.                                         |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                                                | Supabase Edge Function runtime. Privileged keys stay server-only; use the matching backend's managed values.                                            | Follow Supabase's supported key rotation process; verify deletion function authentication afterward.                             |
| GitHub Actions `GITHUB_TOKEN` / `GH_TOKEN`                                                                                                  | Ephemeral token supplied by GitHub to the running job; release job alone has write access.                                                              | Automatically expires. Do not create a personal token for normal CI.                                                             |
| Deployment credentials and local operator tokens                                                                                            | Hosting/CLI credential stores, outside git. Access limited to maintainers.                                                                              | Revoke unused tokens; quarterly access review and immediate revocation on disclosure.                                            |
| Future gateway and VAPID private keys                                                                                                       | Not provisioned by this change; inventory them before introducing the feature.                                                                          | No paid gateway, payment, or push service is activated here.                                                                     |

Vercel project members with environment-management permission can replace Secrets;
application runtime can consume them. Config values may be readable to members and
`NEXT_PUBLIC_*` values are sent to browsers. Supabase operators can administer provider
secrets. GitHub reviewers and ordinary app users must not receive privileged values.

## Environment separation

- The public production app uses the live backend. Staging uses its own backend and
  synthetic accounts. The administrator app has production only.
- Never assign production privileged credentials to Preview or Development targets.
  Branch-specific overrides must point to staging, including both URL and public key.
- Do not enable Vercel's option to expose sensitive variables to fork pull requests.
  Run untrusted fork CI without application secrets; never use `pull_request_target`
  to execute fork code with secrets.
- Check variable **names, targets, branch overrides and types** through the host UI.
  This document does not certify the current values or fork settings: the connected
  GitHub integration lacks repository administration access. Record an operator's
  verification in issue #157 before marking that criterion complete.
- Use gitignored `.env.local` files locally and templates with blank credentials in git.
  Never paste tokens, cookies, provider errors containing keys, or database connection
  strings into logs, screenshots, issues, or PRs.

## Rotation procedure

1. Identify every consumer from the inventory; confirm the target project and environment.
2. Generate a replacement through the provider's supported process or a local secure
   random generator. Store it directly as a server-only Secret; never in shell arguments.
3. Test the replacement on isolated staging with synthetic data. Update paired settings
   such as the deletion worker digest and record only the timestamp and outcome.
4. Deploy consumers, verify the intended workflow and safe failure behavior, then revoke
   the previous credential. If overlap is unsupported, plan the brief interruption first.
5. On disclosure, revoke promptly, review provider logs, invalidate affected sessions or
   proofs, and use the private reporting process in [SECURITY.md](../../SECURITY.md).

No live credential was rotated by this documentation change. The staging `CRON_SECRET`
exercise in #157 remains deferred under the no-email/cron-work constraint.

## Free GitHub protections

For this public repository, enable secret scanning, push protection, Dependabot alerts
and security updates in repository settings without accepting a paid upgrade. Configure
`main` to require a PR and both CI checks (`Lint, typecheck, test & build` and
`Database tests`) with an up-to-date branch, block force pushes/deletion, and require
linear history. Do not require Vercel checks. With a sole maintainer, require zero
approvals; CODEOWNERS identifies review responsibility but does not grant permissions.

Keep administrator enforcement/bypass choices explicit so protected branches cannot be
silently bypassed. Never test rejection by force-pushing or deliberately breaking main.
Use settings/API readback and a disposable branch/PR to validate the configuration.
These settings require repository administrator access and are separate from merging
the checked-in Dependabot/CODEOWNERS configuration.
