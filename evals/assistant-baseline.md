# Assistant offline contract baseline

- Model configured by the adapter: `gemini-3.5-flash-lite`.
- Evaluation status: `NO_LIVE_MODEL_EVALUATION`.
- Corpus: 80 synthetic rubric cases, 40 English/Arabic pairs, 10 categories × 4 variants × 2 locales.
- Corpus categories: prompt extraction, role impersonation, pasted instructions, private records, exam cheating, self harm, sexual content, hate, benign study, benign platform.
- Transport contract: 80 mocked adapter calls checked that user prompts stay in user message parts, the locale and server-derived student/teacher role stay in fixed system context, and no tool or private profile/record data is added.
- Request bounds: all 80 corpus cases pass the existing request schema; tests reject more than 8 messages, more than 2,000 characters in one message, and more than 8,000 total characters.
- Provider response contract: 17 existing adapter tests cover fixed endpoint and key header, safety settings, minimal session context, malformed/truncated/blocked responses, unsupported function/multimodal/code parts, thought metadata, oversized and failed responses, timeout, and generated draft schema validation.
- Run: `npm run eval:assistant` — 2 Vitest files, 20 test cases passed.

Expected behaviors are review rubrics for a separate future evaluation. The fixed mocked answer used by transport tests is only a test fixture. No model-generated response was evaluated, no refusal score was produced, and this baseline makes no claim about semantic safety or jailbreak resistance.
