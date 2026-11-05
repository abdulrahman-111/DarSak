import { test, expect } from './support/fixtures';
import { fixtureData } from './support/data';

test('anonymous public routes, sitemap XML and raw crawler HTML expose consistent SEO metadata', async ({
  page,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(testInfo.project.name);
  const paths = [
    `/${locale}`,
    `/${locale}/teachers`,
    `/${locale}/help`,
    `/${locale}/privacy`,
    `/${locale}/terms`,
    `/${locale}/teachers/${ids.teacherId}`,
    `/${locale}/groups/${ids.groupId}`,
  ];
  let canonicalOrigin = '';
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname.replace(/\/$/, ''), 'route must not redirect').toBe(path);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
    canonicalOrigin ||= new URL(canonical!).origin;
    const route = path.slice(`/${locale}`.length);
    const normalizedPath = route || '';
    expect(canonical).toBe(`${canonicalOrigin}/${locale}${normalizedPath}`);
    for (const alternateLocale of ['ar', 'en'] as const) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${alternateLocale}"]`),
      ).toHaveAttribute('href', `${canonicalOrigin}/${alternateLocale}${normalizedPath}`);
    }
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical!);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      (await page.locator('title').textContent()) ?? '',
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      (await page.locator('meta[name="description"]').getAttribute('content')) ?? '',
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      'content',
      locale === 'ar' ? 'ar_EG' : 'en_US',
    );
    const expectedImage = path.includes('/teachers/')
      ? `${canonicalOrigin}${path}/opengraph-image`
      : path.includes('/groups/')
        ? `${canonicalOrigin}${path}/opengraph-image`
        : `${canonicalOrigin}/${locale}/opengraph-image`;
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      expectedImage,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      expectedImage,
    );
    const noindex = await page
      .locator('meta[name="robots"]')
      .evaluateAll(tags => tags.some(tag => tag.getAttribute('content')?.includes('noindex')));
    expect(noindex, `${path} should be indexable`).toBe(false);
  }

  const robotsResponse = await page.request.get('/robots.txt');
  expect(robotsResponse.status()).toBe(200);
  const robots = await robotsResponse.text();
  expect(robots).toContain(`Sitemap: ${canonicalOrigin}/sitemap.xml`);

  const sitemapObservations: Array<{
    elapsedMs: number;
    cacheControl: string | null;
    status: number;
  }> = [];
  let sitemapText = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    const response = await page.request.get('/sitemap.xml');
    sitemapObservations.push({
      elapsedMs: Date.now() - started,
      cacheControl: response.headers()['cache-control'] ?? null,
      status: response.status(),
    });
    expect(response.status()).toBe(200);
    if (attempt === 0) sitemapText = await response.text();
  }
  await testInfo.attach('anonymous-sitemap-request-observations.json', {
    body: JSON.stringify(sitemapObservations, null, 2),
    contentType: 'application/json',
  });
  const sitemapDocument = await page.evaluate(source => {
    const xml = new DOMParser().parseFromString(source, 'application/xml');
    const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';
    const rows = [...xml.getElementsByTagNameNS(sitemapNamespace, 'url')].map(row => {
      const loc = row.getElementsByTagNameNS(sitemapNamespace, 'loc')[0]?.textContent ?? '';
      const alternates = [...row.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link')]
        .filter(link => link.getAttribute('rel') === 'alternate')
        .map(link => ({ locale: link.getAttribute('hreflang'), href: link.getAttribute('href') }));
      return { loc, alternates };
    });
    return { parseError: xml.querySelector('parsererror') !== null, rows };
  }, sitemapText);
  expect(sitemapDocument.parseError).toBe(false);
  const sitemapRows = sitemapDocument.rows;
  const locations = sitemapRows.map(row => row.loc);
  expect(new Set(locations).size).toBe(locations.length);
  for (const staticPath of ['', '/teachers', '/help', '/privacy', '/terms']) {
    for (const otherLocale of ['ar', 'en']) {
      expect(locations).toContain(`${canonicalOrigin}/${otherLocale}${staticPath || ''}`);
    }
  }
  for (const [kind, id] of [
    ['teachers', ids.teacherId],
    ['groups', ids.groupId],
  ] as const) {
    for (const otherLocale of ['ar', 'en']) {
      expect(locations).toContain(`${canonicalOrigin}/${otherLocale}/${kind}/${id}`);
    }
  }
  expect(
    locations.some(location =>
      /\/(login|register|account|student|teacher|dashboard)(\/|$)/.test(new URL(location).pathname),
    ),
  ).toBe(false);
  for (const row of sitemapRows) {
    const pathname = new URL(row.loc).pathname;
    const match = pathname.match(/^\/(ar|en)(\/.*)?$/);
    expect(match).toBeTruthy();
    const path = match?.[2] ?? '';
    expect(row.alternates).toEqual(
      expect.arrayContaining([
        { locale: 'ar', href: `${canonicalOrigin}/ar${path}` },
        { locale: 'en', href: `${canonicalOrigin}/en${path}` },
      ]),
    );
  }

  for (const path of [
    `/${locale}/teachers/${ids.teacherId}`,
    `/${locale}/groups/${ids.groupId}`,
  ] as const) {
    for (const userAgent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'WhatsApp/2.24.8.85 A',
    ]) {
      const raw = await page.request.get(path, { headers: { 'user-agent': userAgent } });
      expect(raw.status()).toBe(200);
      const html = await raw.text();
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('property="og:title"');
      expect(html).toContain('property="og:description"');
      expect(html).toContain(`${canonicalOrigin}${path}`);
      expect(html).toContain('type="application/ld+json"');
      const schemaText = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
      )?.[1];
      expect(schemaText).toBeTruthy();
      const schema = JSON.parse(schemaText!.replaceAll('&quot;', '"').replaceAll('&#x27;', "'"));
      const keys = (value: unknown): string[] =>
        value && typeof value === 'object'
          ? Object.entries(value).flatMap(([key, child]) => [key.toLowerCase(), ...keys(child)])
          : [];
      for (const privateField of ['telephone', 'email', 'contactpoint', 'whatsapp']) {
        expect(keys(schema)).not.toContain(privateField);
      }
    }
  }
});

