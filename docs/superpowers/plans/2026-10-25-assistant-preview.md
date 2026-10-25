# Assistant staging implementation plan

Goal: test a useful contextual assistant workflow without activating an external model in an ineligible application.

Architecture: deterministic bilingual platform guidance and a clearly labeled local group-writing template, integrated into existing authorized workspaces and forms. No model API, new dependency, database migration, stored question history, or production release.

Spec: ../specs/2026-10-25-assistant-preview.md

- [ ] Domain and guidance: strict bounded input/output schemas; role-specific static local routes; Arabic/English intent matching; template fields stay within existing limits. Test invalid data, role filtering, matching, and absence of network requests.
- [ ] Workspace UI: accessible Help dialog with bounded local question input, topic buttons, clear local-mode copy, focus restoration, mobile/RTL support. Preserve four primary destinations and existing route guards.
- [ ] Teacher form: explicit create/edit/apply preview for four text fields only; preserve all other values and concurrency tokens. Never save or publish automatically. Test invalid previews, explicit application, and existing form behavior.
- [ ] Review: GPT-6.1 Sol traces all changed UI/data paths; GPT-6 Luna corrects concrete findings. No Gemini activation based on API-key presence.
- [ ] Validation: focused tests then full unit/lint/typecheck/build once frozen; local English/Arabic desktop/mobile browser journeys, keyboard/focus and existing form preservation. PR into staging, fresh CI, staging deployment and smoke checks. No main merge.

External inference remains blocked pending provider/deployment eligibility. Current Gemini API terms exclude API clients directed to or likely accessed by under-18s, and unpaid services must not receive personal/confidential information. DarSak includes school students. A teacher-only tab or a supplied key does not establish eligibility for the website.
