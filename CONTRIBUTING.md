# Contributing to DarSak

DarSak helps Arabic- and English-speaking teachers and students organize learning groups, lessons, and resources. Contributions to documentation, accessibility, translations, tests, and bug fixes are welcome. You can discuss contributions in Arabic or English.

## Start here

1. Follow [Development](docs/DEVELOPMENT.md) to run your own local backend. You do not need access to the maintainer's Supabase project.
2. Read [Architecture](docs/ARCHITECTURE.md), the [roadmap](docs/ROADMAP.md), and [starter issue proposals](docs/STARTER_ISSUES.md).
3. For a larger change, open an issue describing the problem and proposed scope before investing in implementation. Check existing issues and pull requests for overlap.

## Submit a change

Fork the repository, create a branch from `main`, and keep the change focused. Explain the user-visible problem, what changed, and how you verified it. Add regression coverage for behavior changes; documentation-only changes need accurate commands and links rather than new tests. Include screenshots for visible UI changes, using synthetic data.

Run the app checks before opening a pull request:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

For database changes, create a new migration with the Supabase CLI and test the entire migration sequence on a disposable local stack. Run `supabase test db` as documented in [Development](docs/DEVELOPMENT.md); this includes the catalog security guard and the persona access matrix for core tables. For every new table or RPC, add explicit role expectations and matching matrix assertions; add catalog allow-list entries only for justified exceptions, with a reason beside each entry. Keep row-level security, grants, and Arabic/English behavior in review scope. Never reset a shared database to test a contribution.

Use `npm ci` and commit the lockfile when intentionally changing dependencies. Do not include environment files, credentials, production data, or generated build output. Keep third-party notices when adding or changing assets.

## Review and conduct

A maintainer reviews pull requests before merge. Please describe limitations or checks you could not run; CI results are part of the review. Be respectful, explain disagreements with evidence, and avoid sharing anyone's personal information in issues or screenshots. Maintainer availability varies; there is no guaranteed response time.

By submitting a contribution, you agree that your original contribution may be distributed under the project's [MIT license](LICENSE). Only submit work you have the right to contribute, and identify third-party material and its license.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md).
