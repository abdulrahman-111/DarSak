# DarSak assistant pilot

The staging pilot has local guided platform help and an optional teacher group-writing template preview. It is not a connected AI model. It makes no external inference calls, stores no questions, consumes no model quota, and does not use an API key.

Help topics follow the signed-in role and link only to existing DarSak routes. Destination authorization remains enforced by the existing route and database rules. Generated template text stays in browser memory until the teacher explicitly applies it to the four displayed fields and separately saves the ordinary group form. Applying a preview does not publish a group.

## Why Gemini is not enabled

Google's current [Gemini API terms](https://ai.google.dev/gemini-api/terms) restrict API clients directed toward, or likely accessed by, under-18s. DarSak includes school students. The same terms prohibit submitting sensitive, confidential, or personal information to unpaid services. Restricting one panel to teachers is not evidence that the entire website qualifies.

Do not put a Gemini key in public environment variables, paste one into chat, or assume adding a key enables this pilot. There is no external provider endpoint to activate in this phase. A future connected model needs a permitted provider/deployment, server-only credentials, active-user authorization, account/global request budgets, a fixed endpoint/model, bounded timeout/output, strict response validation, safe error handling and no raw prompt logging.

Keep real student records, CVs, contact details, authentication data, reports, private feedback and materials out of model context. No autonomous publishing, enrollment, deletion, notifications or schedule changes are part of the assistant pilot.
