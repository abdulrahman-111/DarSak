import { test, expect, fixtureData, storageStatePath } from './support/fixtures';

function localeFor(project: string) {
  return project.startsWith('ar-') ? 'ar' : 'en';
}

function workspaceRoleLabel(locale: string, role: 'student' | 'teacher') {
  if (locale === 'ar') return role === 'student' ? 'تنقل الطالب' : 'تنقل المعلم';
  return `${role === 'student' ? 'Student' : 'Teacher'} navigation`;
}

async function fixtureContext(
  browser: import('@playwright/test').Browser,
  project: string,
  actor: 'student' | 'teacher' | 'viewerStudent',
) {
  const locale = localeFor(project);
  const mobile = project.endsWith('mobile');
  return browser.newContext({
    storageState: storageStatePath(project, actor),
    baseURL: process.env.E2E_BASE_URL ?? test.info().project.use.baseURL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: locale === 'ar' ? 'ar-EG' : 'en-US',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
}

async function expectKnownUnreadCount(page: import('@playwright/test').Page, project: string) {
  if (project.endsWith('mobile')) {
    const more = page.locator(
      '[data-mobile-workspace-nav] button[aria-controls="mobile-workspace-more"]',
    );
    await expect(more).toContainText('1');
  } else {
    const notification = page.locator('aside a[href$="/notifications"] span[aria-label]');
    await expect(notification).toHaveText('1');
  }
}

async function expectUnknownUnreadCount(page: import('@playwright/test').Page, project: string) {
  if (project.endsWith('mobile')) {
    const more = page.locator(
      '[data-mobile-workspace-nav] button[aria-controls="mobile-workspace-more"]',
    );
    await expect(more).not.toContainText(/\d/);
    await more.click();
    await expect(
      page.locator('#mobile-workspace-more a[href$="/notifications"] span[aria-label]'),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
  } else {
    const notification = page.locator('aside a[href$="/notifications"] span[aria-label]');
    await expect(notification).toHaveCount(0);
  }
}

async function expectSettledStudentShell(page: import('@playwright/test').Page, locale: string) {
  await expect(page.locator('[data-header-account-skeleton="true"]')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }),
  ).toBeVisible();
  if (test.info().project.name.endsWith('mobile')) {
    await expect(page.locator('[data-mobile-workspace-nav]')).toHaveCount(1);
    await expect(page.locator('[data-mobile-workspace-nav]')).toContainText(
      locale === 'ar' ? 'الرئيسية' : 'Home',
    );
  } else {
    await expect(
      page.getByRole('navigation', { name: workspaceRoleLabel(locale, 'student') }),
    ).toBeVisible();
    await expect(page.locator('aside')).toContainText(locale === 'ar' ? 'الطالب' : 'Student space');
  }
}

test('cold 503 viewer response keeps the real student workspace usable', async ({ browser }) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const context = await fixtureContext(browser, project, 'viewerStudent');
  const failViewer = (route: import('@playwright/test').Route) =>
    route.fulfill({ status: 503, body: 'unavailable' });
  try {
    const page = await context.newPage();
    await page.route('**/api/viewer', failViewer);
    const failedRead = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer' && response.status() === 503;
    });
    await page.goto(`/${locale}/student/classes`);
    expect((await failedRead).status()).toBe(503);
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();
    await expectSettledStudentShell(page, locale);
    await expectUnknownUnreadCount(page, project);
    await page.unroute('**/api/viewer', failViewer);
    const recoveredRead = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer' && response.status() === 200;
    });
    await page.reload();
    expect((await recoveredRead).status()).toBe(200);
    await expectKnownUnreadCount(page, project);
  } finally {
    await context.close();
  }
});

test('cold network abort falls back to the current server-authorized student shell', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const context = await fixtureContext(browser, project, 'viewerStudent');
  const abortViewer = (route: import('@playwright/test').Route) => route.abort();
  try {
    const page = await context.newPage();
    await page.route('**/api/viewer', abortViewer);
    const failedRead = page.waitForEvent('requestfailed', request => {
      return new URL(request.url()).pathname === '/api/viewer';
    });
    await page.goto(`/${locale}/student/classes`);
    expect(new URL((await failedRead).url()).pathname).toBe('/api/viewer');
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();
    await expectSettledStudentShell(page, locale);
    await expectUnknownUnreadCount(page, project);
    await page.unroute('**/api/viewer', abortViewer);
    const recoveredRead = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer' && response.status() === 200;
    });
    await page.reload();
    expect((await recoveredRead).status()).toBe(200);
    await expectKnownUnreadCount(page, project);
  } finally {
    await context.close();
  }
});

