# Preparing a release

The package version is currently `0.1.0`. [The 0.1.0 release notes](releases/0.1.0.md) are a draft until a tested commit is tagged and published.

1. Choose the release commit and review its migration and configuration changes. Run formatting, lint, typecheck, unit tests, and production build from a clean clone using Node.js 24 and `npm ci`.
2. Run all migrations, pgTAP tests, database fixtures, and the optional demo seed on a fresh disposable local backend. Confirm demo sign-in, teacher/student dashboards, and both languages. Record commands, tool versions, results, and limitations.
3. Verify an independently owned hosted Supabase project using [Deployment](DEPLOYMENT.md). Confirm Auth email delivery, storage access, and any enabled workers. Do not use demo credentials for production.
4. Capture desktop and mobile screenshots for Arabic and English using the local synthetic accounts. Include discovery, a teacher group, and the student timetable. Place images under `docs/images/` and link them from the release notes. Remove personal data, session details, and credentials.
5. Update the draft release notes with actual validation, screenshots, and known limitations. Confirm version metadata and preserve third-party notices.
6. After review and passing checks on that commit, create an annotated `v0.1.0` tag and a GitHub release using the reviewed notes. Never label unverified work as tested or stable. Publish the release only after maintainer approval.

For later releases, record upgrade instructions and required migrations. A database backup does not include Storage files or Auth provider settings. Document those separately and prepare recovery steps before deployment.
