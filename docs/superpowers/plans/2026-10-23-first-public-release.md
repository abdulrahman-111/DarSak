# First public release execution plan

The user explicitly requested all six follow-up steps and excluded email work. Existing authorization includes merging PR #75, publishing starter issues, creating the tag/release, and preparing a real pilot. No additional approval is needed for those actions.

- [x] Verify and merge the reviewed OSS-readiness PR at its passing head.
- [x] Publish three starter issues after checking for duplicates.
- [x] Verify a fresh app clone with a separate disposable backend, using only synthetic accounts; capture Arabic/English teacher and student screenshots.
- [x] Publish honest validation notes and release limitations. Add tag-triggered release publishing because the connector has no release-creation tool and the local GitHub CLI has no usable API credential.
- [x] Add pilot task cards, invitation text, consent/privacy guidance, and an empty aggregate evidence record. Real participant activity remains dependent on consenting people, not automated fixtures.
- [ ] Review and check the release changes, merge after passing CI, tag the tested commit, publish v0.1.0, and verify the public release URL.

Email configuration, delivery, and workers are excluded. Existing email implementation is not changed. Do not describe automated verification as an outside contributor, human deployment, or real adoption.

Execution notes: PR #75 merged as 674aa75425b3bace224f24c9b5818a95bca8f1e8. Starter issues #76, #77, and #78 are published and labeled good first issue. The separate fresh clone built successfully; API smoke checks and 20 authenticated/discovery browser screenshots completed. Cloud-specific slim-image/proxy/default-template adjustments and excluded services are documented in the validation record. The maintainer reports university usage but does not want participant names published; no names are required, and aggregate details have been requested without inventing results.
