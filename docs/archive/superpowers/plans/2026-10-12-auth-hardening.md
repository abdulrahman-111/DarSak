# Auth Hardening Plan (2026-10-12)

Branch: `feat/auth-hardening` (never commit to `main`). Ship as one PR.

## Context

Dars already has Supabase Auth (email + password) via server actions in
`src/features/auth/actions.ts`, `@supabase/ssr` cookie sessions refreshed in
`src/proxy.ts`, and a `handle_new_user` trigger that creates `profiles` +
role-specific rows from `raw_user_meta_data.requested_role` / `full_name`.

Gaps: no password reset, email confirmation disabled, no auth callback route,
no captcha, no Google sign-in, generic error messages.

All additions must be free: Supabase built-ins, Cloudflare Turnstile, Google OAuth.
No new npm dependencies.

Stack: Next 16.3 (App Router, `src/proxy.ts` replaces middleware), next-intl
(`/ar` default, `/en`, `localePrefix: 'always'`), @supabase/ssr 0.12, supabase-js
2.116, zod 4, vitest. Code style: terse, bilingual copy objects (`en` + `ar`
with `typeof en`), error strings chosen by `locale === 'ar'`.

## Design decisions

1. **Callback route lives at `src/app/api/auth/callback/route.ts`.** `/api` is
   excluded from the next-intl proxy matcher, so no locale rewriting. It handles both:
   - `?code=` (PKCE: OAuth, and email links under the default SSR flow), via `exchangeCodeForSession`.
   - `?token_hash=&type=` (custom email templates), via `verifyOtp`.
   Then it redirects to a sanitized `next`, or to `/{locale}/login?error=link` on failure.
2. **Open-redirect safety.** Add `safeAuthNext(candidate, fallbackLocale)` in
   `src/features/auth/return-path.ts`. Accept only `^/(ar|en)(/[A-Za-z0-9\-_/]*)?$`
   with no `//`, no `\`, and no `..`. Otherwise return `/{fallbackLocale}/dashboard`.
   The `next` path and locale both come from the query string.
3. **Site URL.** New env `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`).
   Helper `siteUrl()` in `src/lib/supabase/config.ts` returns the env value if it
   is a valid http(s) URL without credentials, otherwise `http://localhost:3000`.
   It is used to build every `redirectTo` / `emailRedirectTo`.
4. **Google sign-in is students-only for new accounts.** OAuth cannot set
   `requested_role`, so the trigger defaults new OAuth users to `student`. Role
   changes are admin-only, enforced by the `prevent_protected_profile_changes`
   trigger. So:
   - The button shows on login (any existing account can link and sign in).
   - The button shows on register only while the "student" role is selected.
     Teachers register with email.
   - No DB migration.
   - Gated by `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true'`.
5. **Captcha is Cloudflare Turnstile, validated by Supabase.**
   - If `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set, render the widget with `next/script`
     (`https://challenges.cloudflare.com/turnstile/v0/api.js`, explicit render) in
     the signup, login and forgot-password forms. Its hidden input is named
     `cf-turnstile-response`.
   - Server actions read it and pass `options.captchaToken` to `signUp`,
     `signInWithPassword` and `resetPasswordForEmail`.
   - If the env is unset, render nothing and send no token, so it works while
     Supabase captcha is off.
   - Reset the widget after a failed submit (`window.turnstile?.reset()`), because tokens are single-use.
6. **Email confirmation is on.**
   - `supabase/config.toml`: `enable_confirmations = true`.
   - `signUp` passes `emailRedirectTo = {site}/api/auth/callback?next=/{locale}/dashboard`.
   - When `!data.session`, redirect to `/{locale}/check-email?email=<encoded>`
     instead of the current "contact admin" error.
   - The check-email page has a "resend" form (`auth.resend({type:'signup', email, options:{emailRedirectTo}})`).
   - The resend response is always neutral.
7. **Password reset.**
   - `/{locale}/forgot-password`: email + captcha form, which calls `resetPasswordForEmail(email, { redirectTo: {site}/api/auth/callback?next=/{locale}/reset-password, captchaToken })`.
     The response is always neutral ("If an account exists, we sent a link") to
     prevent account enumeration, except for rate-limit and captcha errors.
   - `/{locale}/reset-password`: requires a verified user (`getVerifiedUser()`);
     otherwise redirect to `/{locale}/forgot-password`. The form has a new password
     and a confirmation (8–72 characters, must match). It calls
     `updateUser({ password })`, then redirects to `/{locale}/dashboard`.
   - Add a "Forgot password?" link on the login page under the password field.
