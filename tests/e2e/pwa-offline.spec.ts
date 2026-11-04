import { expect, fixtureData, test } from './support/fixtures';

test('offline navigation never replays private pages or caches API and RSC responses', async ({
  studentPage,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const copy =
    locale === 'ar'
      ? {
          install: 'ثبّت درسك',
          offline: 'لا يوجد اتصال بالإنترنت',
          helpMessage: /قائمة المتصفح|Safari/i,
        }
      : {
          install: 'Install DarSak',
          offline: 'You’re offline',
          helpMessage: /browser menu|Safari/i,
        };
  const { ids } = fixtureData(testInfo.project.name);
  const privatePath = `/${locale}/student/classes/${ids.groupId}`;
  const privateContent = 'E2E mathematics group';

  try {
    const manifestResponse = await studentPage.request.get(`/${locale}/manifest.webmanifest`);
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({ id: '/', lang: locale, start_url: `/${locale}` });
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const iconResponse = await studentPage.request.get(icon.src);
      expect(iconResponse.status()).toBe(200);
      expect(iconResponse.headers()['content-type']).toContain('image/png');
      const bytes = Buffer.from(await iconResponse.body());
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBe(Number.parseInt(icon.sizes, 10));
    }

    await studentPage.goto(privatePath);
    await expect(studentPage.getByText(privateContent, { exact: true })).toBeVisible();

    await studentPage.goto(`/${locale}/help`);
    expect(
      await studentPage.evaluate(() => navigator.serviceWorker.getRegistration('/')),
    ).toBeUndefined();
    await studentPage.getByRole('button', { name: copy.install }).click();
    await expect(studentPage.locator('main').getByRole('status')).toContainText(copy.helpMessage);
    await expect
      .poll(() => studentPage.evaluate(() => navigator.serviceWorker.getRegistration('/')))
      .toBeTruthy();

    // Reload after registration so this document is controlled by the explicitly enabled worker.
    await studentPage.reload();
    await expect
      .poll(() => studentPage.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    const assetResponse = await studentPage.evaluate(async () => {
      const response = await fetch('/brand/darsak/favicon.svg', { cache: 'reload' });
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
      };
    });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.contentType).toContain('image/svg+xml');
    await expect
      .poll(() =>
        studentPage.evaluate(async () => {
          const assetUrl = new URL('/brand/darsak/favicon.svg', location.origin).href;
          for (const name of await caches.keys()) {
            if (!name.startsWith('darsak-pwa-static-')) continue;
            const cache = await caches.open(name);
            if (await cache.match(assetUrl)) return true;
          }
          return false;
        }),
      )
      .toBe(true);
    await studentPage.goto(privatePath);
    await expect(studentPage.getByText(privateContent, { exact: true })).toBeVisible();

    await studentPage.evaluate(async () => {
      await Promise.all([
        fetch('/api/viewer', { cache: 'no-store' }).catch(() => undefined),
        fetch(`${location.pathname}?_rsc=pwa-cache-check`, { headers: { rsc: '1' } }).catch(
          () => undefined,
        ),
      ]);
    });

    const cachedEntries = await studentPage.evaluate(async () => {
      const entries: { url: string; type: string; body: string }[] = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('darsak-pwa-static-')) continue;
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          entries.push({
            url: request.url,
            type: response?.headers.get('content-type') ?? '',
            body: (await response?.clone().text()) ?? '',
          });
        }
      }
      return entries;
    });
    expect(cachedEntries.length).toBeGreaterThan(0);
    expect(cachedEntries.every(entry => !entry.type.startsWith('text/html'))).toBe(true);
    expect(cachedEntries.every(entry => !entry.body.includes(privateContent))).toBe(true);
    expect(
      cachedEntries.some(entry =>
        /\/student\/|\/api\/|_rsc=/.test(new URL(entry.url).pathname + new URL(entry.url).search),
      ),
    ).toBe(false);
    expect(
      cachedEntries.every(entry => {
        const path = new URL(entry.url).pathname;
        return (
          path.startsWith('/_next/static/') ||
          path === '/brand/darsak/favicon.svg' ||
          path.startsWith('/icons/icon-')
        );
      }),
    ).toBe(true);

    await studentPage.context().setOffline(true);
    await studentPage.reload();
    await expect(studentPage.getByRole('heading', { name: copy.offline })).toBeVisible();
    await expect(studentPage.locator('html')).toHaveAttribute('lang', locale);
    await expect(studentPage.getByText(privateContent, { exact: true })).toHaveCount(0);
    const offlineCacheEntries = await studentPage.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('darsak-pwa-static-')) continue;
        const cache = await caches.open(name);
        urls.push(...(await cache.keys()).map(request => request.url));
      }
      return urls;
    });
    expect(offlineCacheEntries).not.toContain(studentPage.url());
  } finally {
    await studentPage.context().setOffline(false);
    await studentPage.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter(registration => new URL(registration.scope).origin === location.origin)
          .map(registration => registration.unregister()),
      );
      const ownedCaches = (await caches.keys()).filter(name =>
        name.startsWith('darsak-pwa-static-'),
      );
      await Promise.all(ownedCaches.map(name => caches.delete(name)));
    });
  }
});
