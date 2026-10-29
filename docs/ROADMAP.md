# Roadmap

This is a maintenance roadmap, not a promise of delivery dates. Discuss larger changes in an issue before implementation.

The ordered list of issues to fix from the October 2026 architecture review (features, performance and security) is in [ARCHITECTURE-REVIEW-2026-10.md](ARCHITECTURE-REVIEW-2026-10.md), tracked in [#161](https://github.com/abdulrahman-111/DarSak/issues/161).

## Release maintenance and remaining verification

- Keep formatting, lint, typecheck, unit tests, production build, and disposable-database checks passing.
- Verify the fresh-clone setup and optional demo data with a developer who has no access to the maintainer's environment.
- Review both language flows for discovery, enrollment, scheduling, resources, and account management.
- Capture screenshots using synthetic accounts and publish setup instructions and known limitations with the release.

## Contributor experience

- Improve setup troubleshooting based on independent deployment feedback.
- Review keyboard navigation, form errors, and Arabic right-to-left layouts.
- Expand behavior coverage for scheduling boundaries and permission-sensitive workflows.
- Keep translations consistent across teacher and student flows.

## Pilot and adoption evidence

Invite a small teacher/student pilot and an independent developer deployment. With participants' permission, record dated aggregate counts, repeated usage, reported problems, fixes, and deployment feedback. Keep personal data out of public reports. Report actual results and limitations; repository changes and demo accounts are not adoption evidence.

## Later decisions

Use pilot feedback to prioritize improvements. Fully self-managed production Supabase hosting, additional integrations, and teacher plan activation require separate design and operational validation. The current deployment guide targets an independently owned Supabase project and a Next.js host.
