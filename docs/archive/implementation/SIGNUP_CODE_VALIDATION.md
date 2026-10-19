# Email signup verification codes

Password signup now opens a six-digit email-code form in English or Arabic. Signup still requires a password; this does not introduce passwordless sign-in or automatically confirm accounts. Verification requires a provider-issued authenticated session and uses the verified user's canonical database role for routing. Resend retains provider rate limits, optional CAPTCHA, neutral account-existence responses, and a 60-second interface cooldown.

Verification uses `type: 'signup'`. Isolated local GoTrue testing confirmed that the generic `type: 'email'` accepts a six-digit recovery OTP, while `type: 'signup'` accepts signup OTPs and rejects recovery OTPs. Recovery codes continue through the separate `type: 'recovery'` flow.

The confirmation template contains `{{ .Token }}` without a confirmation link. The owner confirmed saving the hosted Supabase **Confirm signup** template on 17 October 2026, keeping email confirmation enabled. The repository also includes a bilingual code-only template for local configuration. Previously issued confirmation links remain compatible with the existing callback; Google and password recovery retain their separate flows.

## Validation

- Full unit suite: 447 passing tests across 72 files.
- ESLint, typecheck, and webpack production build: passed.
- Independent GPT-6.1 Sol review: no blocking findings; 132 focused tests passed, including 34 auth action tests after the strict signup-type adjustment.
- English/Arabic browser checks at 390px and 1440px: correct direction, labels, numeric keyboard/autofill attributes, six-digit validation, usable buttons, and no horizontal overflow.
- Isolated local GoTrue flow: 23 assertions passed. Confirmation email contained a code and no link; signup had no session before verification; password login was blocked before confirmation; wrong and cross-email codes were rejected; correct student and teacher codes created reusable SSR sessions with the expected profile roles; replay and a 10-second-expired code were rejected; recovery OTP was rejected as signup and verified only as recovery.

All fixture accounts were deleted and the local email inbox returned to zero messages. The baseline local Auth container was not replaced or restarted and remained auto-confirming before and after the test. Production inbox delivery has not been tested with a real user's email. The temporary 10-second OTP lifetime was isolated to the test container; production code lifetime was unchanged.
