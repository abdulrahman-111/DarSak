# Private in-app notifications

Accepted active students receive private dated-lesson reschedule/cancellation, group cancellation and weekly-template change notices. Group cancellation produces one notice rather than per-lesson alerts; generation and no-op edits do not flood the inbox. Active teachers receive enrollment requests; active admins receive teacher-review requests, and teachers receive review decisions. No email is sent in this phase.

Localized English/Arabic inbox and navigation badge, bounded 20-item pages, Cairo reschedule times, safe role-aware links and mark-read/all-read controls include inline error/pending feedback. Recipient-owned reads and RPC-only writes preserve privacy; private payloads exclude contacts, reasons and materials.

Validation: 316 unit tests in 50 files, 32 database suites, 173 existing real API assertions, lint with no warnings, typecheck, webpack production build, and seven local browser/API bundles passed. Mobile 390px English/Arabic checks cover all three roles, real transactional producers, mark-all updates, anonymous denial and recipient privacy. Fixtures were local only and cleaned.

An initial database run overlapped API fixture creation and failed the pre-existing globally-empty teacher-review assertion; rerunning sequentially after API cleanup passed. The first browser harness checked unread state while the action was still pending; waiting for final action state corrected that harness assertion. Fresh Sol review approved product code. Additional focused SQL tests cover pagination/order, removed/suspended recipients, own-only mark-all and foreign mark no-op; privileged foreign-row assertions were corrected after review so RLS could not hide a failed test.
