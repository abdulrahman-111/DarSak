# Performance measurements

## Reproducible route measurements

`scripts/measure-routes.mjs` takes ten independent cold Playwright contexts per selected route at
390×844 with the versioned `fast4g-cpu4-v1` custom profile (40 ms latency, 4 Mbps download,
1 Mbps upload, 4× CPU slowdown). This is not the canonical Chrome Fast 4G preset. Its five-second
LCP observation window starts at `DOMContentLoaded`; LCP is the last candidate seen during that
fixed window, not the finalized field LCP. TTFB uses navigation `responseStart - activationStart`
(or `responseStart - startTime` when activation time is zero), and FCP/LCP are attributed to the
same document. Server-Timing retains only separate, bounded `app`, `db`, and `edge` durations; it
does not add overlapping entries or claim a total request duration. The report records status,
missing metrics and request/redirect errors. Summaries use only valid HTTP 200 samples and report
attempted, valid, excluded, and missing-metric counts; failed pages stay visible but do not affect
medians or nearest-rank p90. A successful login redirect is never counted as a private-route pass.

The script accepts loopback origins for local runs and exact allowlisted hosted origins only:
`https://darsak-platform.vercel.app` (production) and
`https://darsak-staging-theag01s-projects.vercel.app` (staging). Production rejects private browser
state. Staging private routes require the operator assertion `--synthetic-staging-state`, owner-only
state files, and state whose cookie and local-storage origins match the selected staging origin.
The flag is an assertion only: the runner cannot verify that the account is synthetic. Local private
routes also require owner-only state files scoped to loopback. This tool does not create or seed
synthetic accounts. Browser navigation is held to the selected origin, and samples are excluded if
the requested route redirects or the document changes during the observation window.

```sh
node scripts/measure-routes.mjs \
  --base-url http://127.0.0.1:3000 \
  --environment local \
  --route landing-en \
  --route teachers-en
```

Available route names are `landing-en`, `landing-ar`, `teachers-en`, `teachers-ar`, `student-en`,
`student-ar`, `teacher-en`, and `teacher-ar`. Without `--route`, the
public route templates are selected. Private routes require a matching `--student-state` or
`--teacher-state`; use `--synthetic-staging-state` only for synthetic staging sessions. Add
`--warm-public` to record a separate unthrottled public CDN cache-status check; it is not included in
the cold-sample statistics. Invalid, redirected, or external-login warm checks report cache status
as `unknown`. Local runs default to the checked-out Git SHA, which does not verify the running
server's build. Hosted runs require caller-supplied `--build-sha` (or `VERCEL_GIT_COMMIT_SHA`) and
`--deployment-id`; these values are labeled as caller assertions and are not independently bound to
the requested deployment by the runner.

The JSON report contains route templates, sample/route timestamps, sequential sample order, browser
version, and bounded metadata only. It does not save HTML, URLs with
query strings, page IDs, browser state, request headers, traces, screenshots or HAR files. The output
directory is created with mode `0700`, and the report with mode `0600`; an explicit output directory
must not already exist, and its parent must not be writable by group or other users. These
measurements do not establish the required historical baseline, hosted private-route acceptance,
public CDN warmth unless separately requested, or field vitals.

## Arabic font payload

The public app and admin app now register IBM Plex Sans Arabic at weights 400 and 700. The 500 and 600 registrations and WOFF2 files were removed. Each app's source assets are 90,984 bytes smaller. That source-size reduction is separate from the bytes a route downloads.

The local before capture used the existing four-face production build, with the font configuration identified as `main8e`; a full historical build SHA was not established. The after capture used the two-face local production build. These are local browser measurements, not production network measurements. The baseline status field was named `httpStatus`; the sanitized artifact normalizes it to `navigationStatus` without changing the recorded values. Both captures contain 12 routes and use fresh contexts, disabled cache, fixed throttling, and `document.fonts.ready`.

