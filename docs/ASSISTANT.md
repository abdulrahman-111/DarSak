# SanDak (سندك): DarSak assistant pilot

The protected staging pilot includes real Gemini-powered English/Arabic study and platform chat, plus optional teacher group-writing drafts. SanDak is DarSak's study and teaching helper. Authored local platform guidance and a clearly labelled local group template remain available independently of the provider. The live DarSak site is unchanged.

Help topics follow the signed-in role and link only to existing DarSak routes. Destination authorization remains enforced by existing routes and database rules. Model output is rendered as plain text. Drafts stay in browser memory until a teacher explicitly applies the four displayed fields and separately saves the ordinary group form. A preview never publishes a group or changes enrollment.

## Restricted staging configuration

Server-only `GEMINI_API_KEY`, `SANAD_ENABLED=true`, and `SANAD_PILOT_USER_IDS` are required in the separate **darsak-staging** Vercel project. Its stable staging URL uses that project's Production target; Preview builds need the same staging credentials and markers. Neither target refers to live DarSak production. Both application environment markers and the exact staging Supabase reference/URL must match. Empty or invalid configuration fails closed.

An operator must also enroll each verified adult tester UUID in `private.sanad_pilot_testers` in staging. These are two independent allowlists: the environment gate protects inference and the private database list protects quota reservation. Never infer adult eligibility from a student's role or user-editable metadata. The client acknowledgment communicates intended adult testing and provider disclosure; it does not verify age or certify compliance with the provider's eligibility requirements. Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms) still apply to staging. Free services may use content for improvement and human review; use generic synthetic test content only.

Do not put keys in `NEXT_PUBLIC_` variables, browser code, chat messages or source control. Adding a key to the live project's environment does not activate this staging-only integration. Disable staging inference by setting `SANAD_ENABLED=false` and redeploying. Production activation requires a separate eligibility, privacy and release review.

## Limits and data handling

One server-only request uses the fixed `gemini-3.5-flash-lite` model with a 20-second timeout and no retries. Requests are bounded to 24 KiB, provider responses to 64 KiB and generation to 2,048 output tokens. Chat history contains at most eight messages and 8,000 characters; individual outgoing messages contain at most 2,000 characters. Long displayed answers can be shortened when included as subsequent context. The model has no tools or direct database access.

Atomic persistent quota reservation allows 100 attempted requests per tester per UTC day, 500 across the pilot per UTC day, ten per tester per minute, one active request per tester and five across the pilot. A 45-second lease recovers crashed workers. Provider failures still consume the reserved attempt. These are application limits; Google's own key/project/model quotas also apply and may be lower. The application limits are not a monetary spending guarantee. No paid model fallback is configured.

Conversation text is kept only in component memory by DarSak, with a clear-conversation action; Google handles content sent for inference under its own terms. Quota tables store only user IDs, counters, dates and short-lived lease metadata. No raw questions, generated answers or API secrets are logged or persisted by this feature.

Keep real student records, CVs, contact details, authentication data, reports, private feedback and materials out of model context. No autonomous publishing, enrollment, deletion, notifications or schedule changes are part of the assistant pilot.
