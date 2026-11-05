# Dependency security notes

## Issue 184: minimatch in the TypeScript ESLint project service

The `GHSA-g3hv-75wg-m249` moderate denial-of-service advisory affects `minimatch` versions from 7.0.0 through 11.0.0. The affected copy was nested under `@typescript-eslint/typescript-estree@8.70.0`, which is used by the TypeScript ESLint parser. The repository's legacy root `minimatch@3.1.5` is outside the advisory range and is left unchanged.

The root manifest scopes an override to `@typescript-eslint/typescript-estree@8.70.0`, resolving its `minimatch` dependency to 11.0.4. This retains Next 16.4.3, TypeScript 6.0.3, ESLint 9.39.5, and the existing security plugin and rules. The lockfile records the additional `@isaacs/nonrecursive-glob-match` dependency and the updated brace-expansion range required by minimatch 11.0.4. The current Node 24 engine satisfies minimatch 11's declared engine range.

This override crosses the TypeScript ESTree package's declared `^10.2.2` minimatch range. Keep it version-scoped, review it whenever TypeScript ESTree changes, and remove it when upstream accepts a fixed compatible minimatch release. The parser calls minimatch while evaluating `projectService.allowDefaultProject`; ordinary lint does not exercise that path. CI therefore runs `tests/integration/eslint-parser-compat.mjs` after a fresh install. It covers allowed root JS and TS files, a hidden TS file, rejection of a nonmatching file, rejection of a file that is both in the configured project and allowlist, and the default-project file limit. The harness uses the parser's resolved dependency through the parser itself.

CI also runs a full `npm audit --audit-level=moderate` gate after installation. The updated lockfile-only audit was clean during preparation. The runtime parser compatibility harness and the rest of the repository's CI checks have not been run in this shared workspace; rely on the isolated GitHub CI result before treating the override as verified or closing issue 184.