test('warm viewer failure preserves the verified student and recovers on the next route', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const context = await fixtureContext(browser, project, 'viewerStudent');
  let failNext = false;
  try {
    const page = await context.newPage();
    await page.route('**/api/viewer', route => {
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, body: 'unavailable' });
      }
      return route.continue();
    });
    const initialViewerResponse = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer';
    });
    await page.goto(`/${locale}/student/classes`);
    expect((await initialViewerResponse).status()).toBe(200);
    await expect(
      page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }),
    ).toBeVisible();

    failNext = true;
    const failedRead = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer' && response.status() === 503;
    });
    await page.locator(`a[href="/${locale}/student"]:visible`).first().click();
    expect((await failedRead).status()).toBe(503);
    await expectSettledStudentShell(page, locale);
    await expectKnownUnreadCount(page, project);

    const recoveredRead = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer' && response.status() === 200;
    });
    await page.locator(`a[href="/${locale}/timetable"]:visible`).first().click();
    expect((await recoveredRead).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/${locale}/timetable$`));
    if (project.endsWith('mobile'))
      await expect(page.locator('[data-mobile-workspace-nav]')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a real delayed viewer response cannot restore the student after UI logout', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const context = await fixtureContext(browser, project, 'student');
  let delayNext = false;
  let holdActive = false;
  let release!: () => void;
  let captured!: (response: import('@playwright/test').APIResponse) => void;
  let markDelivered!: () => void;
  const delayed = new Promise<void>(resolve => {
    release = resolve;
  });
  const delivered = new Promise<void>(resolve => {
    markDelivered = resolve;
  });
  const responseCaptured = new Promise<import('@playwright/test').APIResponse>(resolve => {
    captured = resolve;
  });
  try {
    const page = await context.newPage();
    await page.route('**/api/viewer', async route => {
      if (!delayNext) return route.continue();
      delayNext = false;
      const response = await route.fetch();
      holdActive = true;
      captured(response);
      await delayed;
      try {
        await route.fulfill({ response });
      } finally {
        holdActive = false;
        markDelivered();
      }
    });
    const initialViewerResponse = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer';
    });
    await page.goto(`/${locale}/student/classes`);
    expect((await initialViewerResponse).status()).toBe(200);
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }),
    ).toBeVisible();

    delayNext = true;
    const delayedViewerResponse = page.waitForResponse(response => {
      return new URL(response.url()).pathname === '/api/viewer';
    });
    await page.locator(`a[href="/${locale}/student"]:visible`).first().click();
    const actualViewerResponse = await responseCaptured;
    expect(actualViewerResponse.status()).toBe(200);
    await page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }).click();
    await expect(page.locator(`a[href="/${locale}/login"]:visible`).first()).toBeVisible();
    release();
    expect((await delayedViewerResponse).status()).toBe(200);
    await delivered;

    await expect(page.locator('[data-header-account-skeleton="true"]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }),
    ).toHaveCount(0);
    await expect(page.locator('[data-mobile-workspace-nav]')).toHaveCount(0);
    await expect(page.getByText('E2E Student', { exact: true })).toHaveCount(0);
  } finally {
    release();
    if (holdActive) await delivered;
    await context.close();
  }
});

test('student, teacher, and guest role boundaries settle on the authorized destination', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const { actors, ids } = fixtureData(project);
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? test.info().project.use.baseURL,
    viewport: project.endsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    locale: locale === 'ar' ? 'ar-EG' : 'en-US',
    ...(project.endsWith('mobile') ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  const page = await context.newPage();
  const loginAs = async (email: string, password: string) => {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await Promise.all([
      page.waitForURL(url => !url.pathname.endsWith('/login')),
      page.locator('form button[type="submit"]').click(),
    ]);
  };
  try {
    await page.goto(`/${locale}/teacher/lessons`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
    await loginAs(actors.student.email, actors.student.password);
    await page.goto(`/${locale}/teacher/lessons`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/student/?$`));
    if (project.endsWith('mobile')) {
      await expect(page.locator('[data-mobile-workspace-nav]')).toHaveCount(1);
      await expect(
        page.locator(`[data-mobile-workspace-nav] a[href^="/${locale}/teacher/"]`),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('navigation', { name: workspaceRoleLabel(locale, 'student') }),
      ).toBeVisible();
    }
    await page.locator(`a[href="/${locale}/student/classes"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/student/classes$`));
    await page.getByRole('link', { name: 'E2E mathematics group', exact: true }).click();
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }).click();
    await expect(page.locator(`a[href="/${locale}/login"]:visible`).first()).toBeVisible();
    await page.locator(`a[href="/${locale}/login"]:visible`).first().click();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await loginAs(actors.teacher.email, actors.teacher.password);
    await page.locator(`a[href="/${locale}/teacher/lessons"]:visible`).first().click();
    await expect(page.locator('main h1')).toBeVisible();
    if (project.endsWith('mobile')) {
      const nav = page.locator('[data-mobile-workspace-nav]');
      await expect(nav).toHaveCount(1);
      await expect(nav.locator(`a[href^="/${locale}/teacher/"]`).first()).toBeVisible();
      await expect(nav.locator(`a[href^="/${locale}/student/"]`)).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('navigation', { name: workspaceRoleLabel(locale, 'teacher') }),
      ).toBeVisible();
    }

    await page.goto(`/${locale}/student/classes/${ids.groupId}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/teacher/?$`));
    await expect(page.locator('main h1')).toBeVisible();
    await expect(
      page.getByRole('navigation', {
        name: locale === 'ar' ? 'أقسام المجموعة' : 'Class sections',
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(0);
    if (project.endsWith('mobile')) {
      await expect(
        page.locator(`[data-mobile-workspace-nav] a[href^="/${locale}/student/"]`),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('navigation', { name: workspaceRoleLabel(locale, 'student') }),
      ).toHaveCount(0);
    }
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${locale}/teacher/lessons$`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/${locale}/teacher/?$`));
    await expect(page.locator('main h1')).toBeVisible();
    await expect(
      page.getByRole('navigation', {
        name: locale === 'ar' ? 'أقسام المجموعة' : 'Class sections',
        exact: true,
        includeHidden: true,
      }),
    ).toHaveCount(0);
    if (project.endsWith('mobile')) {
      await expect(
        page.locator(`[data-mobile-workspace-nav] a[href^="/${locale}/student/"]`),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('navigation', { name: workspaceRoleLabel(locale, 'student') }),
      ).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test('guest can browse a public group to registration without submitting signup', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const mobile = project.endsWith('mobile');
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? test.info().project.use.baseURL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: locale === 'ar' ? 'ar-EG' : 'en-US',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  try {
    const page = await context.newPage();
    await page.goto(`/${locale}`);
    await page
      .getByRole('link', { name: locale === 'ar' ? 'ابحث عن مجموعة' : 'Find a group' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/teachers$`));
    const publicGroupLink = page.locator(`a[href^="/${locale}/groups/"]`).first();
    await expect(publicGroupLink).toBeVisible();
    const publicGroupHref = await publicGroupLink.getAttribute('href');
    expect(publicGroupHref).toMatch(new RegExp(`^/${locale}/groups/[^/]+$`));
    await publicGroupLink.click();
    await expect(page).toHaveURL(new RegExp(`${locale}/groups/[^/]+$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-request-action]')).toBeVisible();
    await page.locator('[data-request-action]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?next=`));
    await page
      .getByRole('main')
      .getByRole('link', { name: locale === 'ar' ? 'إنشاء حساب' : 'Create account' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/register$`));
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('verified unread count survives viewer outages and clears on logout/account change', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const context = await fixtureContext(browser, project, 'viewerStudent');
  let failViewer = false;
  const expectUnread = async (page: import('@playwright/test').Page, count: string | null) => {
    if (project.endsWith('mobile')) {
      const more = page.locator(
        '[data-mobile-workspace-nav] button[aria-controls="mobile-workspace-more"]',
      );
      if (count === null) await expect(more).not.toContainText(/unread|غير مقروء/);
      else await expect(more).toContainText(count);
      await more.click();
      const menu = page.locator('#mobile-workspace-more');
      if (count === null)
        await expect(menu.locator('a[href$="/notifications"] span[aria-label]')).toHaveCount(0);
      else
        await expect(menu.locator('a[href$="/notifications"] span[aria-label]')).toHaveText(count);
      await page.keyboard.press('Escape');
    } else {
      const nav = page.getByRole('navigation', { name: workspaceRoleLabel(locale, 'student') });
      const link = nav.locator('a[href$="/notifications"]');
      if (count === null) await expect(link.locator('span[aria-label]')).toHaveCount(0);
      else await expect(link.locator('span[aria-label]')).toHaveText(count);
    }
  };
  try {
    const page = await context.newPage();
    await page.route('**/api/viewer', route =>
      failViewer ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue(),
    );
    await page.goto(`/${locale}/student/classes`);
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Viewer Student', { exact: true }).first()).toBeAttached();
    await expectUnread(page, '1');

    failViewer = true;
    const failed = page.waitForResponse(
      response => new URL(response.url()).pathname === '/api/viewer' && response.status() === 503,
    );
    await page.locator(`a[href="/${locale}/timetable"]:visible`).first().click();
    await failed;
    await expectUnread(page, '1');

    failViewer = false;
    await page.locator(`a[href="/${locale}/student/classes"]:visible`).first().click();
    await expectUnread(page, '1');
    await page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الخروج' : 'Log out' }).click();
    await expect(page.locator('[data-mobile-workspace-nav]')).toHaveCount(0);
    const loginLink = page.locator(`a[href="/${locale}/login"]:visible`).first();
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await page.locator('input[name="email"]').fill(fixtureData(project).actors.outsider.email);
    await page
      .locator('input[name="password"]')
      .fill(fixtureData(project).actors.outsider.password);
    await Promise.all([
      page.waitForURL(url => !url.pathname.endsWith('/login')),
      page.locator('form button[type="submit"]').click(),
    ]);
    await page.goto(`/${locale}/student/classes`);
    await expectUnread(page, null);
    await expect(page.getByText('E2E Viewer Student', { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
