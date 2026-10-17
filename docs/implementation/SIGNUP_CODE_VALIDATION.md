# Email signup verification codes

Password signup now opens a six-digit email-code form in English or Arabic. Signup still requires a password; this does not introduce passwordless sign-in or automatically confirm accounts. Verification requires a provider-issued authenticated session and uses the verified user's canonical database role for routing. Resend retains provider rate limits, optional CAPTCHA, neutral account-existence responses, and a 60-second interface cooldown.

Verification explicitly uses `type: 'signup'`. Actual GoTrue testing showed that the generic `type: 'email'` also accepts six-digit recovery codes; the signup-specific type rejects those codes while accepting signup codes. Password recovery keeps its separate existing flow.

The confirmation template contains `{{ .Token }}` without a confirmation link. The owner confirmed saving the hosted Supabase **Confirm signup** template on 17 October 2026, keeping email confirmation enabled. The repository also includes a bilingual code-only template for local configuration. Previously issued confirmation links remain compatible with the existing callback; Google and password recovery retain their separate flows.

## Validation

- Full unit suite: 447 passing tests across 72 files.
- ESLint: passed after correcting the resend countdown effect.
- Typecheck and webpack production build: passed.
- Independent GPT-6.1 Sol review: no blocking findings; 132 focused tests passed.
- English/Arabic browser checks at 390px and 1440px: correct direction, labels, numeric keyboard/autofill attributes, six-digit validation, usable buttons, and no horizontal overflow.
- Isolated local GoTrue test: code-only confirmation delivered, no signup session before verification, password login blocked before confirmation, wrong/cross-email codes rejected, correct code established a reusable SSR session, and replay rejected.

Production inbox delivery has not been tested with a real user's email. Codes use the same Supabase sender and delivery quotas as confirmation links. This change does not configure custom SMTP or change the production code lifetime.