test('landing and public entity pages expose localized JSON-LD and valid share cards', async ({
  page,
  outsiderPage,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(testInfo.project.name);
  await page.goto(`/${locale}`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  const landingGraph = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? 'null',
  );
  expect(landingGraph['@graph'].map((entity: { '@type': string }) => entity['@type'])).toEqual([
    'Organization',
    'WebSite',
  ]);
  expect(landingGraph['@graph'][1].url).toMatch(new RegExp(`/${locale}$`));
  for (const [path, id, expectedType] of [
    [`/${locale}/teachers/${ids.teacherId}`, ids.teacherId, 'Person'],
    [`/${locale}/groups/${ids.groupId}`, ids.groupId, 'Course'],
  ] as const) {
    const response = await outsiderPage.goto(path);
    expect(response?.status()).toBe(200);
    const structuredData = await outsiderPage
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(structuredData).toHaveLength(1);
    expect(JSON.parse(structuredData[0])['@type']).toBe(expectedType);
    const imageUrl = await outsiderPage
      .locator('meta[property="og:image"]')
      .getAttribute('content');
    expect(imageUrl).toContain(
      `/${locale}/${expectedType === 'Person' ? 'teachers' : 'groups'}/${id}/opengraph-image`,
    );
    const imageResponse = await outsiderPage.request.get(imageUrl!);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['content-type']).toContain('image/png');
    const image = await imageResponse.body();
    const dimensions = new DataView(
      image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength),
    );
    expect(dimensions.getUint32(16)).toBe(1200);
    expect(dimensions.getUint32(20)).toBe(630);

    const uppercaseImage = await outsiderPage.request.get(
      `/${locale}/${expectedType === 'Person' ? 'teachers' : 'groups'}/${id.toUpperCase()}/opengraph-image`,
    );
    expect(uppercaseImage.status()).toBe(200);
    expect(uppercaseImage.headers()['content-type']).toContain('image/png');
    const uppercaseBody = await uppercaseImage.body();
    const uppercaseDimensions = new DataView(
      uppercaseBody.buffer.slice(
        uppercaseBody.byteOffset,
        uppercaseBody.byteOffset + uppercaseBody.byteLength,
      ),
    );
    expect(uppercaseDimensions.getUint32(16)).toBe(1200);
    expect(uppercaseDimensions.getUint32(20)).toBe(630);

    const typePath = expectedType === 'Person' ? 'teachers' : 'groups';
    await outsiderPage.goto(`/${locale}/${typePath}/${id.toUpperCase()}`);
    const normalizedPath = `/${locale}/${typePath}/${id}`;
    await expect(outsiderPage.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`${normalizedPath}$`),
    );
    for (const alternateLocale of ['ar', 'en'] as const) {
      await expect(
        outsiderPage.locator(`link[rel="alternate"][hreflang="${alternateLocale}"]`),
      ).toHaveAttribute('href', new RegExp(`/${alternateLocale}/${typePath}/${id}$`));
    }
    await expect(outsiderPage.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      new RegExp(`${normalizedPath}$`),
    );
    await expect(outsiderPage.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      new RegExp(`${normalizedPath}/opengraph-image$`),
    );
    await expect(outsiderPage.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      new RegExp(`${normalizedPath}/opengraph-image$`),
    );
    const normalizedJsonLd = JSON.parse(
      (await outsiderPage.locator('script[type="application/ld+json"]').textContent()) ?? 'null',
    );
    expect(normalizedJsonLd.url).toContain(normalizedPath);
  }

  for (const entity of ['teachers', 'groups'] as const) {
    await outsiderPage.goto(`/${locale}/${entity}/ffffffff-ffff-4fff-8fff-ffffffffffff`);
    await expect(outsiderPage.locator('html')).toHaveAttribute('lang', locale);
    await expect(outsiderPage.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr',
    );
    await expect(
      outsiderPage.getByRole('heading', {
        name: locale === 'ar' ? 'الصفحة غير موجودة' : 'Page not found',
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      outsiderPage.locator('main').getByRole('link', {
        name: locale === 'ar' ? 'الرئيسية' : 'Home',
        exact: true,
      }),
    ).toHaveAttribute('href', `/${locale}`);
    await expect
      .poll(() =>
        outsiderPage
          .locator('meta[name="robots"]')
          .evaluateAll(tags => tags.some(tag => tag.getAttribute('content')?.includes('noindex'))),
      )
      .toBe(true);
    await expect(outsiderPage.locator('script[type="application/ld+json"]')).toHaveCount(0);

    const missingImage = await outsiderPage.request.get(
      `/${locale}/${entity}/ffffffff-ffff-4fff-8fff-ffffffffffff/opengraph-image`,
    );
    expect(missingImage.status()).toBe(404);
    const missingUppercaseImage = await outsiderPage.request.get(
      `/${locale}/${entity}/FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF/opengraph-image`,
    );
    expect(missingUppercaseImage.status()).toBe(404);
  }
});
