# Dependency compatibility

The public and administrator apps compile their styles independently. Keep `tailwindcss` and `@tailwindcss/postcss` pinned to the same version in both workspace manifests, and keep each stylesheet's explicit source list and matching `.mjs` theme config in sync with its app. The compiled CSS contract is checked by `tests/unit/tailwind-output.test.ts`.

Unsupported TypeScript and ESLint major versions are bounded by the narrow Dependabot ignores in `.github/dependabot.yml`; normal CI remains the compatibility gate. Vercel keeps its standard branch deployment behavior instead of suppressing every Dependabot branch through `vercel.json`.
