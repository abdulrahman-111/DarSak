import { test, expect } from './support/fixtures';
import { fixtureData } from './support/data';

test('landing and public entity pages expose localized JSON-LD and valid share cards', async ({
  outsiderPage,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(testInfo.project.name);
  await outsiderPage.goto(`/${locale}`);
  await expect(outsiderPage.locator('html')).toHaveAttribute('lang', locale);
  await expect(outsiderPage.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr',
  );
  const landingGraph = JSON.parse(
    (await outsiderPage.locator('script[type="application/ld+json"]').textContent()) ?? 'null',
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
