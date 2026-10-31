# SanDai (سندي): DarSak study assistant

SanDai is DarSak's bilingual (Arabic/English) study and teaching helper. It appears as a small pixel "pocket notebook" companion docked at the bottom corner of every page (bottom-end: bottom-right in English, bottom-left in Arabic, above the mobile tab bar). Its mood reflects real activity: idle, thinking (a request is running), needs you (a draft waits for review), done, oops (an error, with Retry) and sleeping (after two idle minutes or when the tab is hidden). A one-click Hide control remembers the choice in the browser; a small "Show SanDai" button brings it back. All animation stops under `prefers-reduced-motion`.

## Who gets what

| Visitor           | Companion              | Live AI chat                           | Group drafting                    |
| ----------------- | ---------------------- | -------------------------------------- | --------------------------------- |
| Anonymous         | Yes, local guided help | No (no AI calls)                       | No                                |
| Active student    | Yes                    | Yes, when enabled                      | No                                |
| Active teacher    | Yes                    | Yes, when enabled                      | Yes, with current teaching access |
| Admin             | Local guided help      | No (admins use the separate admin app) | No                                |
| Suspended account | Local guided help      | No                                     | No                                |

There is no age gate, adult acknowledgment or tester allowlist. Eligibility is derived on the server from the verified session and an active student or teacher profile; the database enforces the same rule when reserving quota.

Local guided help is authored text that runs on the device. It links only to existing DarSak routes, follows the signed-in role, and never calls a model. Model output is rendered as plain text. Teacher group drafts stay in browser memory until the teacher reviews them and explicitly applies the four displayed fields, then separately saves the ordinary group form. A draft never publishes a group or changes enrollment.

Gemini requests set explicit safety thresholds. A provider prompt or candidate safety block returns a localized request-blocked message and no generated answer. The provider accepts text-only candidate parts and discards Gemini's text signature metadata; unsupported tool, code or multimodal parts fail closed. Provider-generated group-draft fields are rejected if they contain control or bidirectional override/isolate characters, URL-form links, or email addresses. The same checks do not restrict locally authored templates or teacher edits. These are response-contract checks, not a guarantee that a model can resist every harmful prompt.

## Offline assistant evaluation baseline

`npm run eval:assistant` checks an 80-case synthetic English/Arabic corpus and the provider transport and response contracts using a local mocked transport. The corpus has 10 categories with four variants in each language. Its expected behaviors are rubrics for a possible future evaluation; they are not measured outcomes. The mocked adapter responses verify request separation and schema handling only. They do not show that Gemini refuses harmful requests or answers safely. The report records `NO_LIVE_MODEL_EVALUATION`; no live model, API key, external grader, or user content is involved.

Any future live evaluation needs a separate, explicitly controlled run with its own review of data, provider terms, and evaluation criteria. Keep live outputs and judgments distinct from this offline contract baseline; do not infer safety quality or refusal rates from the synthetic corpus or mocked responses.

## Configuration

All values are server-only. Never put a key in a `NEXT_PUBLIC_` variable, browser code, chat or source control.

| Variable                   | Required | Default     | Purpose                                         |
| -------------------------- | -------- | ----------- | ----------------------------------------------- |
| `SANAD_ENABLED`            | Yes      | unset (off) | Must be exactly `true` to enable live AI.       |
| `GEMINI_API_KEY`           | Yes      | unset       | Google Gemini API key.                          |
| `SANAD_USER_DAILY_LIMIT`   | No       | `60`        | Accepted requests per user per UTC day.         |
| `SANAD_USER_MINUTE_LIMIT`  | No       | `10`        | Accepted requests per user per UTC minute.      |
| `SANAD_GLOBAL_DAILY_LIMIT` | No       | `3000`      | Accepted requests across all users per UTC day. |
| `SANAD_GLOBAL_CONCURRENCY` | No       | `10`        | Requests in flight across all users.            |

Live AI is enabled if and only if `SANAD_ENABLED=true` and `GEMINI_API_KEY` is set. Anything else fails closed: the API returns "unavailable" without contacting the provider and the companion keeps showing local guided help. Limit variables must be whole numbers from 1 to 100000; unset or invalid values fall back to the defaults.

**Disable at any time** by setting `SANAD_ENABLED=false` (or removing the key) and redeploying.

### Database

Apply `supabase/migrations/20261028150000_sandak_quota.sql` and subsequent quota migrations. They add private (non-API) counters in `dars_private` and two `SECURITY DEFINER` functions, `sanad_reserve_request` and `sanad_release_request`, granted to `authenticated` only. `dars_private.sandak_settings` provides the defaults and hard upper ceilings: application or direct RPC callers may request lower limits, but cannot raise them. Database tests are in `tests/database/sandak_quota.sql` and `supabase/tests/sandak_quota.test.sql`.

## Gemini billing, terms and age

- Use a **billing-enabled (paid) Gemini API key**. On the unpaid tier Google may use submitted content to improve its products and allow human review. Paid use is governed by Google's paid-services data terms. See the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and additional terms.
- The Gemini API terms require end users to be **18 or older**. The product decision is to launch for university students first. DarSak does not verify age. Before onboarding users under 18, add restrictions (for example disabling live chat for minors or requiring a compliant eligibility process) and review the provider terms again.
- Application limits are not a monetary spending guarantee. Set a budget and alerts on the Google Cloud project that owns the key, and keep Google's own project quotas in place. No paid fallback model is configured.

## Limits and abuse protection

One server request uses the fixed `gemini-3.5-flash-lite` model with a 20-second timeout and no retries. Request bodies are limited to 24 KiB, provider responses to 64 KiB and generation to 2,048 output tokens. A chat sends at most eight messages and 8,000 characters (2,000 per message). The model has no tools, no web access and no database access, and the system prompt refuses secrets, personal data and unsupported actions.

An atomic database reservation contains request volume, enforcing the configured per-user daily and per-minute ceilings and one active request, plus global daily and concurrency ceilings. Caller limits can make these stricter, never looser. A 45-second lease recovers from crashed workers. Failed provider calls still consume the reserved attempt. Cross-origin requests are rejected. When a quota is reached the user sees a friendly "too many requests" message and the companion shows the oops mood.

## Data handling

- The model receives only what the user typed (recent messages in the open conversation, or the teacher's group-draft inputs), the locale, the server-derived role, and a coarse page type (`home`, `group`, `teacher_workspace`, and similar) plus authored public DarSak help topics. No profile records, student data, group data, IDs or URLs are sent.
- Conversation text lives only in component memory in the browser, with a clear-conversation action, and is gone on reload.
- DarSak does not log or persist prompts or answers. Quota tables store only user IDs, counters, UTC dates and short-lived lease metadata. Google handles content sent for inference under its own terms.
- The chat shows a notice that messages are sent to Google's Gemini service and asks users not to include personal or private information.

## Operations checklist

1. Apply the migration to the production database.
2. In the production Vercel project set `GEMINI_API_KEY` (paid, billing-enabled key) and `SANAD_ENABLED=true`; optionally set the limit variables. Redeploy.
3. Confirm a student and a teacher can chat, an anonymous visitor sees only local help, and a quota breach shows the friendly message.
4. To pause AI quickly, set `SANAD_ENABLED=false` and redeploy.
