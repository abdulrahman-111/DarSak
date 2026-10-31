import { test, expect, fixtureData, storageStatePath } from './support/fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const tokens = new Map<string, Promise<string>>();

async function accessToken(
  page: import('@playwright/test').Page,
  actor: 'student' | 'outsider' | 'notificationStudent',
) {
  const key = `${test.info().project.name}:${actor}`;
  let token = tokens.get(key);
  if (!token) {
    token = requestAccessToken(page, actor);
    tokens.set(key, token);
  }
  return token;
}

async function requestAccessToken(
  page: import('@playwright/test').Page,
  actor: 'student' | 'outsider' | 'notificationStudent',
) {
  const { actors } = fixtureData(test.info().project.name);
  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email: actors[actor].email, password: actors[actor].password },
  });
  expect(response.ok(), `local Auth password grant: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

async function restRows<T>(
  page: import('@playwright/test').Page,
  actor: 'student' | 'outsider',
  path: string,
) {
  const token = await accessToken(page, actor);
  const response = await page.request.get(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `${actor} REST request ${path}: ${response.status()}`).toBeTruthy();
  return (await response.json()) as T;
}

test('an outsider cannot see another student’s class, lesson, or private resource', async ({
  studentPage,
  outsiderPage,
}) => {
  const locale = test.info().project.name.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(test.info().project.name);

  await outsiderPage.goto(`/${locale}/student/classes`);
  await expect(outsiderPage.getByText('E2E mathematics group', { exact: true })).toHaveCount(0);
  await outsiderPage.goto(`/${locale}/student/classes/${ids.groupId}`);
  await expect(outsiderPage.getByText('E2E mathematics group', { exact: true })).toHaveCount(0);
  await outsiderPage.goto(`/${locale}/student/lessons/${ids.futureLessonId}`);
  await expect(outsiderPage.getByText('E2E upcoming lesson', { exact: true })).toHaveCount(0);
  await expect(outsiderPage.getByText('E2E algebra resource', { exact: true })).toHaveCount(0);

  // These requests go straight to local PostgREST with each browser's real JWT and the local anon key.
  const groupFilter = `groups?select=id&id=eq.${ids.groupId}`;
  const lessonFilter = `lessons?select=id&id=eq.${ids.futureLessonId}`;
  const resourceFilter = `lesson_materials?select=id&lesson_id=eq.${ids.futureLessonId}&title=eq.E2E%20algebra%20resource`;
  expect(await restRows<unknown[]>(outsiderPage, 'outsider', groupFilter)).toEqual([]);
  expect(await restRows<unknown[]>(outsiderPage, 'outsider', lessonFilter)).toEqual([]);
  expect(await restRows<unknown[]>(outsiderPage, 'outsider', resourceFilter)).toEqual([]);

  await studentPage.goto(`/${locale}/student/classes/${ids.groupId}?view=lessons`);
  await expect(studentPage.getByText('E2E mathematics group', { exact: true })).toBeVisible();
  await expect(studentPage.getByText('E2E upcoming lesson', { exact: true })).toBeVisible();
  await studentPage.goto(`/${locale}/student/lessons/${ids.futureLessonId}`);
  await expect(studentPage.getByText('E2E algebra resource', { exact: true })).toBeVisible();
  expect(await restRows<unknown[]>(studentPage, 'student', groupFilter)).toHaveLength(1);
  expect(await restRows<unknown[]>(studentPage, 'student', lessonFilter)).toHaveLength(1);
  expect(await restRows<unknown[]>(studentPage, 'student', resourceFilter)).toHaveLength(1);

  // The security-definer RPC applies the same per-user scope: only the enrolled student sees the seeded notice.
  const notificationRpc = `${supabaseUrl}/rest/v1/rpc/notifications_page`;
  const rpc = async (
    page: typeof studentPage,
    actor: 'student' | 'outsider' | 'notificationStudent',
  ) => {
    const token = await accessToken(page, actor);
    const response = await page.request.post(notificationRpc, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { p_offset: 0, p_limit: 20 },
    });
    expect(response.ok(), `notifications_page RPC: ${response.status()}`).toBeTruthy();
    return response.json();
  };
  const outsiderNotifications = await rpc(outsiderPage, 'outsider');
  const notificationStudentNotifications = await rpc(studentPage, 'notificationStudent');
  expect(JSON.stringify(outsiderNotifications)).not.toContain(ids.notificationId);
  expect(JSON.stringify(notificationStudentNotifications)).toContain(ids.notificationId);
});

test('warmed student pages do not survive a same-browser logout, account switch, or back navigation', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = project.startsWith('ar-') ? 'ar' : 'en';
  const { actors, ids } = fixtureData(project);
  const mobile = project.endsWith('mobile');
  // This isolated UI login session never touches the globally saved student fixture session.
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? test.info().project.use.baseURL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: locale === 'ar' ? 'ar-EG' : 'en-US',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  const page = await context.newPage();
  const logoutName = locale === 'ar' ? 'تسجيل الخروج' : 'Log out';
  const loginAs = async (email: string, password: string) => {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await Promise.all([
      page.waitForURL(url => !url.pathname.endsWith('/login')),
      page.locator('form button[type="submit"]').click(),
    ]);
  };
  const assertNoMemberData = async () => {
    await expect(page.getByText('E2E mathematics group', { exact: true })).toHaveCount(0);
    await expect(page.getByText('E2E upcoming lesson', { exact: true })).toHaveCount(0);
    await expect(page.getByText('E2E algebra resource', { exact: true })).toHaveCount(0);
    await expect(page.getByText('E2E Student', { exact: true })).toHaveCount(0);
  };

  try {
    await page.goto(`/${locale}/login`);
    await loginAs(actors.student.email, actors.student.password);

    // Use the app's links so these routes live in the client router cache.
    const classesHref = `/${locale}/student/classes`;
    const classHref = `/${locale}/student/classes/${ids.groupId}`;
    const lessonHref = `/${locale}/student/lessons/${ids.futureLessonId}`;
    await page.locator(`a[href="${classesHref}"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`${classesHref}$`));
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'E2E mathematics group', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${classHref}$`));
    await expect(page.getByText('E2E mathematics group', { exact: true })).toBeVisible();
    await page
      .getByRole('link', { name: locale === 'ar' ? 'الاستعداد للحصة' : 'Prepare for lesson' })
      .click();
    await expect(page).toHaveURL(new RegExp(`${lessonHref}$`));
    await expect(page.getByText('E2E upcoming lesson', { exact: true })).toBeVisible();

    // The app's logout action uses Supabase local scope, preserving the shared fixture session.
    await page.getByRole('button', { name: logoutName }).click();
    const loginHref = `/${locale}/login`;
    await expect(page.locator(`a[href="${loginHref}"]:visible`).first()).toBeVisible();
    // Follow the actual landing-page login link to preserve the in-memory router cache.
    await page.locator(`a[href="${loginHref}"]:visible`).first().click();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await loginAs(actors.outsider.email, actors.outsider.password);
    await expect(page).toHaveURL(new RegExp(`/${locale}/student/?$`));
    await assertNoMemberData();

    // Browser back revisits routes warmed as member A; require a settled denial with no stale content.
    const warmRoutesSeen = new Set<string>();
    for (let step = 0; step < 8; step += 1) {
      const previousUrl = page.url();
      await page.goBack();
      if (page.url() === previousUrl) break;
      await assertNoMemberData();
      const pathname = new URL(page.url()).pathname;
      if (pathname === classHref || pathname === lessonHref) warmRoutesSeen.add(pathname);
      if (warmRoutesSeen.has(classHref) && warmRoutesSeen.has(lessonHref)) break;
    }
    expect(warmRoutesSeen.has(classHref) || warmRoutesSeen.has(lessonHref)).toBe(true);
  } finally {
    await context.close();
  }
});

test('guest navigation denies student routes and wrong-role navigation returns to the teacher workspace', async ({
  browser,
}) => {
  const project = test.info().project.name;
  const locale = project.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(project);
  const mobile = project.endsWith('mobile');
  const baseURL = process.env.E2E_BASE_URL ?? test.info().project.use.baseURL;
  const routes = [
    `/${locale}/student/classes/${ids.groupId}`,
    `/${locale}/student/lessons/${ids.futureLessonId}`,
  ];
  for (const storageState of [undefined, storageStatePath(project, 'teacher')]) {
    const context = await browser.newContext({
      baseURL,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      locale: locale === 'ar' ? 'ar-EG' : 'en-US',
      ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
      ...(storageState ? { storageState } : {}),
    });
    try {
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(route);
        if (!storageState) {
          // Wait for the settled guest denial before checking the entire DOM, including hidden text.
          await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
          await expect(page.locator('input[name="email"]')).toBeVisible();
          await expect(page.getByText('E2E mathematics group', { exact: true })).toHaveCount(0);
          await expect(page.getByText('E2E upcoming lesson', { exact: true })).toHaveCount(0);
          await expect(page.getByText('E2E algebra resource', { exact: true })).toHaveCount(0);
        } else {
          // A teacher may legitimately see their own seeded lesson on their dashboard.
          // The destination and role shell prove that the requested student route was denied.
          await expect(page).toHaveURL(new RegExp(`/${locale}/teacher/?$`));
          // The teacher loading skeleton has no heading; wait for the settled dashboard itself.
          await expect(page.locator('main h1')).toBeVisible();
          await expect(
            page.locator(
              `nav[aria-label="${locale === 'ar' ? 'تنقل الطالب' : 'Student navigation'}"]`,
            ),
          ).toHaveCount(0);
          await expect(
            page.locator(`[data-mobile-workspace-nav] a[href^="/${locale}/student/"]`),
          ).toHaveCount(0);
        }
      }
    } finally {
      await context.close();
    }
  }
});
