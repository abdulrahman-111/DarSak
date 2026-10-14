# Bounded reads and measured performance — 2026-10-14

Teacher dashboards use an owner-checked summary RPC with previews bounded at eight and exact counts. Setup candidates are selected independently so an old unfinished draft survives preview bounds. Enrollment lists request the selected page directly. Group detail rosters have independent twenty-row pages preserving lesson-page state. Catalogue reads use stable complete pagination; public teacher choices use ID/name only, fifty matching names plus the selected eligible teacher. Discovery filters eligible groups before aggregates and single-group details start with the requested ID. Action diagnostics exclude tokens, contacts, paths, contents, and raw database messages.

Validation: 279 unit tests in 37 files pass; typecheck passes; lint has zero errors and one existing cover-image warning. Local webpack production build passed and Vercel default preview build READY at reviewed source head 7babb27. All 24 SQL regression files passed against the upgraded local schema. The teacher-review check initially failed its empty-event assumption due to a leftover fixture from an earlier rejected signup; removing that disposable fixture resolved it. Existing API suite passed 171 assertions, including discovery projection/filter/eligibility and tenant authorization contracts.

Built-app mobile tests: actual material actions/private downloads/cleanup and enrollment races remain passing. EN/AR roster page two renders its expected rows at 390px. Initial harness assertions wrongly assumed name ordering and then read the streamed loading state; expected rows now come from the stable created-at/UUID order and checks wait for content. No product workaround was added.

Local measurement, same 1,210 archived groups and one old unfinished draft, ten warm HTML-response samples each:
- Dashboard p50: 1087.88 ms before, 178.58 ms after; p95: 2039.89 ms before, 605.12 ms after. HTML response remains 38,401 bytes. Data transferred from the database is bounded independently of archived history; exact counts still require database work.
- In one local transaction with 1,000 eligible published groups, the exact old public_group_detail function used 169,564 buffer hits and 76.703 ms; the new function used 41 buffer hits and 1.602 ms. Both returned one row. EXPLAIN evidence justified filtering before the public projection; existing indexes sufficed.

These are local synthetic measurements with small samples, not production latency, browser Web Vitals, concurrent-load capacity, or guaranteed percentage improvements. No shared private cache or new infrastructure was introduced.

Additional above-cap browser validation and production migration/deployment results are recorded in the release ledger and PR13. No production data was used for destructive tests.

Above-cap built-app check passed: a disposable teacher with 1,001 owned subjects sees the last subject on the catalogue screen (correct 1,001 count) and in the profile specialization selector. Fixture removed afterward.