8. **Better errors.** Add a pure function
   `authErrorMessage(locale, code: string | undefined, context: 'login'|'signup'|'reset'|'update')`
   in `src/features/auth/errors.ts`. It maps `AuthError.code` values:
   - `invalid_credentials`
   - `email_not_confirmed` (point the user to resend confirmation)
   - `user_already_exists` / `email_exists` ("already registered — sign in or reset password")
   - `weak_password`
   - `over_email_send_rate_limit` / `over_request_rate_limit` (wait and retry)
   - `captcha_failed`
   - `same_password`
   - `signup_disabled`
   - anything else falls back to the current generic message for that context.

   Each message has `en` and `ar` versions. Login still hides whether an email exists
   (`invalid_credentials` stays generic). The `email_not_confirmed` result includes
   a link to the check-email/resend page.
9. **Login page `?error=link`** shows a bilingual "This link is invalid or has expired" alert.

## Files

New:
- `src/app/api/auth/callback/route.ts`
- `src/app/[locale]/forgot-password/page.tsx`
- `src/app/[locale]/reset-password/page.tsx`
- `src/app/[locale]/check-email/page.tsx`
- `src/features/auth/errors.ts`
- `src/components/auth/turnstile.tsx` (client)
- `src/components/auth/google-button.tsx` (client; a form posting to `googleSignInAction`)
- `src/components/auth/password-forms.tsx` (client; forgot/reset/resend forms using `useActionState`)
- `tests/unit/auth-errors.test.ts`
- `tests/unit/auth-actions.test.ts` (mock `@/lib/supabase/server` and `next/navigation`, following the existing `*-actions.test.ts` mocking style)
- `docs/implementation/AUTH_SETUP.md`: the manual dashboard steps listed under "Supabase dashboard steps" below.

Modified:
- `src/features/auth/actions.ts`: captcha token, error mapping, emailRedirectTo,
  check-email redirect, plus new `googleSignInAction`, `forgotPasswordAction`,
  `resetPasswordAction`, `resendConfirmationAction`.
- `src/features/auth/return-path.ts`: `safeAuthNext`.
- `src/lib/supabase/config.ts`: `siteUrl()`.
- `src/lib/domain.ts`: `forgotPasswordSchema`, `resetPasswordSchema` (refine to match the confirmation).
- `src/components/auth/auth-form.tsx`: Turnstile, Google button, forgot link.
- `src/components/auth/copy.ts`: new strings (en + ar).
- `src/app/[locale]/login/page.tsx`: `?error=link` alert.
- `supabase/config.toml`: confirmations on, google provider block (`enabled = false`,
  `env(...)` secrets), commented `[auth.captcha]` turnstile block, add
  `http://127.0.0.1:3000/**` to redirect URLs.
- `.env.example`: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`.
- `tests/unit/auth-return-path.test.ts`: `safeAuthNext` cases (`//evil.com`, `/\evil`,
  `https://x`, `/fr/x`, `/en/../x`, array input, valid `/ar/reset-password`).

## Supabase dashboard steps (for AUTH_SETUP.md; done manually by the owner)

1. Auth → URL Configuration: Site URL (production origin) plus wildcard redirect URLs `http://localhost:3000/**` and `https://<your-domain>/**` (the allow-list matches the full URL including `?next=`).
2. Auth → Providers → Email: enable "Confirm email". Optional: custom SMTP
   (free tiers from Resend or Brevo), because the built-in sender is heavily rate-limited.
3. Auth → Providers → Google: create an OAuth client in Google Cloud Console
   (free). The authorized redirect is `https://<ref>.supabase.co/auth/v1/callback`.
   Paste the client ID and secret, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
4. Auth → Attack Protection: enable Captcha with Turnstile. Paste the Turnstile
   secret, then set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The free Cloudflare
   account test keys are documented there.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint` all green.
- Manual check against the live project: signup → check-email page; login error
  mapping; forgot-password neutral response; callback with bad code → `/login?error=link`.

## Out of scope

Teacher Google sign-up (needs a one-time role-claim RPC and a migration), MFA, magic links.
