# Free repository protections implementation plan

**Goal:** implement the repository-side portion of #157 with existing free-plan tools.

**Architecture:** retain the hardened CI and release workflows, use GitHub-native
dependency PRs and CODEOWNERS, and generate a release dependency inventory with npm.
The specification is [issue #157](https://github.com/abdulrahman-111/DarSak/issues/157),
limited by the maintainer's instructions to exclude email delivery and paid services.

## Tasks

- [ ] Add weekly workspace-aware npm updates and monthly action updates; group only
      minor/patch npm updates, leaving major updates separately reviewable.
- [ ] Assign sensitive paths to the existing repository owner with CODEOWNERS.
- [ ] Fail CI if installation modifies the tracked npm lockfile.
- [ ] Attach a production CycloneDX SBOM generated from the lockfile to future releases.
- [ ] Document names, access, environment separation, rotation, and deferred operations.
- [ ] Inspect free GitHub protection settings if the integration permits administration.
- [ ] Validate YAML, formatting, lockfile/SBOM behavior and obtain Sol code review.
- [ ] Open a PR, require passing CI, merge it, and record completed and blocked criteria.

## Review focus

Workspace dependencies must be covered without duplicate update entries; action SHA
pins must remain intact; SBOM generation must not run dependency install scripts; no
secret values may enter documentation; API permission failure must never be reported
as proof that a security setting is enabled or disabled.

Email/SMTP changes and staging cron-secret rotation are deferred. There are no product,
database, paid-service, or deployment-environment changes in this phase. #157 stays open
until its outstanding administration and validation criteria are satisfied.
