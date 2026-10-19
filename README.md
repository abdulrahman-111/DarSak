![DarSak](public/brand/darsak/english-header-lockup.svg)

# DarSak

DarSak connects students and teachers through bilingual profiles, learning groups, interactive schedules, and organized resources.

[Open DarSak](https://darsak-platform.vercel.app)

DarSak is a bilingual learning platform for students and teachers. Students can discover teachers and groups, request enrollment, follow lessons in a weekly timetable, and find resources shared by their teachers. Teachers can publish profiles and groups, manage enrollment, schedule lessons, share class resources, and communicate updates. The interface is available in English and Arabic.

## Technology

DarSak uses Next.js 16, React 19, TypeScript, Tailwind CSS, Supabase Auth, Postgres and Storage, and Vercel for hosting and scheduled jobs.

## Get started

Use Node.js 22 and connect the app to the configured Supabase project. Copy `.env.example` to `.env.local`, then set the Supabase URL and publishable key for your development environment. Docker is required for a fresh local Supabase stack.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep server-only credentials out of `NEXT_PUBLIC_*` variables. See [Development](docs/DEVELOPMENT.md) before changing Supabase or applying migrations.

## Commands

- `npm run dev` starts the Next.js development server.
- `npm run build` creates a production build.
- `npm run start` serves the production build locally.
- `npm run lint` runs ESLint.
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
