# Installable public app

The English and Arabic Help pages offer an explicit **Install DarSak** action. Registration of the public app's service worker happens only after that action. Supported browsers can then offer installation; other browsers show their menu instructions, including Safari's Add to Home Screen flow. Registering a worker alone does not mean the app was installed. Native iOS and Android installation dialogs have not been manually verified.

Localized manifests live at `/en/manifest.webmanifest` and `/ar/manifest.webmanifest`, with one stable app ID (`/`), localized launch URLs and direction. The existing root manifest remains available. The 192px, 512px and maskable PNG endpoints render the approved brand SVG with the existing image renderer. The separate administrator application is unchanged.

## Offline and cache boundaries

Navigation uses the network. If it fails, the worker returns a generic localized offline page generated from fixed text. It does not store or replay pages, names, lessons or account details. API responses, React Server Component responses, non-GET requests and query-bearing requests do not enter its static cache.

Only explicitly listed brand assets and hashed Next.js static JavaScript, CSS and font assets from the same origin may be cached. Responses must have the expected content type and status, must not be redirected, and must not declare `private` or `no-store`. Each entry is limited to 1 MiB and the cache to 48 entries. Cache Storage failures fall back to the fetched response; they must not break a successful network request. Older caches are removed only under this worker's `darsak-pwa-static-` prefix. Changes to this policy should update the owned cache version when necessary.

Push notifications, background delivery and offline access to private content are outside this phase. Keep the account-switch protections and private `no-store` responses described in [Caching](CACHING.md).

## Validation

Unit tests cover manifest content, actual generated PNG signatures/dimensions, static cache eligibility, redirected/private responses and Cache Storage failures. Production-build browser tests run in the four English/Arabic desktop/mobile Chromium projects. They fetch the actual manifest and icon routes, enable the worker through Help, warm an enrolled class, inspect CacheStorage for private/API/RSC content, and verify a generic offline response. Cleanup restores connectivity and removes only the test worker and its owned caches.

These automated checks do not establish native OS installation, field performance, push delivery or completion of the broader PWA roadmap issue.
