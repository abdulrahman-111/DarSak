![DarSak](public/brand/darsak/english-header-lockup.svg)

# DarSak

DarSak connects students and teachers through bilingual profiles, learning groups, interactive schedules, and organized resources.

[Open DarSak](https://darsak-platform.vercel.app)

DarSak is a bilingual learning platform for students and teachers. Students can discover teachers and groups, request enrollment, follow lessons in a weekly timetable, and find resources shared by their teachers. Teachers can publish profiles and groups, manage enrollment, schedule lessons, share class resources, and communicate updates. The interface is available in English and Arabic.

## Technology

DarSak uses Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase Auth, Postgres and Storage, and Vercel for hosting and scheduled jobs.

## Get started

Use Node.js 24, npm, Docker, and the Supabase CLI. Run a backend on your own machine; no maintainer credentials are needed.

```sh
git clone https://github.com/abdulrahman-111/DarSak.git
cd DarSak
npm ci
supabase start
supabase status
cp .env.example .env.local
```

Copy the local Supabase URL and public key into `.env.local`, generate the recovery secret, then run `npm run dev`. Follow [Development](docs/DEVELOPMENT.md) for complete configuration, email confirmation, optional synthetic demo accounts, and verification. Follow [Deployment](docs/DEPLOYMENT.md) to use your own hosted backend.

## Commands

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm run start` serves the production build locally.
- `npm run lint` runs ESLint.
- `npm run format` formats the code with Prettier; `npm run format:check` (run in CI) fails on unformatted files.
- `npm run typecheck` checks TypeScript types.
- `npm test` runs the Vitest suite.

## Project guides

- [Development](docs/DEVELOPMENT.md) — local setup, environment variables, and contributor commands.
- [Architecture](docs/ARCHITECTURE.md) — app structure, data flow, and key integrations.
- [Deployment](docs/DEPLOYMENT.md) — hosting, Supabase configuration, migrations, and scheduled workers.
- [Archived project records](docs/archive/README.md) — historical proposals, plans, and validation notes.

## Repository layout

- `src/app/` — localized routes, layouts, and API endpoints.
- `src/features/` — feature-specific data access, domain logic, actions, and UI.
- `src/components/` — shared interface components.
- `src/lib/` — shared libraries, including Supabase clients.
- `messages/` — English and Arabic interface messages.
- `supabase/migrations/` — ordered database migrations; `supabase/functions/` — Edge Functions; `supabase/templates/` — Auth email templates.
- `scripts/` — maintenance scripts, including administrator setup.
- `tests/` — unit, database, and API integration coverage.

## Contributing and project status

See [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), the [roadmap](docs/ROADMAP.md), and [starter issues](docs/STARTER_ISSUES.md). See [adoption evidence](docs/ADOPTION.md) and the [pilot guide](docs/pilot/README.md) for maintainer-reported university use and privacy-preserving feedback collection. See the [0.1.0 release notes](docs/releases/0.1.0.md), [screenshots](docs/SCREENSHOTS.md), and [release checklist](docs/RELEASING.md). Published versions are listed on the [Releases page](https://github.com/abdulrahman-111/DarSak/releases).

## License

DarSak's original code and documentation use the [MIT License](LICENSE). Bundled fonts and dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
