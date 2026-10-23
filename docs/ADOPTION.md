# Adoption and evidence

## Maintainer-reported university use

On 23 October 2026, the maintainer reported that teachers and students at their university use DarSak and provided the approximate counts below. Participant names are intentionally not published.

| Cohort   | Maintainer's estimate | Source                                        |
| -------- | --------------------- | --------------------------------------------- |
| Teachers | About 20              | Maintainer report; not independently measured |
| Students | About 200             | Maintainer report; not independently measured |

These are estimates of the reported university user community. They have not been classified as registered accounts, active users, or recently returning users. The reporting date above is not a first-use date or a measured activity window.

## Measurement status and unknowns

| Evidence item                                       | Current status                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registered teacher/student accounts                 | Not measured or supplied separately                                                                                                                  |
| Active teachers/students in a defined recent period | Unknown                                                                                                                                              |
| Participants returning on a later day               | Unknown                                                                                                                                              |
| First-use dates and duration of use                 | Unknown                                                                                                                                              |
| Groups and lessons managed                          | Not measured or supplied                                                                                                                             |
| Observation period for the estimates                | Not specified                                                                                                                                        |
| Method                                              | Approximate counts supplied by the maintainer; no database query, analytics export, or participant survey used for these estimates                   |
| Demo/test account exclusion                         | Not yet verified for the estimates; demo, test, administrator, and automated accounts must be excluded from future measured teacher/student totals   |
| Independent developer deployment                    | Not yet documented; [setup verification issue #76](https://github.com/abdulrahman-111/DarSak/issues/76) remains the invitation for an outside report |

Do not present approximately 220 reported participants as 220 active users, 220 verified accounts, or a measured retention figure. Leave unknown values blank in the [aggregate-results sheet](pilot/aggregate-results.csv); do not put these estimates into its active-user columns.

## Teacher feedback

No teacher feedback or permission to quote has been supplied for this record. No teachers were contacted as part of this documentation update. Teacher-reported benefits, improvement requests, and a concrete feedback-led fix therefore remain undocumented. This record contains no teacher testimonials or attributed quotations.

## Verified maintenance example

[PR #75](https://github.com/abdulrahman-111/DarSak/pull/75) repaired booking tests whose fixed dates had expired by controlling the test clock and checking Cairo-to-UTC conversion. The recorded trigger was a CI failure. This is a concrete maintenance example; no teacher-feedback origin is claimed.

## Strengthening the evidence

When aggregate measurements are available, record their observation dates, definitions, source, and limitations. Report registered accounts separately from users who performed a relevant activity during a stated period. Count returning users only when observations support a later-day return, and exclude demo/test accounts.

Actual feedback can be documented anonymously if it is later supplied. Publish a quotation only with the speaker's permission. Do not infer adoption, feedback, or independent contribution from synthetic demo records, CI runs, screenshots, repository stars, or automated setup checks.

The [pilot and evidence guide](pilot/README.md) provides task cards, feedback questions, and an aggregate-results template. Participant names are not required.
