# Preparing a release

The package version is currently `0.1.0`. Use the [0.1.0 release notes](releases/0.1.0.md) and [validation record](releases/0.1.0-validation.md) as the first release example.

1. Choose the release commit and review its migration and configuration changes. Run formatting, lint, typecheck, unit tests, and production build from a clean clone using Node.js 24 and `npm ci`.
2. Run all migrations, pgTAP tests, database fixtures, and the optional demo seed on a fresh disposable local backend. Confirm demo sign-in, teacher/student dashboards, and both languages. Record commands, tool versions, results, and limitations.
3. When claiming independently hosted deployment support, verify your own Supabase project using [Deployment](DEPLOYMENT.md). Record services exercised and exclusions honestly; never use demo credentials for production. A documented guide is not evidence of an independent human deployment.
4. Capture desktop and mobile screenshots for Arabic and English using the local synthetic accounts. Include discovery, a teacher group, and the student timetable. Place images under `docs/images/` and link them from the release notes. Remove personal data, session details, and credentials.
5. Update the draft release notes with actual validation, screenshots, and known limitations. Confirm version metadata and preserve third-party notices.
6. After review, maintainer authorization, and passing main-branch CI for the exact commit, push an annotated version tag such as `v0.1.0`. The `Publish release` workflow verifies the version/notes, checks that the commit belongs to `main` and has passing CI, and publishes the GitHub release using those notes. Use absolute, tag-specific links in the release notes so links and images also work on the GitHub release page. Never label unverified work as tested or stable.

For later releases, record upgrade instructions and required migrations. A database backup does not include Storage files or Auth provider settings. Document those separately and prepare recovery steps before deployment.