| Route                          | Font body bytes before → after | Encoded transfer bytes before → after |  CLS before → after |  Width before → after | Status before → after |
| ------------------------------ | -----------------------------: | ------------------------------------: | ------------------: | --------------------: | --------------------: |
| `landing-en-desktop`           |              115,716 → 115,716 |                     117,570 → 117,570 | 0.000400 → 0.000400 | 1280/1280 → 1280/1280 |             200 → 200 |
| `landing-ar-desktop`           |              204,252 → 158,564 |                     207,342 → 161,036 | 0.014854 → 0.014854 | 1280/1280 → 1280/1280 |             200 → 200 |
| `landing-en-mobile`            |                71,436 → 71,436 |                       72,672 → 72,672 | 0.001008 → 0.001008 |     390/390 → 390/390 |             200 → 200 |
| `landing-ar-mobile`            |              204,252 → 158,564 |                     207,342 → 161,036 | 0.000092 → 0.000092 |     390/390 → 390/390 |             200 → 200 |
| `student-dashboard-en-desktop` |              115,716 → 115,716 |                     117,570 → 117,570 | 0.000538 → 0.000538 | 1280/1280 → 1280/1280 |             200 → 200 |
| `student-dashboard-en-mobile`  |              115,716 → 115,716 |                     117,570 → 117,570 | 0.002528 → 0.002528 |     390/390 → 390/390 |             200 → 200 |
| `teacher-dashboard-en-desktop` |              115,716 → 115,716 |                     117,570 → 117,570 | 0.000578 → 0.000578 | 1280/1280 → 1280/1280 |             200 → 200 |
| `teacher-dashboard-en-mobile`  |              115,716 → 115,716 |                     117,570 → 117,570 | 0.002528 → 0.002528 |     390/390 → 390/390 |             200 → 200 |
| `student-dashboard-ar-desktop` |              204,252 → 158,564 |                     207,342 → 161,036 | 0.002403 → 0.002390 | 1280/1280 → 1280/1280 |             200 → 200 |
| `student-dashboard-ar-mobile`  |              204,252 → 158,564 |                     207,342 → 161,036 | 0.057965 → 0.057892 |     390/390 → 390/390 |             200 → 200 |
| `teacher-dashboard-ar-desktop` |              204,252 → 158,564 |                     207,342 → 161,036 | 0.000427 → 0.000427 | 1280/1280 → 1280/1280 |             200 → 200 |
| `teacher-dashboard-ar-mobile`  |              204,252 → 158,564 |                     207,342 → 161,036 | 0.000038 → 0.000038 |     390/390 → 390/390 |             200 → 200 |

The six Arabic routes each saved 45,688 encoded body bytes and 46,306 encoded transfer bytes by no longer loading Arabic 600. The 500 face was not requested in the baseline, so it contributes no observed transfer saving. The 90,984-byte source reduction per app includes both 500 and 600 assets; the ≥80 KB browser transfer target is therefore not met on these routes. English pages had no byte change. English desktop pages and dashboards requested Arabic 700 because they render Arabic glyphs; only the English mobile landing page loaded Latin faces alone.

The captures show matching route paths and document widths equal to viewport widths before and after. CLS was unchanged on ten routes. On the Arabic student dashboard it decreased slightly in this single paired sample: desktop 0.002403 to 0.002390 and mobile 0.057965 to 0.057892. This is no regression signal in one cold sample per route; it does not establish repeated-load or field CLS performance. Public and admin production builds passed. The browser capture covered the public app only.

The sanitized JSON artifacts retain timestamps, local origin, throttling, static route names, viewports, final paths, response status, font basenames and byte counts, CLS, and widths. Raw paired mobile Arabic landing screenshots are also included.

- [Before capture JSON](performance/fonts-before.json)
- [After capture JSON](performance/fonts-after.json)
- [Before Arabic mobile landing screenshot](performance/fonts-before-landing-ar-mobile.png)
- [After Arabic mobile landing screenshot](performance/fonts-after-landing-ar-mobile.png)

To reproduce locally, start the production app at a loopback URL and provide existing seeded local Playwright state files for student and teacher dashboards. The helper reads those states but does not include state paths or account data in its output:

```sh
: "${STUDENT_STATE_PATH:?Set this to an existing local seeded student storage state}"
: "${TEACHER_STATE_PATH:?Set this to an existing local seeded teacher storage state}"
node scripts/measure-font-payload.mjs \
  --base-url http://127.0.0.1:3184 \
  --student-state "$STUDENT_STATE_PATH" \
  --teacher-state "$TEACHER_STATE_PATH"
```

The output path must name a new directory under an existing parent that is not
writable by untrusted users; the helper creates it with private permissions and
refuses to reuse an existing path.
Without `--output`, it creates a private temporary directory automatically.

This is a narrow font payload change. Lighthouse targets, field CLS, dashboard JavaScript reduction, repeated cold-load measurements, and the broader #154 criteria remain open; this phase does not close #154.
