import { test, expect, fixtureData } from './support/fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const routes = [
  {
    path: (locale: string) => `/${locale}/student`,
    heading: (ar: boolean) => (ar ? 'أهلاً،' : 'Welcome back'),
  },
  {
    path: (locale: string) => `/${locale}/student/classes`,
    heading: (ar: boolean) => (ar ? 'مجموعاتي' : 'My classes'),
  },
  {
    path: (locale: string) => `/${locale}/student/bookings`,
    heading: (ar: boolean) => (ar ? 'الحجوزات' : 'Bookings'),
  },
  {
    path: (locale: string) => `/${locale}/student/recommendations`,
    heading: (ar: boolean) => (ar ? 'اقتراحات لمجموعات تعليمية' : 'Suggested learning groups'),
  },
  {
    path: (locale: string) => `/${locale}/timetable`,
    heading: (ar: boolean) => (ar ? 'جدولي الدراسي' : 'My timetable'),
  },
];

async function expectSettledShell(page: import('@playwright/test').Page, locale: string) {
  await expect(page.locator('[data-header-account-skeleton="true"]')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }),
  ).toBeVisible();
}

async function prepareScreenshot(
  page: import('@playwright/test').Page,
  locale: string,
  mobile: boolean,
) {
  await expectSettledShell(page, locale);
  await expect(page.getByRole('main')).toBeVisible();
  if (mobile) await expect(page.locator('[data-mobile-workspace-nav]')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test('settled student workspace routes stay navigable and fit the viewport', async ({
  studentPage,
}, testInfo) => {
  const ar = testInfo.project.name.startsWith('ar-');
  const mobile = testInfo.project.name.endsWith('mobile');
  const locale = ar ? 'ar' : 'en';
  const results: Array<{ route: string; width: number; height: number }> = [];

  for (const route of routes) {
    await studentPage.goto(route.path(locale));
    await expect(studentPage.getByRole('main')).toBeVisible();
    await expect(studentPage.getByRole('heading', { level: 1 })).toBeVisible();
    if (route.path(locale).endsWith('/classes')) {
      const group = studentPage.getByRole('link', { name: 'E2E mathematics group', exact: true });
      await expect(group).toBeVisible();
      await group.click();
      await expect(
        studentPage.getByRole('heading', { name: 'E2E mathematics group', level: 1 }),
      ).toBeVisible();
      for (const [view, title] of [
        ['upcoming', 'E2E upcoming lesson'],
        ['history', 'E2E completed lesson'],
      ] as const) {
        await studentPage.goto(
          `${route.path(locale)}/${fixtureData(testInfo.project.name).ids.groupId}?view=lessons&lessons=${view}`,
        );
        await expect(studentPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
        await prepareScreenshot(studentPage, locale, mobile);
        const classShot = await studentPage.screenshot({ fullPage: true, animations: 'disabled' });
        await testInfo.attach(`${testInfo.project.name}-class-${view}`, {
          body: classShot,
          contentType: 'image/png',
        });
      }
      await studentPage.goto(route.path(locale));
      await expect(
        studentPage.getByRole('heading', { name: route.heading(ar), level: 1 }),
      ).toBeVisible();
      await expect(
        studentPage.getByRole('link', { name: 'E2E mathematics group', exact: true }),
      ).toBeVisible();
    }
    if (route.path(locale) === `/${locale}/student`) {
      await expect(studentPage.getByText('E2E upcoming lesson', { exact: true })).toBeVisible();
      await expect(
        studentPage.getByRole('link', {
          name: ar ? 'افتح الحصة واستعد' : 'Open lesson & get ready',
        }),
      ).toBeVisible();
    }
    if (route.path(locale).endsWith('/student/bookings')) {
      await expect(
        studentPage.getByRole('heading', { name: 'E2E mathematics group' }),
      ).toBeVisible();
      await expect(
        studentPage.getByText(ar ? 'قيد الانتظار' : 'Pending', { exact: true }),
      ).toBeVisible();
      const pendingBooking = studentPage
        .getByRole('main')
        .locator('section')
        .filter({ hasText: ar ? 'قيد الانتظار' : 'Pending' })
        .filter({ has: studentPage.getByRole('heading', { name: 'E2E mathematics group' }) });
      await expect(pendingBooking.getByText(ar ? 'توقيت القاهرة' : 'Cairo time')).toBeVisible();
      await expect(
        studentPage.getByRole('link', { name: ar ? 'عرض المجموعة' : 'View group' }).first(),
      ).toBeVisible();
    }
    if (route.path(locale).endsWith('/student/recommendations')) {
      await expect(studentPage.locator('main a[href*="/groups/"]').first()).toBeVisible();
    }
    if (route.path(locale).endsWith('/timetable')) {
      const { actors, ids } = fixtureData(testInfo.project.name);
      const login = await studentPage.request.post(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          headers: { apikey: anonKey, 'Content-Type': 'application/json' },
          data: { email: actors.student.email, password: actors.student.password },
        },
      );
      expect(login.ok()).toBeTruthy();
      const session = (await login.json()) as { access_token?: string };
      const lessonResponse = await studentPage.request.get(
        `${supabaseUrl}/rest/v1/lessons?id=eq.${ids.futureLessonId}&select=starts_at`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } },
      );
      expect(lessonResponse.ok()).toBeTruthy();
      const [lesson] = (await lessonResponse.json()) as Array<{ starts_at: string }>;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(lesson.starts_at));
      const lessonDate = `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
      await expect(
        studentPage.getByRole('navigation', { name: ar ? 'أيام الأسبوع' : 'Days of the week' }),
      ).toBeVisible();
      const weeks = studentPage.getByRole('navigation', {
        name: ar ? 'التنقل بين الأسابيع' : 'Week navigation',
      });
      await weeks.getByRole('link', { name: ar ? 'التالي' : 'Next' }).click();
      await studentPage.locator(`a[href*="day=${lessonDate}"]`).click();
      await expect(
        studentPage.getByRole('heading', { name: 'E2E upcoming lesson', exact: true }),
      ).toBeVisible();
    }
    await expect(studentPage.getByRole('heading', { level: 1 })).toContainText(route.heading(ar));
    const dimensions = await studentPage.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(dimensions.scrollWidth, `${route.path(locale)} horizontal overflow`).toBeLessThanOrEqual(
      dimensions.width + 1,
    );
    results.push({ route: route.path(locale), width: dimensions.width, height: dimensions.height });
    await prepareScreenshot(studentPage, locale, mobile);
    const screenshot = await studentPage.screenshot({ fullPage: true, animations: 'disabled' });
    await testInfo.attach(
      `${testInfo.project.name}-${route.path(locale).split('/').filter(Boolean).slice(1).join('-') || 'dashboard'}`,
      {
        body: screenshot,
        contentType: 'image/png',
      },
    );
  }

  if (mobile) {
    const more = studentPage.locator(
      '[data-mobile-workspace-nav] button[aria-controls="mobile-workspace-more"]',
    );
    await more.focus();
    await expect(more).toBeFocused();
    await studentPage.keyboard.press('Enter');
    const menu = studentPage.getByRole('region', {
      name: ar ? 'روابط إضافية' : 'More workspace links',
    });
    await expect(menu).toBeVisible();
    const close = studentPage.getByRole('button', { name: ar ? 'إغلاق' : 'Close' });
    await expect(close).toBeFocused();
    await studentPage.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
  }
  expect(results).toHaveLength(routes.length);
});
