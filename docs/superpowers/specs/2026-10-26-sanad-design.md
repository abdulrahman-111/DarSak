# Sanad (سند) staging assistant

Sanad is DarSak's bilingual study companion and teaching helper. This phase replaces the local-only prototype with actual Gemini responses in the separate protected staging project. Production is unchanged. The user authorized implementation without further design questions; GPT-6.1 Sol reviewed the design and GPT-6 Luna implements scoped tasks.

## Scope and approach

Use one bounded server-only Gemini REST call with the fixed documented `gemini-3.5-flash-lite` model. A provider SDK or autonomous tool loop adds no value to this small text-only pilot. Keep reviewed local platform guidance and the local group template as explicitly labelled fallbacks. Chat supports explanations, examples, study plans and platform guidance. Teachers can generate four editable group text fields and explicitly apply them before ordinary save/publish.

No model tools, private database context, attachments, retrieval from links, automatic enrollment, publishing or account changes. Only generic user-entered text and authored role-appropriate help enter the prompt. Chats remain in browser component memory; no prompt/output logging or database persistence.

## Boundaries

Require both staging app markers, the exact staging Supabase URL/reference, `SANAD_ENABLED=true`, server-only `GEMINI_API_KEY` and a nonempty `SANAD_PILOT_USER_IDS` UUID allowlist. Verify current authenticated active users and teacher teaching access for drafts. An operator-managed private database tester list independently limits quota RPC callers. Adult testing acknowledgment and provider disclosure are required; these communicate intended use and do not independently verify age or certify provider terms eligibility. Live DarSak remains school-facing and outside this rollout.

## Contracts

GET `/api/assistant` returns only `{available:boolean}` for the verified viewer. POST accepts a strict union: `{mode:'chat',locale:'en'|'ar',acknowledged:true,messages:[{role:'user'|'assistant',text:string}]}` (maximum eight messages, each 2,000 characters, total 8,000, final message user), or `{mode:'group_draft',acknowledged:true,...GroupDraftInput}`. Success is `{ok:true,mode:'chat',text}` or `{ok:true,mode:'group_draft',draft}`. Errors expose only `invalid_input`, `unauthenticated`, `unavailable`, `rate_limited` or `provider_unavailable`.

Request body max 24 KiB enforced while reading; same-origin checks; private/no-store responses. Provider timeout 20 seconds, response max 64 KiB, output max 2,048 tokens, no retries. Validate generated draft with the existing strict four-field Zod schema. Reject blocked/truncated/malformed output and never expose raw provider errors.

Atomic private quota counters reserve before inference: 100 attempts/user/UTC day, 500/global/day, ten/user/minute, one in flight/user and five/global, 45-second leases. `sanad_reserve_request()` derives auth.uid and returns an owned UUID lease or null. `sanad_release_request(p_lease uuid)` deletes only the caller's lease and never refunds attempts. Explicit grants, RLS and no direct client table access.

## Experience and validation

Use the existing drawer, compact Sanad trigger, AI/local-help tabs, keyboard focus restoration, plain escaped output, mobile/RTL support, clear/cancel/loading/error states and no dashboard-load inference/status query. Draft generation never submits the surrounding form; apply changes only name, description, outcomes and prerequisites.

Luna adds focused backend/provider/config, UI and SQL regression coverage. Sol reviews every changed path. Run unit, lint, typecheck, formatting, build, fresh database CI and browser desktop/mobile English/Arabic tests. Verify actual staging inference after deployment when credentials and external provider access permit; distinguish mocked tests from real provider evidence. Merge only to staging and deploy only its separate project.
