# Auth setup (manual dashboard steps)

The code for email confirmation, password reset, Google sign-in and Cloudflare
Turnstile ships inert-by-default. Google and Turnstile do nothing until their env
vars are set. Complete these steps in the Supabase dashboard (and Google / Cloudflare)
after deploying. Everything below is free.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public origin used to build email and OAuth redirect links (for example `http://localhost:3000`). Falls back to `http://localhost:3000` when unset or invalid. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key. Leave empty to hide the captcha widget. |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | Set to `true` to show the "Continue with Google" button. |

## 1. URL configuration

Auth -> URL Configuration:

- Site URL: the production origin (for example `https://<your-domain>`).
- Redirect URLs: add both wildcard entries
  - `http://localhost:3000/**`
  - `https://<your-domain>/**`

Use the `/**` wildcard, not the bare `/api/auth/callback` path. Supabase matches the
allow-list against the full redirect URL including the query string, and the app sends
URLs like `/api/auth/callback?next=/en/reset-password`. An exact
`.../api/auth/callback` entry does not match, so Supabase silently falls back to the Site
URL and the email link lands on the home page instead of the app page.

## 2. Email confirmation

Auth -> Providers -> Email: enable "Confirm email". The built-in email sender is heavily
rate-limited, so configure custom SMTP (the free tiers of Resend or Brevo work) before
real use.

Optional: to use `token_hash` links, change the email templates to
`{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/ar/dashboard`
(use `type=recovery` and `next=/ar/reset-password` for the reset template). The default
PKCE links (`?code=`) work without template changes.

## 3. Google sign-in

1. In Google Cloud Console, create an OAuth client (type: Web application).
2. Set the authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Auth -> Providers -> Google: enable it and paste the client ID and secret.
4. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.

New Google accounts are created as students. Teachers register with email, and role
changes stay admin-only. For local `supabase start`, set
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` and
flip `[auth.external.google] enabled = true` in `supabase/config.toml`.

## 4. Captcha (Cloudflare Turnstile)

1. In Cloudflare, create a Turnstile widget (free) and note the site key and secret.
   Cloudflare also documents always-pass test keys for development.
2. Auth -> Attack Protection: enable Captcha, choose Turnstile and paste the secret.
3. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the site key.

Do not enable captcha in Supabase without setting the site key: the forms would send no
token and every sign-up, sign-in, reset and resend would fail with `captcha_failed`.
For local `supabase start`, uncomment the `[auth.captcha]` block in
`supabase/config.toml` and set `SUPABASE_AUTH_CAPTCHA_SECRET`.

## Troubleshooting

- Email links land on the Site URL or home page instead of the app page: the redirect URL
  is not allow-listed. Add the `/**` wildcard entries from section 1.
- Emails not arriving or SMTP errors: the dashboard hides them. Open Supabase -> Logs ->
  Auth and expand the row details. Gmail `535 BadCredentials` means you must use a Google
  App Password (not the account password) and the full Gmail address as the username.
- PKCE links (`?code=`) must be opened in the same browser that requested them, because
  the code verifier is stored there.
- Email links expire after 1 hour. Request a new one.

## Manual checks

- Sign up -> `/{locale}/check-email`; the confirmation link lands on the dashboard.
- Log in with an unconfirmed account -> error with a link to resend.
- Forgot password -> the same neutral message for registered and unknown emails.
- Reset link -> `/{locale}/reset-password` -> new password -> dashboard.
- `/api/auth/callback?code=bad` -> `/{locale}/login?error=link` with the expired-link alert.
