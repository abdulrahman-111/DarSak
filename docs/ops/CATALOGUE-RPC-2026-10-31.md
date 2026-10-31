# Teacher catalogue RPC rollout — 31 October 2026

`teacher_catalogue_choices()` replaces three independently paged HTTP reads with one invoker RPC. It preserves the complete shared and caller-owned catalogue, including archived ancestors needed by existing selection filtering. It introduces no arbitrary row limit and does not establish a latency improvement or complete issue #152's query/index audit.

Sol reviewed the role gate, narrow JSON contract, invoker privileges and loader parity. The disposable database's 23 pgTAP assertions passed, including 1,001 rows in each nested array, pending teachers, missing teacher-detail rows, foreign published references and unauthorized roles. These are SQL assertions; they do not prove a 1,001-row hosted HTTP response. Loader unit tests separately exercise 1,025 rows.

The migration was applied to staging first, followed by a read-only authenticated-teacher smoke check: all three result members were arrays, containing 3 subjects, 9 nodes and 3 offerings. Catalog inspection confirmed `SECURITY INVOKER`, `STABLE`, fixed `search_path`, authenticated execute and no anonymous execute. It was then applied to production; the same smoke check returned arrays containing 5 subjects, 9 nodes and 4 offerings. These counts reflect existing rows visible to the selected teacher and are not fixtures or performance measurements. Both checks rolled back their transaction-local impersonation settings; no user data changed.

The connector assigned staging version `20261031184954` and production version `20261031185022`. Their stored migration SQL hashes matched (`5c37e9fd1dce21f866a45c216a9c8ffe`). Only this new staging history row was aligned to the canonical production version using an exact version/name/hash guard. The repository filename uses `20261031185022`. No older migration history was changed.

The database function is additive. Deploy application code only after exact-head CI passes. The previous application continues to use its original reads until deployment.
