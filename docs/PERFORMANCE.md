# Performance measurements

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
  --teacher-state "$TEACHER_STATE_PATH" \
  --output /tmp/font-measurements
```

This is a narrow font payload change. Lighthouse targets, field CLS, dashboard JavaScript reduction, repeated cold-load measurements, and the broader #154 criteria remain open; this phase does not close #154.
