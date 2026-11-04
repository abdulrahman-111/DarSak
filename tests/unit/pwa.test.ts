import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { localizedManifest } from '@/features/pwa/manifest';
import legacyManifest from '@/app/manifest';
import { renderPwaIcon } from '@/features/pwa/icon';

const require = createRequire(import.meta.url);
const worker = require('../../public/sw.js') as {
  shouldCacheResponse(input: {
    url: string;
    origin: string;
    method: string;
    headers?: Record<string, string>;
    status: number;
    contentType: string;
    byteLength: number;
    cacheControl?: string;
    redirected?: boolean;
  }): boolean;
  offlineFallback(locale: 'ar' | 'en'): Response;
  shouldDeleteCache(name: string): boolean;
  cacheAsset(request: Request): Promise<Response>;
};

describe('localized install manifests', () => {
  it('preserves the legacy root manifest', () => {
    expect(legacyManifest()).toMatchObject({
      name: 'DarSak',
      short_name: 'DarSak',
      start_url: '/ar',
      display: 'standalone',
    });
  });

  it.each([
    ['en', 'ltr', '/en', 'DarSak'],
    ['ar', 'rtl', '/ar', 'درسك'],
  ] as const)('provides an install manifest for %s', async (locale, dir, startUrl, name) => {
    const manifest = localizedManifest(locale);
    expect(manifest).toMatchObject({
      id: '/',
      lang: locale,
      dir,
      start_url: startUrl,
      scope: '/',
      name,
      display: 'standalone',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    });
  });
});

describe('PWA icon renderer', () => {
  it.each([
    [192, false],
    [512, false],
    [512, true],
  ] as const)('returns an actual %s pixel PNG', async (size, maskable) => {
    const image = renderPwaIcon(size, maskable);
    const bytes = Buffer.from(await image.arrayBuffer());
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  });
});

describe('service worker cache policy', () => {
  const request = {
    origin: 'https://darsak.example',
    method: 'GET',
    headers: {},
    status: 200,
    byteLength: 512,
  };

  it('caches only expected explicit and hashed same-origin static assets', () => {
    expect(
      worker.shouldCacheResponse({
        ...request,
        url: `${request.origin}/_next/static/chunks/0123456789abcdef.js`,
        contentType: 'text/javascript; charset=utf-8',
      }),
    ).toBe(true);
    expect(
      worker.shouldCacheResponse({
        ...request,
        url: `${request.origin}/_next/static/css/0123456789abcdef.css`,
        contentType: 'text/css',
      }),
    ).toBe(true);
    expect(
      worker.shouldCacheResponse({
        ...request,
        url: `${request.origin}/_next/static/media/0123456789abcdef.woff2`,
        contentType: 'font/woff2',
      }),
    ).toBe(true);
    expect(
      worker.shouldCacheResponse({
        ...request,
        url: `${request.origin}/icons/icon-512-maskable.png`,
        contentType: 'image/png',
      }),
    ).toBe(true);
  });

  it('rejects HTML, APIs, RSC, queries, non-GET, cross-origin and unbounded assets', () => {
    const isAllowed = (overrides: Partial<Parameters<typeof worker.shouldCacheResponse>[0]>) =>
      worker.shouldCacheResponse({
        ...request,
        url: `${request.origin}/_next/static/chunks/0123456789abcdef.js`,
        contentType: 'text/javascript',
        ...overrides,
      });
    expect(
      isAllowed({ url: `${request.origin}/en/student/classes`, contentType: 'text/html' }),
    ).toBe(false);
    expect(isAllowed({ url: `${request.origin}/api/viewer` })).toBe(false);
    expect(isAllowed({ url: `${request.origin}/en/student/classes?_rsc=123` })).toBe(false);
    expect(isAllowed({ headers: { rsc: '1' } })).toBe(false);
    expect(isAllowed({ method: 'POST' })).toBe(false);
    expect(isAllowed({ url: 'https://third-party.example/asset.js' })).toBe(false);
    expect(isAllowed({ url: `${request.origin}/_next/static/app.js` })).toBe(false);
    expect(isAllowed({ status: 206 })).toBe(false);
    expect(isAllowed({ contentType: 'text/html' })).toBe(false);
    expect(isAllowed({ byteLength: 1_048_577 })).toBe(false);
    expect(isAllowed({ redirected: true })).toBe(false);
    expect(isAllowed({ cacheControl: 'private, max-age=3600' })).toBe(false);
    expect(isAllowed({ cacheControl: 'PuBlIc, PrIvAtE = "Set-Cookie"' })).toBe(false);
    expect(isAllowed({ cacheControl: 'max-age=0, NO-STORE' })).toBe(false);
    expect(isAllowed({ cacheControl: 'public, max-age=3600' })).toBe(true);
  });

  it('returns successful network responses when Cache Storage open or put fails', async () => {
    const originalCaches = globalThis.caches;
    const originalFetch = globalThis.fetch;
    const originalSelf = (globalThis as { self?: unknown }).self;
    const request = new Request('https://darsak.example/_next/static/chunks/0123456789abcdef.js');
    const networkResponse = new Response('const app = true;', {
      headers: { 'content-type': 'text/javascript' },
    });
    const cache = {
      match: async () => undefined,
      put: async () => {
        throw new Error('quota exceeded');
      },
      keys: async () => [],
    };
    try {
      (globalThis as { self?: unknown }).self = { location: { origin: 'https://darsak.example' } };
      globalThis.fetch = async () => networkResponse.clone();
      globalThis.caches = {
        open: async () => cache,
      } as unknown as CacheStorage;
      await expect(worker.cacheAsset(request)).resolves.toBeInstanceOf(Response);
      await expect((await worker.cacheAsset(request)).text()).resolves.toContain('const app');

      globalThis.caches = {
        open: async () => {
          throw new Error('storage unavailable');
        },
      } as unknown as CacheStorage;
      await expect((await worker.cacheAsset(request)).text()).resolves.toContain('const app');
    } finally {
      globalThis.caches = originalCaches;
      globalThis.fetch = originalFetch;
      if (originalSelf === undefined) delete (globalThis as { self?: unknown }).self;
      else (globalThis as { self?: unknown }).self = originalSelf;
    }
  });

  it('creates generic uncached offline pages in each locale and scopes cleanup to owned caches', async () => {
    const english = worker.offlineFallback('en');
    const arabic = worker.offlineFallback('ar');
    expect(english.headers.get('cache-control')).toBe('no-store');
    expect(await english.text()).toContain('<html lang="en" dir="ltr">');
    expect(await arabic.text()).toContain('<html lang="ar" dir="rtl">');
    expect(worker.shouldDeleteCache('darsak-pwa-static-v0')).toBe(true);
    expect(worker.shouldDeleteCache('next-cache')).toBe(false);
    expect(worker.shouldDeleteCache('unrelated-app-cache')).toBe(false);
  });
});
