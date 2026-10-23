# Security policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/abdulrahman-111/DarSak/security/advisories/new) for authentication bypasses, unauthorized data access, exposed credentials, or other security vulnerabilities. This route is available only if private reporting is enabled for the repository. If it is unavailable, contact the maintainer through a private contact method listed on their [GitHub profile](https://github.com/abdulrahman-111). If no private contact is available, open an issue asking for a private reporting channel without including vulnerability details.

Include the affected commit, a minimal reproduction using synthetic accounts, expected and observed behavior, and potential impact. Do not send live credentials or other people's data. Avoid publishing exploit details before the maintainer has had a chance to investigate and coordinate disclosure.

## Supported versions

The current `main` branch is the maintenance target. Older commits and deployments do not have a promised security backport policy. A tagged release does not imply a security audit. Maintainer availability varies; no response or remediation deadline is guaranteed.

## Deployment responsibilities

Operators manage their own infrastructure, secrets, backups, Auth configuration, and dependency updates. Follow [Deployment](docs/DEPLOYMENT.md). Use synthetic data on disposable development stacks, keep service-role keys server-side, and review database grants and row-level security when deploying changes. Never expose the Supabase local development stack or its demo credentials to the internet.
