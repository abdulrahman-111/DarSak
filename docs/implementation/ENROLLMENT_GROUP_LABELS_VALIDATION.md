# Enrollment group labels

Pending requests returned a null nested group because group SELECT policies depend on private teacher profile rows. Added an active-student-only, caller-scoped, bounded enrollment summary instead of widening group membership or lesson/material permissions. Names remain available in own request history; private locations are withheld unless the group is public or the student is accepted. Links appear only for viewable published groups.

Validation: initial full unit run had 361 passing tests and one incorrect test offset expectation. Corrected the expectation (page 999 starts at offset 19960); focused loader tests passed (4), independent Sol checks passed (6). Lint, standalone typecheck and production webpack build passed. All 36 local database suites and 173 real local API assertions passed. Actual Chromium enrollment submission followed by the classes page passed in English and Arabic at 390px and 1440px (four scenarios), showing group name, location, pending badge and class link. Fixtures were cleaned up. Local browser disconnection emitted one destination-stream-closed log; all browser assertions completed successfully.

Migration: 20261016084249_student_enrollment_page.sql, applied locally after the regression failed before the RPC existed. Production deployment uses the same migration. No existing enrollment data needs rewriting.
