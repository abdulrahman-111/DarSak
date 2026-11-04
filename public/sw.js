/* global self, caches, fetch, Response, URL, module */
(() => {
  const CACHE_PREFIX = 'darsak-pwa-static-';
  const CACHE_NAME = `${CACHE_PREFIX}v1`;
  const MAX_CACHE_ENTRIES = 48;
  const MAX_ENTRY_BYTES = 1024 * 1024;
  const BRAND_ASSETS = new Map([
    ['/brand/darsak/favicon.svg', ['image/svg+xml']],
    ['/icons/icon-192.png', ['image/png']],
    ['/icons/icon-512.png', ['image/png']],
    ['/icons/icon-512-maskable.png', ['image/png']],
  ]);

  function expectedTypes(pathname) {
    const brandTypes = BRAND_ASSETS.get(pathname);
    if (brandTypes) return brandTypes;
    if (!pathname.startsWith('/_next/static/')) return null;
    const filename = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (!/(?:^|[.-])[a-f0-9]{8,}(?:[.-]|$)/i.test(filename)) return null;
    const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
    if (extension === 'js') return ['application/javascript', 'text/javascript'];
    if (extension === 'css') return ['text/css'];
    if (extension === 'woff' || extension === 'woff2') return ['font/woff', 'font/woff2'];
    return null;
  }

  function requestIsCacheable({ url: rawUrl, origin, method, headers = {} }) {
    if (method !== 'GET') return false;
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (url.origin !== origin || url.search || url.hash) return false;
    const requestHeaders = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.toLowerCase()]),
    );
    if (
      requestHeaders.rsc ||
      requestHeaders['next-router-prefetch'] ||
      requestHeaders.purpose?.includes('prefetch')
    ) {
      return false;
    }
    return expectedTypes(url.pathname) !== null;
  }

  function shouldCacheResponse(input) {
    if (!requestIsCacheable(input) || input.status !== 200 || input.redirected) return false;
    if (!Number.isFinite(input.byteLength) || input.byteLength <= 0 || input.byteLength > MAX_ENTRY_BYTES)
      return false;
    const url = new URL(input.url);
    const allowedTypes = expectedTypes(url.pathname);
    const contentType = input.contentType.split(';', 1)[0].trim().toLowerCase();
    const cacheControl = (input.cacheControl ?? '').toLowerCase();
    const forbiddenCacheDirective = /(?:^|,)\s*(?:private(?:\s*=\s*[^,]*)?|no-store)(?=\s*(?:,|$))/i;
    return allowedTypes.includes(contentType) && !forbiddenCacheDirective.test(cacheControl);
  }

  function offlineFallback(locale) {
    const copy =
      locale === 'ar'
        ? {
            lang: 'ar',
            dir: 'rtl',
            title: 'لا يوجد اتصال بالإنترنت',
            message: 'تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.',
            home: 'العودة إلى درسك',
          }
        : {
            lang: 'en',
            dir: 'ltr',
            title: 'You’re offline',
            message: 'Check your internet connection and try again.',
            home: 'Return to DarSak',
          };
    return new Response(
      `<!doctype html><html lang="${copy.lang}" dir="${copy.dir}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.title}</title><body><main><h1>${copy.title}</h1><p>${copy.message}</p><a href="/${copy.lang}">${copy.home}</a></main></body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  function shouldDeleteCache(name) {
    return name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME;
  }

  async function trimCache(cache) {
    const keys = await cache.keys();
    for (const request of keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES))) {
      await cache.delete(request);
    }
  }

  async function cacheAsset(request) {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch {
      // Cache Storage is an optimization; continue with the network when it is unavailable.
    }
    const response = await fetch(request);
    if (!cache) return response;
    try {
      const bytes = await response.clone().arrayBuffer();
      if (
        shouldCacheResponse({
          url: request.url,
          origin: self.location.origin,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          cacheControl: response.headers.get('cache-control') ?? '',
          redirected: response.redirected,
          byteLength: bytes.byteLength,
        })
      ) {
        const headers = Object.fromEntries(response.headers.entries());
        await cache.put(request, new Response(bytes, { status: response.status, headers }));
        await trimCache(cache);
      }
    } catch {
      // Return the successful network response even when cache operations fail.
    }
    return response;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { shouldCacheResponse, offlineFallback, shouldDeleteCache, cacheAsset };
  }

  if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
    self.addEventListener('activate', event => {
      event.waitUntil(
        caches.keys().then(names =>
          Promise.all(names.filter(shouldDeleteCache).map(name => caches.delete(name))),
        ),
      );
    });

    self.addEventListener('fetch', event => {
      const request = event.request;
      if (request.method === 'GET' && request.mode === 'navigate') {
        event.respondWith(
          fetch(request).catch(() =>
            offlineFallback(new URL(request.url).pathname.split('/')[1] === 'ar' ? 'ar' : 'en'),
          ),
        );
        return;
      }
      if (
        requestIsCacheable({
          url: request.url,
          origin: self.location.origin,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
        })
      ) {
        event.respondWith(cacheAsset(request));
      }
    });
  }
})();
